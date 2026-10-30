"""Trader genomes and the trading engine.

No look-ahead: a signal is computed when a bar has closed and filled at the next bar's open. Every fill
pays fee plus slippage. Stops and targets are checked against the bar's high and low; if both are
touched in one bar, the stop counts. Day trading: everything is closed at the last bar of the UTC day."""

from __future__ import annotations

import math
import random
from dataclasses import dataclass, field, replace

from .data import BARS_PER_DAY, SYMBOLS, Bar

STYLES = ("breakout", "meanrev", "trend")
NO_ENTRY_BARS = 4  # no new positions in the last hour of the day


@dataclass(frozen=True)
class TraderGenome:
    symbol: str = "BTCUSDT"
    style: str = "meanrev"  # breakout: follow a strong move | meanrev: fade it | trend: follow the slope
    lookback: int = 32  # bars for mean and spread
    threshold: float = 2.0  # how far from the mean (in standard deviations) before acting
    stop: float = 0.01  # stop loss distance
    take: float = 0.02  # profit target distance
    size: float = 0.5  # share of the trader's capital per position
    allow_short: bool = True
    max_trades_per_day: int = 4

    def label(self) -> str:
        names = {"breakout": "Ausbruch", "meanrev": "Rückkehr", "trend": "Trend"}
        return f"{self.symbol[:-4]} {names[self.style]} {self.lookback}/{self.threshold:g}"


TRADER_GENES: dict[str, list] = {
    "symbol": list(SYMBOLS),
    "style": list(STYLES),
    "lookback": [8, 16, 32, 64, 96],
    "threshold": [1.0, 1.5, 2.0, 2.5, 3.0],
    "stop": [0.005, 0.01, 0.02, 0.03],
    "take": [0.005, 0.01, 0.02, 0.04],
    "size": [0.25, 0.5, 1.0],
    "allow_short": [False, True],
    "max_trades_per_day": [1, 2, 4, 8],
}


def random_genome(rng: random.Random) -> TraderGenome:
    return TraderGenome(**{k: rng.choice(v) for k, v in TRADER_GENES.items()})


def mutate_genome(g: TraderGenome, rng: random.Random, changes: int = 1) -> TraderGenome:
    for _ in range(changes):
        name = rng.choice(sorted(TRADER_GENES))
        values = TRADER_GENES[name]
        i = values.index(getattr(g, name))
        g = replace(g, **{name: values[max(0, min(len(values) - 1, i + rng.choice((-1, 1))))]})
    return g


class Market:
    """Price arrays per symbol plus rolling mean and standard deviation, computed once per lookback."""

    def __init__(self, series: dict[str, list[Bar]]):
        self.symbols = list(series)
        first = next(iter(series.values()))
        self.n = len(first)
        self.t = [b.t for b in first]
        self.open = {s: [b.open for b in bars] for s, bars in series.items()}
        self.high = {s: [b.high for b in bars] for s, bars in series.items()}
        self.low = {s: [b.low for b in bars] for s, bars in series.items()}
        self.close = {s: [b.close for b in bars] for s, bars in series.items()}
        self.volume = {s: [b.volume for b in bars] for s, bars in series.items()}
        self._stats: dict[tuple[str, int], tuple[list[float], list[float]]] = {}
        self.cache: dict[tuple, list[float]] = {}  # indicators, see indicators.py

    @property
    def days(self) -> int:
        return self.n // BARS_PER_DAY

    def stats(self, symbol: str, lookback: int) -> tuple[list[float], list[float]]:
        key = (symbol, lookback)
        if key not in self._stats:
            closes = self.close[symbol]
            mean, sd = [math.nan] * self.n, [math.nan] * self.n
            s = s2 = 0.0
            for i, c in enumerate(closes):
                s += c
                s2 += c * c
                if i >= lookback:
                    old = closes[i - lookback]
                    s -= old
                    s2 -= old * old
                if i >= lookback - 1:
                    m = s / lookback
                    mean[i] = m
                    sd[i] = math.sqrt(max(s2 / lookback - m * m, 0.0))
            self._stats[key] = (mean, sd)
        return self._stats[key]


