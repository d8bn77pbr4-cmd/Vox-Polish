"""Compare seed capitals: how much does an automaton need, and how often does the creator win?"""

from __future__ import annotations

from .montecarlo import Blueprint, Score, Simulator


def run_experiment(sim: Simulator, blueprint: Blueprint, capitals: list[float], runs: int, days: int,
                   think_cost: float, uncertainty: float, seed: int = 0) -> list[tuple[float, Score]]:
    return [(c, Score.of(sim.run(blueprint, range(seed, seed + runs), days, c, think_cost, uncertainty), c))
            for c in capitals]


def table(rows: list[tuple[float, Score]], days: int, think_cost: float, uncertainty: float) -> str:
    def de(x: float, digits: int = 2) -> str:
        return f"{x:,.{digits}f}".replace(",", "_").replace(".", ",").replace("_", ".")

    lines = [f"{rows[0][1].runs} Läufe pro Startgeld, je {days} Tage, {de(think_cost, 3)} $ KI-Kosten pro Aufwachen, "
             f"Marktunsicherheit {de(uncertainty, 1)}",
             "",
             "Startgeld | im Plus | Tage mit Gewinn | Tage mit Auszahlung | typisches Ergebnis | Ø Ergebnis | Ø Verlust | aktiv am Ende",
             "----------|---------|-----------------|---------------------|--------------------|------------|-----------|--------------"]
    for capital, s in rows:
        lines.append(f"{de(capital):>7} $ | {s.p_profit:>7.0%} | {s.profit_days:>15.0%} | {s.payout_days:>19.0%} | "
                     f"{de(s.median_result):>16} $ | {de(s.mean_result):>8} $ | {de(s.mean_loss):>7} $ | {s.survived:>13.0%}")
    return "\n".join(lines)
