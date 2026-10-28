"""Forecast without any API: hundreds of worlds in which the market assumptions are randomly wrong,
plus stress tests in which they are systematically worse."""

from __future__ import annotations

import statistics
from dataclasses import asdict, dataclass

from .montecarlo import Blueprint, Score, Simulator
from .wallet import fmt, usdc

FORECAST_SEEDS = 100_000  # disjoint from the worlds evolution trained and validated on

SCENARIOS: tuple[tuple[str, dict], ...] = (
    ("Wie angenommen", {}),
    ("Halbe Nachfrage", {"demand_factor": 0.5}),
    ("Doppelte Konkurrenz", {"competition_factor": 2.0}),
    ("Kunden zahlen 30 % weniger", {"price_factor": 0.7}),
    ("Alle Kosten +50 %", {"cost_factor": 1.5}),
    ("KI-Denken 3× so teuer", {"think_factor": 3.0}),
    ("Alles zugleich schlechter", {"demand_factor": 0.7, "competition_factor": 1.5, "price_factor": 0.8,
                                   "cost_factor": 1.3}),
)


DEMAND_LEVELS = (0.1, 0.2, 0.35, 0.5, 0.75, 1.0)  # share of the assumed demand that really exists


def quantile(values: list[float], q: float) -> float:
    ordered = sorted(values)
    pos = q * (len(ordered) - 1)
    lo = int(pos)
    hi = min(lo + 1, len(ordered) - 1)
    return ordered[lo] + (ordered[hi] - ordered[lo]) * (pos - lo)


@dataclass
class StressResult:
    name: str
    p_profit: float
    median_result: float
    profit_days: float
    payout_days: float


@dataclass
class DemandPoint:
    factor: float
    p_profit: float
    median_result: float
    profit_days: float
    sales_per_day: float
    revenue_per_day: float


@dataclass
class Forecast:
    capital: float
    days: int
    runs: int
    think_cost: float
    score: Score
    p10: float
    p50: float
    p90: float
    p_breakeven: float
    median_breakeven_day: float | None
    fan: list[tuple[float, float, float, float, float]]  # per day: 10/25/50/75/90 % of the creator's result
    stress: list[StressResult]
    stress_runs: int
    demand: list[DemandPoint]

    def threshold(self, p_profit: float = 0.8) -> DemandPoint | None:
        """The weakest demand at which the creator still ends up in profit in `p_profit` of the worlds."""
        return next((d for d in self.demand if d.p_profit >= p_profit), None)

    def to_dict(self) -> dict:
        return asdict(self)


def make_forecast(sim: Simulator, blueprint: Blueprint, capital: float = 20.0, days: int = 90, runs: int = 500,
                  think_cost: float = 0.10, stress_runs: int = 200) -> Forecast:
    seeds = range(FORECAST_SEEDS, FORECAST_SEEDS + runs)
    results = sim.run(blueprint, seeds, days, capital, think_cost, uncertainty=1.0)
    final = [r.result for r in results]
    breakeven = [r.breakeven_day for r in results if r.breakeven_day is not None]
    fan = [tuple(quantile([r.creator[d] for r in results], q) for q in (0.1, 0.25, 0.5, 0.75, 0.9))
           for d in range(days)]

    stress = []
    for name, scenario in SCENARIOS:
        rs = sim.run(blueprint, range(FORECAST_SEEDS, FORECAST_SEEDS + stress_runs), days, capital, think_cost,
                     uncertainty=1.0, scenario=scenario)
        s = Score.of(rs, capital)
        stress.append(StressResult(name, s.p_profit, s.median_result, s.profit_days, s.payout_days))

    demand = []
    for factor in DEMAND_LEVELS:
        rs = sim.run(blueprint, range(FORECAST_SEEDS, FORECAST_SEEDS + stress_runs), days, capital, think_cost,
                     uncertainty=1.0, scenario={"demand_factor": factor})
        s = Score.of(rs, capital)
        demand.append(DemandPoint(factor, s.p_profit, s.median_result, s.profit_days, s.sales_per_day,
                                  s.revenue_per_day))

    return Forecast(
        capital=capital, days=days, runs=runs, think_cost=think_cost, score=Score.of(results, capital),
        p10=quantile(final, 0.1), p50=quantile(final, 0.5), p90=quantile(final, 0.9),
        p_breakeven=len(breakeven) / runs,
        median_breakeven_day=statistics.median(breakeven) if breakeven else None,
        fan=fan, stress=stress, stress_runs=stress_runs, demand=demand,
    )