def signal(g: TraderGenome, market: Market, i: int) -> int:
    """+1 long, -1 short, 0 nothing, from bars up to and including i."""
    mean, sd = market.stats(g.symbol, g.lookback)
    if i < g.lookback or not sd[i] > 0:
        return 0
    if g.style == "trend":
        q = max(1, g.lookback // 4)
        if math.isnan(mean[i - q]):
            return 0
        z = (mean[i] - mean[i - q]) / sd[i] * 2
        direction = 1 if z > g.threshold else -1 if z < -g.threshold else 0
    else:
        z = (market.close[g.symbol][i] - mean[i]) / sd[i]
        direction = 1 if z > g.threshold else -1 if z < -g.threshold else 0
        if g.style == "meanrev":
            direction = -direction
    return -1 if direction < 0 and not g.allow_short else direction


def back_at_mean(g: TraderGenome, market: Market, i: int, side: int) -> bool:
    mean, _ = market.stats(g.symbol, g.lookback)
    price = market.close[g.symbol][i]
    return price >= mean[i] if side > 0 else price <= mean[i]


@dataclass
class Position:
    side: int
    entry: float
    notional: float


@dataclass
class Trader:
    """One trading AI. It sees only its own market and its own capital."""
    id: str
    genome: TraderGenome
    capital: float
    allocation: float
    hired_day: int
    cost_per_side: float
    position: Position | None = None
    pending: int = 0  # +1/-1 entry or 2 = exit, filled at the next bar's open
    trades_today: int = 0
    day_pnl: float = 0.0
    daily: list[float] = field(default_factory=list)
    trades: int = 0
    wins: int = 0
    fees: float = 0.0
    gross: float = 0.0
    peak: float = 0.0

    def __post_init__(self):
        self.peak = self.capital

    @property
    def total(self) -> float:
        return sum(self.daily)

    def drawdown(self) -> float:
        return 1 - self.capital / self.peak if self.peak > 0 else 0.0

    def start_day(self) -> None:
        self.trades_today = 0
        self.day_pnl = 0.0

    def end_day(self) -> None:
        self.daily.append(self.day_pnl)
        self.peak = max(self.peak, self.capital)

    def step(self, market: Market, i: int, may_enter) -> None:
        g = self.genome
        sym = g.symbol
        last_of_day = i % BARS_PER_DAY == BARS_PER_DAY - 1

        if self.pending == 2 and self.position:
            self._close(market.open[sym][i])
        elif self.pending in (1, -1) and not self.position and may_enter(self, i):
            self._open(self.pending, market.open[sym][i])
        self.pending = 0

        pos = self.position
        if pos:
            stop = pos.entry * (1 - pos.side * g.stop)
            take = pos.entry * (1 + pos.side * g.take)
            low, high = market.low[sym][i], market.high[sym][i]
            if (low <= stop) if pos.side > 0 else (high >= stop):
                self._close(stop)
            elif (high >= take) if pos.side > 0 else (low <= take):
                self._close(take)

        if self.position and last_of_day:
            self._close(market.close[sym][i])
            return
        if last_of_day:
            return
        if self.position:
            s = signal(g, market, i)
            if s == -self.position.side or (g.style == "meanrev" and back_at_mean(g, market, i, self.position.side)):
                self.pending = 2
        elif (self.trades_today < g.max_trades_per_day
              and i % BARS_PER_DAY < BARS_PER_DAY - NO_ENTRY_BARS):
            self.pending = signal(g, market, i)

    def _open(self, side: int, price: float) -> None:
        notional = self.capital * self.genome.size
        cost = notional * self.cost_per_side
        self.position = Position(side, price, notional)
        self._book(-cost, fee=cost)
        self.trades_today += 1

    def _close(self, price: float) -> None:
        pos = self.position
        value = pos.notional * price / pos.entry
        cost = value * self.cost_per_side
        gross = pos.side * (value - pos.notional)
        self._book(gross - cost, fee=cost)
        self.gross += gross
        self.trades += 1
        self.wins += gross - cost - pos.notional * self.cost_per_side > 0
        self.position = None

    def _book(self, amount: float, fee: float) -> None:
        self.capital += amount
        self.day_pnl += amount
        self.fees += fee


@dataclass
class Exam:
    pnl: float
    trades: int
    profit_factor: float
    max_drawdown: float
    win_days: float
    t_stat: float = 0.0  # mean daily result divided by its standard error

    def passed(self, min_trades: int, min_profit_factor: float, max_drawdown: float, min_t: float = 0.0) -> bool:
        return (self.pnl > 0 and self.trades >= min_trades and self.profit_factor >= min_profit_factor
                and self.max_drawdown <= max_drawdown and self.t_stat >= min_t)


def backtest(genome: TraderGenome, market: Market, first_day: int, last_day: int, cost_per_side: float,
             capital: float = 100.0, daily_loss_limit: float = 0.03) -> Exam:
    """Trade one genome alone over whole days [first_day, last_day), with the per-trader loss limit."""
    t = Trader("exam", genome, capital, capital, first_day, cost_per_side)

    def may_enter(tr, _i):
        return tr.day_pnl > -daily_loss_limit * capital

    for day in range(first_day, last_day):
        t.start_day()
        for i in range(day * BARS_PER_DAY, (day + 1) * BARS_PER_DAY):
            t.step(market, i, may_enter)
        t.end_day()
    gains = sum(d for d in t.daily if d > 0)
    losses = -sum(d for d in t.daily if d < 0)
    equity, peak, worst = capital, capital, 0.0
    for d in t.daily:
        equity += d
        peak = max(peak, equity)
        worst = max(worst, 1 - equity / peak)
    days = max(1, len(t.daily))
    return Exam(t.total, t.trades, gains / losses if losses else (math.inf if gains else 0.0), worst,
                sum(d > 0 for d in t.daily) / days)
