"""Run many simulated worlds in parallel and score how good they were for the creator."""

from __future__ import annotations

import json
import math
import os
import statistics
from concurrent.futures import ProcessPoolExecutor
from dataclasses import asdict, dataclass, fields
from pathlib import Path
from typing import NamedTuple

from .brains.heuristic import GENES, HeuristicBrain, Strategy
from .world import Settings, World

# World rules evolution may change, with the values it may try.
POLICY_GENES: dict[str, list] = {
    "payout_share": [0.3, 0.5, 0.8, 1.0],
    "reserve_days": [3, 7, 14],
    "min_reserve": [3.0, 6.0, 10.0],
    "selection": [False, True],
    "selection_min_age_days": [7, 14, 21],
    "founders": [1, 2, 3],
    "refund_to_fittest": [False, True],
}
ALL_GENES = {**GENES, **POLICY_GENES}


@dataclass(frozen=True)
class Blueprint:
    """Everything evolution tunes: the automatons' strategy and the world's payout and selection rules."""
    strategy: Strategy = Strategy()
    payout_share: float = Settings.payout_share
    reserve_days: float = Settings.reserve_days
    min_reserve: float = Settings.min_reserve
    selection: bool = Settings.selection
    selection_min_age_days: int = Settings.selection_min_age_days
    founders: int = Settings.founders
    refund_to_fittest: bool = Settings.refund_to_fittest

    def settings(self, **overrides) -> Settings:
        policy = {k: getattr(self, k) for k in POLICY_GENES}
        return Settings(**{**policy, **overrides})

    def genes(self) -> dict:
        return {**asdict(self.strategy), **{k: getattr(self, k) for k in POLICY_GENES}}

    @classmethod
    def from_genes(cls, genes: dict) -> Blueprint:
        strategy_fields = {f.name for f in fields(Strategy)}
        strategy = Strategy(**{k: v for k, v in genes.items() if k in strategy_fields})
        return cls(strategy, **{k: v for k, v in genes.items() if k in POLICY_GENES})

    def save(self, path: Path) -> None:
        path.write_text(json.dumps(self.genes(), indent=2), encoding="utf-8")

    @classmethod
    def load(cls, path: Path) -> Blueprint:
        return cls.from_genes(json.loads(path.read_text(encoding="utf-8")))


class Job(NamedTuple):
    blueprint: Blueprint
    seed: int
    days: int
    capital: float
    think_cost: float
    uncertainty: float
    scenario: tuple = ()  # (("demand_factor", 0.5), ...); "think_factor" scales the thinking cost


class RunResult(NamedTuple):
    creator: tuple[float, ...]  # creator's running result at the end of each day, in dollars
    profit_days: float  # share of days on which the automatons made an operating profit
    payout_days: float  # share of days with a payout to the creator
    alive: bool
    agents: int
    retired: int
    sales_per_day: float = 0.0  # all automatons together, averaged over every day of the run
    revenue_per_day: float = 0.0

    @property
    def result(self) -> float:
        return self.creator[-1]

    @property
    def breakeven_day(self) -> int | None:
        return next((d + 1 for d, value in enumerate(self.creator) if value >= 0), None)


def run_world(job: Job) -> RunResult:
    scenario = dict(job.scenario)
    think = job.think_cost * scenario.pop("think_factor", 1.0)
    settings = job.blueprint.settings(seed_capital=job.capital, days=job.days, seed=job.seed, stop_file="",
                                      market_uncertainty=job.uncertainty, **scenario)
    world = World(settings, HeuristicBrain(think, job.blueprint.strategy))
    world.run()
    days = world.days[:job.days]
    pad = job.days - len(days)
    creator = [d.creator / 1e6 for d in days] + [world.creator.balance / 1e6] * pad
    return RunResult(
        creator=tuple(creator),
        profit_days=sum(d.profit > 0 for d in days) / job.days,
        payout_days=sum(d.payout > 0 for d in days) / job.days,
        alive=bool(world.alive_agents()),
        agents=len(world.agents),
        retired=sum(a.cause_of_death.startswith("aussortiert") for a in world.agents.values()),
        sales_per_day=sum(p.units(0) for a in world.agents.values() for p in a.products) / job.days,
        revenue_per_day=sum(a.wallet.sum({"sale"}) for a in world.agents.values()) / 1e6 / job.days,
    )


@dataclass(frozen=True)
class Score:
    runs: int
    profit_days: float
    payout_days: float
    p_profit: float  # share of worlds in which the creator ends up with more than the seed back
    mean_result: float
    median_result: float
    mean_loss: float  # average loss over all worlds (0 where the creator won)
    survived: float
    value: float  # what evolution maximises
    sales_per_day: float = 0.0
    revenue_per_day: float = 0.0

    @classmethod
    def of(cls, results: list[RunResult], capital: float) -> Score:
        final = [r.result for r in results]
        profit_days = statistics.mean(r.profit_days for r in results)
        payout_days = statistics.mean(r.payout_days for r in results)
        p_profit = sum(x > 0 for x in final) / len(final)
        mean_result = statistics.mean(final)
        mean_loss = statistics.mean(max(0.0, -x) for x in final)
        value = (0.5 * (profit_days + payout_days) + p_profit
                 + 0.5 * math.tanh(mean_result / capital) - 0.5 * mean_loss / capital)
        return cls(len(final), profit_days, payout_days, p_profit, mean_result, statistics.median(final),
                   mean_loss, sum(r.alive for r in results) / len(results), value,
                   statistics.mean(r.sales_per_day for r in results), statistics.mean(r.revenue_per_day for r in results))


class Simulator:
    """Runs batches of worlds on all CPU cores."""

    def __init__(self, workers: int | None = None):
        self.pool = ProcessPoolExecutor(max_workers=workers or os.cpu_count())

    def __enter__(self) -> Simulator:
        return self

    def __exit__(self, *exc) -> None:
        self.pool.shutdown()

    def run(self, blueprint: Blueprint, seeds, days: int, capital: float, think_cost: float,
            uncertainty: float = 1.0, scenario: dict | None = None) -> list[RunResult]:
        jobs = [Job(blueprint, s, days, capital, think_cost, uncertainty, tuple(sorted((scenario or {}).items())))
                for s in seeds]
        return list(self.pool.map(run_world, jobs, chunksize=max(1, len(jobs) // (4 * os.cpu_count()))))