def dollars(x: float) -> str:
    return ("+" if x > 0.005 else "") + fmt(usdc(x))


def text(f: Forecast) -> str:
    s = f.score
    breakeven = (f"in {f.p_breakeven:.0%} der Welten, typisch nach {f.median_breakeven_day:.0f} Tagen"
                 if f.median_breakeven_day else "in keiner Welt")
    lines = [
        f"=== Prognose: {fmt(usdc(f.capital))} Startgeld, {f.days} Tage, {f.runs} simulierte Welten ===",
        f"In jeder Welt liegen Nachfrage, Preise, Kosten und Konkurrenz zufällig neben den Annahmen.",
        f"KI-Kosten: {fmt(usdc(f.think_cost))} pro Aufwachen.",
        "",
        f"Am Ende im Plus:              {s.p_profit:.0%} der Welten",
        f"Dein Ergebnis nach {f.days} Tagen:  schlecht (10 %) {dollars(f.p10)} | typisch {dollars(f.p50)} | "
        f"gut (90 %) {dollars(f.p90)}",
        f"Startgeld zurück:             {breakeven}",
        f"Tage mit Gewinn der Agenten:  {s.profit_days:.0%}",
        f"Tage mit Auszahlung an dich:  {s.payout_days:.0%}",
        f"Verlust:                      höchstens dein Startgeld, im Schnitt {fmt(usdc(s.mean_loss))}",
        f"Agenten am Ende noch aktiv:   in {s.survived:.0%} der Welten",
        "",
        f"Stresstests (je {f.stress_runs} Welten, Annahmen systematisch schlechter):",
        "Szenario                     | im Plus | typisches Ergebnis | Tage mit Gewinn | Tage mit Auszahlung",
        "-----------------------------|---------|--------------------|-----------------|--------------------",
    ]
    for st in f.stress:
        lines.append(f"{st.name:<28} | {st.p_profit:>7.0%} | {dollars(st.median_result):>18} | "
                     f"{st.profit_days:>15.0%} | {st.payout_days:>19.0%}")
    lines += [
        "",
        "Wie viel Nachfrage braucht es? (Anteil der angenommenen Kunden, die es wirklich gibt)",
        "Nachfrage | im Plus | typisches Ergebnis | Tage mit Gewinn | Verkäufe/Tag | Umsatz/Tag",
        "----------|---------|--------------------|-----------------|--------------|-----------",
    ]
    for d in f.demand:
        lines.append(f"{d.factor:>9.0%} | {d.p_profit:>7.0%} | {dollars(d.median_result):>18} | "
                     f"{d.profit_days:>15.0%} | {d.sales_per_day:>12.1f} | {fmt(usdc(d.revenue_per_day)):>10}")
    t = f.threshold()
    if t:
        lines.append(f"\nSchwelle: Damit du in 80 % der Fälle im Plus bist, müssen die Agenten zusammen etwa "
                     f"{t.sales_per_day:.0f} Verkäufe mit {fmt(usdc(t.revenue_per_day))} Umsatz pro Tag schaffen.")
    else:
        lines.append("\nSelbst mit der vollen angenommenen Nachfrage wird die 80-%-Schwelle nicht erreicht.")
    lines += [
        "",
        "Wichtig: Diese Prognose gilt nur innerhalb des Modells. Wie viele echte Kunden für so einen",
        "Dienst zahlen, weiß niemand vorher. Das zeigt erst ein kleiner Test mit echtem Geld.",
    ]
    return "\n".join(lines)
