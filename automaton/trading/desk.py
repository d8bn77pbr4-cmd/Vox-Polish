"""A day-trading desk run by three groups of AIs.

Traders trade. The Prüfer (checkers) admit a new trader only after it passed an exam on the last weeks of
data, and check every order against risk limits. The Chef (boss) reviews everyone each evening, switches
off traders that made no profit, tightens the exam when too many admitted traders fail, skims profits,
pays the creator and stops the whole desk when its loss limit is hit."""

from __future__ import annotations

import random
from dataclasses import dataclass, field, replace
from datetime import datetime, timezone
from typing import Callable, NamedTuple

from .data import BARS_PER_DAY
from .strategy import Market, Trader, TraderGenome, backtest, mutate_genome, random_genome


@dataclass
class DeskSettings:
    capital: float = 100.0
    fee: float = 0.0005  # per side: Binance USD-M futures taker fee, base tier
    slippage: float = 0.0002  # per side
    # Running costs: rule-based AIs share one small server; each AI adds a little compute.
    server_per_day: float = 0.24
    ai_per_day: float = 0.02
    # Traders
    max_traders: int = 4
    trader_share: float = 0.25  # share of desk equity a new trader may manage
    # Prüfer (checkers)
    exam_days: int = 30
    exam_min_trades: int = 10
    exam_min_profit_factor: float = 1.3
    exam_max_drawdown: float = 0.10
    candidates: int = 12  # genomes examined per hiring round
    styles: tuple[str, ...] = ("breakout", "meanrev", "trend")  # trading styles the desk may hire
    trader_daily_loss: float = 0.03  # a trader may not open new positions after losing this share today
    desk_daily_loss: float = 0.04  # all traders stop for the day after the desk lost this share today
    # Chef (boss)
    hire_every_days: int = 3
    review_days: int = 7  # a trader must be in profit over this many days, or it is switched off
    trader_max_drawdown: float = 0.08
    desk_stop: float = 0.25  # stop everything when the desk has lost this share of the capital
    payout_share: float = 0.3  # each evening, share of the not yet paid profit that goes to the creator
    seed: int = 0


class DeskDay(NamedTuple):
    day: int
    pnl: float  # trading result minus running costs
    payout: float
    equity: float  # money still on the desk
    creator: float  # creator's running result: payouts + equity - capital
    traders: int
    hired: int
    fired: int


