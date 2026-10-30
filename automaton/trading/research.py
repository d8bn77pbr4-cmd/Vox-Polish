"""Research like a professional desk, in three separate periods:

1. learn (2022 to September 2024): a genetic algorithm searches every setup and coin for the settings with
   the most reliable daily results (t-statistic, not the biggest profit, so lucky streaks count less);
2. select (October 2024 to September 2025): only what also works on this unseen year enters the playbook;
3. test once (October 2025 to September 2026): the playbook trades a year it has never seen, next to two
   controls: the same rules with coin-flip directions, and the same playbook on shuffled prices."""

from __future__ import annotations

import json
import multiprocessing
import os
import random
import statistics
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Callable

from .data import BARS_PER_DAY
from .pro import PRO_GENES, SETUPS, ProGenome, mutate_pro, pro_trade, random_pro, t_stat
from .strategy import Market

PERIODS = {"lernen": ("2022-01-01", "2024-10-01"), "auswählen": ("2024-10-01", "2025-10-01"),
           "test": ("2025-10-01", "2026-10-01")}
PLAYBOOK = Path(__file__).with_name("playbook.json")
MIN_TRADES_PER_YEAR = 25

_MARKET: dict[str, Market] = {}


def day_of(market: Market, date: str) -> int:
    ts = datetime.fromisoformat(date).replace(tzinfo=timezone.utc).timestamp()
    return next((d for d in range(market.days) if market.t[d * BARS_PER_DAY] >= ts), market.days)


def period(market: Market, name: str) -> tuple[int, int]:
    first, last = PERIODS[name]
    return day_of(market, first), day_of(market, last)


@dataclass(frozen=True)
class Stats:
    pnl: float  # dollars on 100 $ capital
    trades: int
    t: float  # t-statistic of the daily results
    fees: float
    win_rate: float
    positive_months: float
    months: int
    monthly: tuple[float, ...] = ()

    @property
    def score(self) -> float:
        return self.t


def monthly(market: Market, first_day: int, daily: list[float]) -> list[tuple[str, float]]:
    out: dict[str, float] = {}
    for k, pnl in enumerate(daily):
        month = datetime.fromtimestamp(market.t[(first_day + k) * BARS_PER_DAY], tz=timezone.utc).strftime("%Y-%m")
        out[month] = out.get(month, 0.0) + pnl
    return list(out.items())


def stats_of(market: Market, first_day: int, trader, years: float) -> Stats:
    months = monthly(market, first_day, trader.daily)
    t = t_stat(trader.daily) if trader.trades >= MIN_TRADES_PER_YEAR * years else -10.0
    return Stats(trader.total, trader.trades, t, trader.fees, trader.wins / max(1, trader.trades),
                 sum(p > 0 for _, p in months) / max(1, len(months)), len(months), tuple(p for _, p in months))


def _evaluate(job: tuple[ProGenome, int, int, str, int | None]) -> Stats:
    genome, first, last, market_key, flip_seed = job
    market = _MARKET[market_key]
    flip = random.Random(flip_seed) if flip_seed is not None else None
    trader = pro_trade(genome, market, first, last, coin_flip=flip)
    return stats_of(market, first, trader, (last - first) / 365)


class Lab:
    def __init__(self, markets: dict[str, Market]):
        _MARKET.update(markets)
        self.pool = multiprocessing.get_context("fork").Pool(os.cpu_count())

    def __enter__(self) -> Lab:
        return self

    def __exit__(self, *exc) -> None:
        self.pool.close()
        self.pool.join()

    def evaluate(self, genomes: list[ProGenome], first: int, last: int, market: str = "real",
                 flip_seed: int | None = None) -> list[Stats]:
        return self.pool.map(_evaluate, [(g, first, last, market, flip_seed) for g in genomes], chunksize=4)


