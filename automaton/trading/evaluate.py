"""Honest tests for the day-trading desk: real prices, a random-walk control, tuning on one year and
testing on the next, and a 90-day forecast resampled from the test year."""

from __future__ import annotations

import math
import multiprocessing
import os
import random
import statistics
from dataclasses import dataclass, fields, replace
from typing import Callable, NamedTuple

from .data import Bar
from .desk import Desk, DeskSettings
from .strategy import Market

_MARKETS: dict[str, Market] = {}  # shared with worker processes through fork


class Outcome(NamedTuple):
    result: float  # creator's result at the end: payouts + money left - capital
    trading: float  # trading result before running costs
    costs: float
    profit_days: float  # share of the days the desk traded on which it made money
    payout_days: float
    stopped_day: int | None
    hired: int
    exams: int
    exams_passed: int
    trades: int
    fees: float
    daily_returns: tuple[float, ...]  # per trading day: desk result as a share of the money on the desk that morning


def run_desk(market: Market, settings: DeskSettings, first_day: int, last_day: int) -> Outcome:
    desk = Desk(market, settings)
    desk.run(first_day, last_day)
    days = desk.days
    traders = desk.traders + desk.retired
    active = [d for d in days if desk.stopped_day is None or d.day <= desk.stopped_day]
    returns, morning = [], settings.capital
    for d in active:
        returns.append(d.pnl / morning if morning > 0 else 0.0)
        morning = d.equity
    n = max(1, len(active))
    return Outcome(
        result=desk.creator_result, trading=sum(t.total for t in traders), costs=desk.costs,
        profit_days=sum(d.pnl > 0 for d in active) / n, payout_days=sum(d.payout > 0 for d in active) / n,
        stopped_day=desk.stopped_day, hired=desk.hired, exams=desk.exams, exams_passed=desk.exams_passed,
        trades=sum(t.trades for t in traders), fees=sum(t.fees for t in traders), daily_returns=tuple(returns),
    )


def shuffled(market: Market, rng: random.Random) -> Market:
    """Random-walk control: the same bars in random order (one order for all coins), so returns,
    candle shapes and cross-coin moves stay real while every pattern in time disappears."""
    order = list(range(1, market.n))
    rng.shuffle(order)
    series = {}
    for s in market.symbols:
        o, h, lo, c = market.open[s], market.high[s], market.low[s], market.close[s]
        price = c[0]
        bars = [Bar(market.t[0], o[0], h[0], lo[0], c[0])]
        for k, j in enumerate(order, start=1):
            price *= c[j] / c[j - 1]
            bars.append(Bar(market.t[k], price * o[j] / c[j], price * h[j] / c[j], price * lo[j] / c[j], price))
        series[s] = bars
    return Market(series)


# ----- parallel runs ------------------------------------------------------------------------------

def _work(job: tuple[str, DeskSettings, int, int]) -> Outcome:
    key, settings, first, last = job
    return run_desk(_MARKETS[key], settings, first, last)


class Lab:
    """Runs many desks in parallel on registered markets."""

    def __init__(self, markets: dict[str, Market], workers: int | None = None):
        _MARKETS.update(markets)
        self.pool = multiprocessing.get_context("fork").Pool(workers or os.cpu_count())

    def __enter__(self) -> Lab:
        return self

    def __exit__(self, *exc) -> None:
        self.pool.close()
        self.pool.join()

    def run(self, jobs: list[tuple[str, DeskSettings, int, int]]) -> list[Outcome]:
        return self.pool.map(_work, jobs, chunksize=1)


# ----- scoring ------------------------------------------------------------------------------------

@dataclass(frozen=True)
class Summary:
    runs: int
    p_profit: float
    median_result: float
    mean_result: float
    mean_loss: float
    trading: float  # mean trading result before running costs
    costs: float
    fees: float
    profit_days: float
    payout_days: float
    stopped: float  # share of runs the Chef had to stop
    value: float  # what tuning maximises

    @classmethod
    def of(cls, outcomes: list[Outcome], capital: float) -> Summary:
        res = [o.result for o in outcomes]
        mean_result = statistics.mean(res)
        mean_loss = statistics.mean(max(0.0, -r) for r in res)
        profit_days = statistics.mean(o.profit_days for o in outcomes)
        p_profit = sum(r > 0 for r in res) / len(res)
        value = p_profit + profit_days + 0.5 * math.tanh(mean_result / capital * 4) - mean_loss / capital
        return cls(len(res), p_profit, statistics.median(res), mean_result, mean_loss,
                   statistics.mean(o.trading for o in outcomes), statistics.mean(o.costs for o in outcomes),
                   statistics.mean(o.fees for o in outcomes), profit_days,
                   statistics.mean(o.payout_days for o in outcomes),
                   sum(o.stopped_day is not None for o in outcomes) / len(outcomes), value)