@dataclass
class Desk:
    market: Market
    settings: DeskSettings
    log: Callable[[int, str, str], None] | None = None
    traders: list[Trader] = field(default_factory=list)
    alumni: list[tuple[float, TraderGenome]] = field(default_factory=list)  # results of former traders
    retired: list[Trader] = field(default_factory=list)
    days: list[DeskDay] = field(default_factory=list)
    events: list[tuple[int, str, str]] = field(default_factory=list)

    def __post_init__(self):
        s = self.settings
        self.rng = random.Random(s.seed)
        self.pool = s.capital  # cash not handed to a trader
        self.costs = 0.0
        self.paid_out = 0.0
        self.stopped = ""
        self.stopped_day: int | None = None
        self.exam_profit_factor = s.exam_min_profit_factor
        self.cost_per_side = s.fee + s.slippage
        self.hired = 0
        self.exams = self.exams_passed = 0
        self.early_failures: list[bool] = []  # per fired trader: did it fail its first review?
        self.next_id = 1
        self.halted_today = False
        self.day_start_equity = s.capital

    # ----- the day ----------------------------------------------------------------------------

    def run(self, first_day: int, last_day: int) -> None:
        for day in range(first_day, last_day):
            self.trade_day(day)

    def trade_day(self, day: int) -> None:
        s = self.settings
        if self.stopped:
            self.days.append(DeskDay(day, 0.0, 0.0, self.equity, self.creator_result, 0, 0, 0))
            return
        hired = self.chef_hire(day) if day % s.hire_every_days == 0 or not self.traders else 0
        self.day_start_equity = self.equity
        self.halted_today = False
        for t in self.traders:
            t.start_day()
        for i in range(day * BARS_PER_DAY, (day + 1) * BARS_PER_DAY):
            for t in self.traders:
                t.step(self.market, i, self.pruefer_allows)
            if not self.halted_today and self.equity < self.day_start_equity * (1 - s.desk_daily_loss):
                self.halted_today = True
                self.note(day, "Prüfer", f"Tagesverlustgrenze des Desks erreicht, keine neuen Positionen mehr heute")
        for t in self.traders:
            t.end_day()

        trading = sum(t.daily[-1] for t in self.traders)
        costs = s.server_per_day + s.ai_per_day * (len(self.traders) + 2)  # traders, Prüfer, Chef
        self.pool -= costs
        self.costs += costs
        fired = self.chef_review(day)
        self.chef_skim()
        payout = self.chef_pay()
        self.chef_check_stop(day)
        self.days.append(DeskDay(day, trading - costs, payout, self.equity, self.creator_result,
                                 len(self.traders), hired, fired))

    # ----- Prüfer -------------------------------------------------------------------------------

    def pruefer_allows(self, trader: Trader, _i: int) -> bool:
        """Risk check before every new position."""
        if self.halted_today:
            return False
        return trader.day_pnl > -self.settings.trader_daily_loss * trader.allocation

    def pruefer_exam(self, genome: TraderGenome, day: int):
        s = self.settings
        self.exams += 1
        exam = backtest(genome, self.market, day - s.exam_days, day, self.cost_per_side,
                        daily_loss_limit=s.trader_daily_loss)
        ok = exam.passed(s.exam_min_trades, self.exam_profit_factor, s.exam_max_drawdown)
        self.exams_passed += ok
        return exam, ok

    # ----- Chef ---------------------------------------------------------------------------------

    def chef_hire(self, day: int) -> int:
        s = self.settings
        if day < s.exam_days:
            return 0
        hired = 0
        while len(self.traders) < s.max_traders and self.pool > 0.05 * s.capital:
            candidates = [self._candidate() for _ in range(s.candidates)]
            results = [(g, *self.pruefer_exam(g, day)) for g in candidates]
            passed = [(e.pnl, g, e) for g, e, ok in results if ok]
            if not passed:
                self.note(day, "Prüfer", f"Keiner von {len(candidates)} Kandidaten hat die Prüfung bestanden")
                break
            _, genome, exam = max(passed, key=lambda p: p[0])
            allocation = min(self.pool, self.equity * s.trader_share)
            self.pool -= allocation
            trader = Trader(f"T{self.next_id}", genome, allocation, allocation, day, self.cost_per_side)
            self.next_id += 1
            self.traders.append(trader)
            self.hired += 1
            hired += 1
            self.note(day, "Chef", f"{trader.id} eingestellt: {genome.label()}, {allocation:.2f} $ "
                                   f"(Prüfung: {exam.pnl:+.1f} % in {s.exam_days} Tagen, {exam.trades} Trades)")
        return hired

    def _candidate(self) -> TraderGenome:
        """Mostly offspring of the best traders so far, sometimes a newcomer."""
        parents = sorted(self.alumni + [(t.total, t.genome) for t in self.traders], key=lambda a: a[0], reverse=True)
        good = [g for score, g in parents[:5] if score > 0]
        for _ in range(50):
            if good and self.rng.random() < 0.7:
                genome = mutate_genome(self.rng.choice(good), self.rng, self.rng.choice((1, 2)))
            else:
                genome = random_genome(self.rng)
            if genome.style in self.settings.styles and genome.symbol in self.market.symbols:
                return genome
        return replace(genome, style=self.rng.choice(self.settings.styles),
                       symbol=self.rng.choice(self.market.symbols))

    def chef_review(self, day: int) -> int:
        s = self.settings
        fired = 0
        for t in list(self.traders):
            age = day - t.hired_day + 1
            recent = sum(t.daily[-s.review_days:]) - s.ai_per_day * min(age, s.review_days)
            reason = ""
            if t.drawdown() > s.trader_max_drawdown:
                reason = f"Drawdown {t.drawdown():.0%}"
            elif age >= s.review_days and recent <= 0:
                reason = f"kein Gewinn in {s.review_days} Tagen ({recent:+.2f} $)"
            if reason:
                self.traders.remove(t)
                self.retired.append(t)
                self.pool += t.capital
                self.alumni.append((t.total, t.genome))
                self.early_failures.append(age <= s.review_days + 1)
                fired += 1
                self.note(day, "Chef", f"{t.id} abgeschaltet: {reason}. Gesamt {t.total:+.2f} $ in {age} Tagen")
        if fired:
            self._tune_exam(day)
        return fired

    def _tune_exam(self, day: int) -> None:
        """If most admitted traders fail their first review, the exam was too easy."""
        recent = self.early_failures[-8:]
        if len(recent) < 4:
            return
        rate = sum(recent) / len(recent)
        if rate > 0.5 and self.exam_profit_factor < 2.5:
            self.exam_profit_factor = round(self.exam_profit_factor + 0.1, 2)
            self.note(day, "Chef", f"Prüfer muss strenger werden: Gewinnfaktor jetzt mindestens {self.exam_profit_factor}")
        elif rate < 0.25 and self.exam_profit_factor > 1.1:
            self.exam_profit_factor = round(self.exam_profit_factor - 0.05, 2)

    def chef_skim(self) -> None:
        """Traders keep their allocation; anything above it goes back to the desk each evening."""
        for t in self.traders:
            if t.capital > t.allocation:
                self.pool += t.capital - t.allocation
                t.capital = t.allocation
                t.peak = max(t.peak, t.capital)

    def chef_pay(self) -> float:
        unpaid = self.equity - self.settings.capital
        amount = min(self.pool, self.settings.payout_share * unpaid) if unpaid > 0 else 0.0
        if amount > 0:
            self.pool -= amount
            self.paid_out += amount
        return amount

    def chef_check_stop(self, day: int) -> None:
        s = self.settings
        if self.equity <= s.capital * (1 - s.desk_stop):
            for t in self.traders:
                self.pool += t.capital
                self.alumni.append((t.total, t.genome))
            self.retired.extend(self.traders)
            self.traders.clear()
            self.stopped = f"Verlustgrenze von {s.desk_stop:.0%} erreicht"
            self.stopped_day = day
            self.note(day, "Chef", f"Desk gestoppt: {self.stopped}. Restgeld {self.pool:.2f} $ bleibt dir.")

    # ----- figures --------------------------------------------------------------------------------

    @property
    def equity(self) -> float:
        return self.pool + sum(t.capital + self._open_value(t) for t in self.traders)

    @staticmethod
    def _open_value(_t: Trader) -> float:
        return 0.0  # positions are valued at entry until closed; all are closed by the evening

    @property
    def creator_result(self) -> float:
        return self.paid_out + self.equity - self.settings.capital

    def note(self, day: int, role: str, text: str) -> None:
        self.events.append((day, role, text))
        if self.log:
            self.log(day, role, text)


def date_of(market: Market, day: int) -> str:
    return datetime.fromtimestamp(market.t[day * BARS_PER_DAY], tz=timezone.utc).strftime("%Y-%m-%d")