def learn(lab: Lab, first: int, last: int, generations: int = 20, population: int = 72, seed: int = 0,
          log: Callable[[str], None] = print) -> dict[ProGenome, Stats]:
    """Genetic search. Elite slots are kept per setup, so every setup gets a fair chance."""
    rng = random.Random(seed)
    seen: dict[ProGenome, Stats] = {}
    pool = [ProGenome(setup=s, symbol=sym) for s in SETUPS for sym in ("BTCUSDT", "ETHUSDT", "SOLUSDT")]
    pool += [random_pro(rng) for _ in range(population - len(pool))]
    for generation in range(1, generations + 1):
        todo = [g for g in dict.fromkeys(pool) if g not in seen]
        for g, st in zip(todo, lab.evaluate(todo, first, last)):
            seen[g] = st
        ranked = sorted(dict.fromkeys(pool), key=lambda g: seen[g].score, reverse=True)
        elite = []
        for setup in SETUPS:  # the best two of every setup survive
            elite += [g for g in ranked if g.setup == setup][:2]
        elite += [g for g in ranked if g not in elite][:12]
        best = seen[ranked[0]]
        log(f"Generation {generation:2}: bester t-Wert {best.t:+.2f} ({ranked[0].label()}), "
            f"{best.pnl:+.1f} % in {best.trades} Trades, {len(seen)} Strategien geprüft")
        children = []
        while len(children) < population - len(elite):
            a, b = rng.sample(elite, 2)
            if a.setup == b.setup and rng.random() < 0.7:
                child = ProGenome(**{k: getattr(a if rng.random() < 0.5 else b, k) for k in PRO_GENES})
            else:
                child = a
            child = mutate_pro(child, rng, rng.choice((1, 1, 2)))
            if child not in seen and child not in children:
                children.append(child)
        pool = elite + children
    return seen


def select(lab: Lab, learned: dict[ProGenome, Stats], first: int, last: int, per_bucket: int = 3,
           min_t_learn: float = 1.5, min_t_select: float = 1.0, size: int = 10) -> tuple[list[dict], int]:
    """Candidates that were good while learning are tried on the unseen selection year."""
    buckets: dict[tuple[str, str], list[ProGenome]] = {}
    for g, st in sorted(learned.items(), key=lambda kv: kv[1].score, reverse=True):
        if st.t >= min_t_learn and st.pnl > 0:
            bucket = buckets.setdefault((g.setup, g.symbol), [])
            if len(bucket) < per_bucket:
                bucket.append(g)
    candidates = [g for bucket in buckets.values() for g in bucket]
    chosen = []
    for g, st in zip(candidates, lab.evaluate(candidates, first, last)):
        if st.t >= min_t_select and st.pnl > 0:
            chosen.append({"genome": asdict(g), "lernen": asdict(learned[g]), "auswählen": asdict(st)})
    chosen.sort(key=lambda row: row["auswählen"]["t"], reverse=True)
    return chosen[:size], len(candidates)


def save_playbook(rows: list[dict], path: Path = PLAYBOOK) -> None:
    path.write_text(json.dumps(rows, indent=1, ensure_ascii=False), encoding="utf-8")


def load_playbook(path: Path = PLAYBOOK) -> list[ProGenome]:
    if not path.exists():
        return []
    return [ProGenome(**row["genome"]) for row in json.loads(path.read_text(encoding="utf-8"))]


def portfolio(lab: Lab, playbook: list[ProGenome], first: int, last: int, market: str = "real",
              flip_seed: int | None = None) -> tuple[list[Stats], float]:
    """Each playbook trader gets an equal share of 100 $. Returns each trader's stats and the total."""
    results = lab.evaluate(playbook, first, last, market, flip_seed)
    return results, sum(r.pnl for r in results) / max(1, len(results))


def summary_months(values: list[float]) -> dict:
    return {"monate": len(values), "positiv": sum(v > 0 for v in values) / max(1, len(values)),
            "mittel": statistics.mean(values) if values else 0.0, "schlechtester": min(values, default=0.0),
            "t": t_stat(values)}


def final_test(lab: Lab, playbook: list[ProGenome], learned_favourites: list[ProGenome], first: int, last: int,
               flips: int = 20, shuffles: tuple[str, ...] = ()) -> dict:
    """The one test on the untouched year. Each playbook trader gets an equal share of 100 $."""
    results, total = portfolio(lab, playbook, first, last)
    months = [sum(r.monthly[k] for r in results) / len(results) for k in range(len(results[0].monthly))]
    flip_totals = [portfolio(lab, playbook, first, last, flip_seed=seed)[1] for seed in range(flips)]
    shuffle_totals = [portfolio(lab, playbook, first, last, market=key)[1] for key in shuffles]
    favourites = lab.evaluate(learned_favourites, first, last)
    return {
        "traders": [{"genome": asdict(g), "test": asdict(r)} for g, r in zip(playbook, results)],
        "portfolio": {"ergebnis": total, "verlauf": months, **summary_months(months)},
        "münzwurf": flip_totals,
        "zufallskurse": shuffle_totals,
        "lern_favoriten": [{"genome": asdict(g), "test": asdict(r)} for g, r in zip(learned_favourites, favourites)],
    }