# ----- tuning: survival of the fittest over desk rules --------------------------------------------

DESK_GENES: dict[str, list] = {
    "max_traders": [2, 4, 6],
    "trader_share": [0.15, 0.25, 0.4],
    "exam_days": [14, 30, 60],
    "exam_min_trades": [5, 10, 20],
    "exam_min_profit_factor": [1.1, 1.3, 1.6, 2.0],
    "candidates": [6, 12, 24],
    "hire_every_days": [1, 3, 7],
    "review_days": [3, 7, 14],
    "trader_max_drawdown": [0.04, 0.08, 0.15],
    "styles": [("breakout", "meanrev", "trend"), ("trend",), ("meanrev",), ("breakout",), ("breakout", "trend")],
}


def genes_of(s: DeskSettings) -> dict:
    return {k: getattr(s, k) for k in DESK_GENES}


def tune(lab: Lab, base: DeskSettings, train: tuple[int, int], seeds: int = 4, population: int = 20,
         generations: int = 8, elite: int = 5, rng_seed: int = 0,
         log: Callable[[str], None] = print) -> list[tuple[Summary, DeskSettings]]:
    """Genetic algorithm over the desk's rules, scored only on the training days."""
    rng = random.Random(rng_seed)
    cache: dict[tuple, Summary] = {}

    def settings_of(genes: dict) -> DeskSettings:
        return replace(base, **genes)

    def score_many(pool: list[dict]) -> None:
        todo = [g for g in pool if _key(g) not in cache]
        jobs = [("real", replace(settings_of(g), seed=k), *train) for g in todo for k in range(seeds)]
        outcomes = lab.run(jobs)
        for i, g in enumerate(todo):
            cache[_key(g)] = Summary.of(outcomes[i * seeds:(i + 1) * seeds], base.capital)

    pool = [genes_of(base)] + [{k: rng.choice(v) for k, v in DESK_GENES.items()} for _ in range(population - 1)]
    for generation in range(1, generations + 1):
        score_many(pool)
        ranked = sorted(pool, key=lambda g: cache[_key(g)].value, reverse=True)
        best = cache[_key(ranked[0])]
        log(f"Generation {generation}: Wert {best.value:.3f} | im Plus {best.p_profit:.0%} | typisch "
            f"{best.median_result:+.2f} $ | Gewinntage {best.profit_days:.0%}")
        parents, children = ranked[:elite], []
        while len(children) < population - elite:
            a, b = rng.sample(parents, 2)
            child = {k: (a if rng.random() < 0.5 else b)[k] for k in DESK_GENES}
            name = rng.choice(sorted(DESK_GENES))
            values = DESK_GENES[name]
            i = values.index(child[name])
            child[name] = values[max(0, min(len(values) - 1, i + rng.choice((-1, 1))))]
            if child not in parents and child not in children:
                children.append(child)
        pool = parents + children
    score_many(pool)
    ranked = sorted(pool, key=lambda g: cache[_key(g)].value, reverse=True)
    return [(cache[_key(g)], settings_of(g)) for g in ranked[:elite]]


def _key(genes: dict) -> tuple:
    return tuple(sorted((k, v) for k, v in genes.items()))


# ----- forecast -------------------------------------------------------------------------------------

@dataclass(frozen=True)
class Forecast:
    days: int
    paths: int
    p_profit: float
    p10: float
    p50: float
    p90: float
    profit_days: float
    stopped: float


def bootstrap(daily_returns: list[list[float]], capital: float, settings: DeskSettings, days: int = 90,
              paths: int = 2000, block: int = 5, seed: int = 0) -> Forecast:
    """Resample whole blocks of real test-period days to see what 90 days could look like."""
    rng = random.Random(seed)
    runs = [r for r in daily_returns if r]
    results, profit_days, stopped = [], [], 0
    for _ in range(paths):
        equity, paid, wins, dead = capital, 0.0, 0, False
        source = rng.choice(runs)
        day = 0
        while day < days and not dead:
            start = rng.randrange(0, max(1, len(source) - block))
            for r in source[start:start + block]:
                if day >= days:
                    break
                pnl = equity * r
                equity += pnl
                wins += pnl > 0
                unpaid = equity - capital
                if unpaid > 0:
                    pay = settings.payout_share * unpaid
                    equity -= pay
                    paid += pay
                if equity <= capital * (1 - settings.desk_stop):
                    dead = True
                    break
                day += 1
        stopped += dead
        results.append(paid + equity - capital)
        profit_days.append(wins / days)
    results.sort()
    q = lambda p: results[int(p * (len(results) - 1))]
    return Forecast(days, paths, sum(r > 0 for r in results) / paths, q(0.1), q(0.5), q(0.9),
                    statistics.mean(profit_days), stopped / paths)


def settings_dict(s: DeskSettings) -> dict:
    return {f.name: getattr(s, f.name) for f in fields(s)}

