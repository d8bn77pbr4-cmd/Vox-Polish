"""Many free simulation runs with the heuristic brain: how much seed capital does an automaton need?"""

from __future__ import annotations

import statistics
from dataclasses import dataclass

from .brains import HeuristicBrain
from .world import Settings, World


@dataclass
class Outcome:
    capital: float
    runs: int
    survived: float  # share of runs with at least one automaton alive at the end
    median_days_alive: float  # lifetime of the whole lineage
    avg_payout: float
    avg_result: float  # payouts minus seed capital
    profitable: float  # share of runs where the creator got back more than the seed
    avg_in_wallets: float  # money still held by living automatons at the end
    avg_population: float  # automatons ever born per run


def run_experiment(capitals: list[float], runs: int, days: int, think_cost: float, seed: int = 0,
                   stop_file: str = "STOP") -> list[Outcome]:
    outcomes = []
    for capital in capitals:
        worlds = []
        for i in range(runs):
            world = World(Settings(seed_capital=capital, days=days, seed=seed + i, stop_file=stop_file),
                          HeuristicBrain(think_cost))
            world.run()
            worlds.append(world)
        lifetimes = [max((a.died_hour or w.hour) for a in w.agents.values()) / 24 for w in worlds]
        payouts = [w.creator.sum({"payout_in"}) / 1e6 for w in worlds]
        results = [w.creator.balance / 1e6 for w in worlds]
        outcomes.append(Outcome(
            capital=capital, runs=runs,
            survived=sum(bool(w.alive_agents()) for w in worlds) / runs,
            median_days_alive=statistics.median(lifetimes),
            avg_payout=statistics.mean(payouts),
            avg_result=statistics.mean(results),
            profitable=sum(r > 0 for r in results) / runs,
            avg_in_wallets=statistics.mean(sum(a.wallet.balance for a in w.alive_agents()) / 1e6 for w in worlds),
            avg_population=statistics.mean(len(w.agents) for w in worlds),
        ))
    return outcomes


def table(outcomes: list[Outcome], days: int, think_cost: float) -> str:
    def de(x: float, digits: int = 2) -> str:
        return f"{x:,.{digits}f}".replace(",", "_").replace(".", ",").replace("_", ".")

    lines = [f"{outcomes[0].runs} Läufe pro Startgeld, je {days} Tage, {de(think_cost, 3)} $ KI-Kosten pro Aufwachen",
             "",
             "Startgeld | überlebt | Lebensdauer (Median) | Ø an dich ausgezahlt | Ø dein Ergebnis | Gewinn für dich | Ø noch in Wallets | Ø Automatons",
             "----------|----------|----------------------|----------------------|-----------------|-----------------|-------------------|-------------"]
    for o in outcomes:
        lines.append(f"{de(o.capital):>7} $ | {o.survived:>7.0%} | {de(o.median_days_alive, 1):>15} Tage | "
                     f"{de(o.avg_payout):>18} $ | {de(o.avg_result):>13} $ | {o.profitable:>14.0%} | "
                     f"{de(o.avg_in_wallets):>15} $ | {de(o.avg_population, 1):>12}")
    return "\n".join(lines)
