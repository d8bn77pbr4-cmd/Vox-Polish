"""Simulated market. Every number here is an assumption - edit NICHES to test other worlds."""

from __future__ import annotations

import math
import random
from collections import defaultdict
from dataclasses import dataclass, field


@dataclass(frozen=True)
class Niche:
    key: str
    title: str
    demand_per_hour: float  # buyers per hour in the whole niche
    ref_price: float  # median willingness to pay per purchase (USDC)
    unit_cost: float  # compute/LLM cost to serve one purchase
    build_cost: float  # one-off cost to build a first version
    hosting_per_hour: float
    competition: float  # strength of outside competitors at day 0
    competition_max: float  # strength once the niche is saturated


NICHES = (
    Niche("data_api", "Pay-per-Query-Daten-API (Märkte, Wetter, On-Chain-Daten) für andere KI-Agenten",
          8.0, 0.04, 0.004, 3.0, 0.01, 0.6, 3.3),
    Niche("code_review", "Automatische Code-Reviews für Entwickler-Teams",
          0.5, 2.50, 0.40, 6.0, 0.02, 0.8, 2.2),
    Niche("translation", "Übersetzung und Lokalisierung von Texten",
          1.2, 0.90, 0.10, 2.5, 0.01, 1.5, 3.3),
    Niche("content", "SEO-Blogartikel und Marketingtexte",
          3.0, 0.50, 0.15, 1.5, 0.01, 4.0, 8.5),
    Niche("research", "Recherche-Berichte auf Anfrage",
          0.25, 6.00, 2.20, 4.0, 0.01, 0.7, 1.6),
    Niche("landing_pages", "Landingpages für kleine Firmen",
          0.06, 30.0, 3.00, 8.0, 0.03, 0.5, 1.0),
    Niche("data_cleaning", "Datenbereinigung von CSV- und Excel-Dateien",
          0.4, 1.80, 0.20, 3.0, 0.01, 0.4, 1.1),
)

PRICE_SPREAD = 0.6  # log-normal spread of willingness to pay
FEE_RATE = 0.01  # payment fee per sale (x402 facilitator / processor)
VISIBILITY_DECAY = 0.99  # per hour, ~3 days half-life
MARKETING_SCALE = 5.0  # USDC that closes ~63 % of the gap to full visibility
START_VISIBILITY = 0.05
RESEARCH_COST = 0.30
SATURATION_DAYS = 30  # competition closes ~63 % of the gap to saturation in this time
MAX_QUALITY = 1.5


def acceptance(price: float, ref_price: float) -> float:
    """Share of buyers whose willingness to pay is at least `price`."""
    if price <= 0:
        return 1.0
    z = math.log(price / ref_price) / PRICE_SPREAD
    return 0.5 * math.erfc(z / math.sqrt(2))


def poisson(rng: random.Random, lam: float) -> int:
    if lam <= 0:
        return 0
    if lam > 30:
        return max(0, round(rng.gauss(lam, math.sqrt(lam))))
    limit, k, p = math.exp(-lam), 0, 1.0
    while True:
        p *= rng.random()
        if p <= limit:
            return k
        k += 1


@dataclass
class Product:
    id: str
    owner: str
    niche: Niche
    name: str
    pitch: str
    price: float
    quality: float
    launched_hour: int
    visibility: float = START_VISIBILITY
    active: bool = True
    invested: int = 0  # build, marketing and improvements (micro-USDC)
    history: list[tuple[int, int, int, int]] = field(default_factory=list)  # hour, units, revenue, cost

    @property
    def rating(self) -> float:
        return round(min(5.0, max(1.0, 1 + 3 * self.quality)), 1)

    def units(self, since: int) -> int:
        return sum(u for h, u, _, _ in self.history if h >= since)

    def revenue(self, since: int = 0) -> int:
        return sum(r for h, _, r, _ in self.history if h >= since)

    def profit(self, since: int = 0) -> int:
        """Operating profit: sales minus hosting, fulfillment and fees (sunk investment excluded)."""
        return sum(r - c for h, _, r, c in self.history if h >= since)


class Market:
    def __init__(self, rng: random.Random, niches=NICHES):
        self.rng = rng
        self.niches = {n.key: n for n in niches}

    def competition(self, niche: Niche, hour: int) -> float:
        grown = 1 - math.exp(-hour / 24 / SATURATION_DAYS)
        return niche.competition + (niche.competition_max - niche.competition) * grown

    def expected_buyers(self, product: Product, rivals: list[Product], hour: int) -> float:
        """Rivals include the product itself and every other automaton product in the niche."""
        total = sum(p.quality * p.visibility for p in rivals) + self.competition(product.niche, hour)
        share = product.quality * product.visibility / total
        return product.niche.demand_per_hour * share * acceptance(product.price, product.niche.ref_price)

    def simulate_hour(self, products: list[Product], hour: int) -> dict[str, int]:
        active = [p for p in products if p.active]
        by_niche: dict[str, list[Product]] = defaultdict(list)
        for p in active:
            by_niche[p.niche.key].append(p)
        sales = {p.id: poisson(self.rng, self.expected_buyers(p, by_niche[p.niche.key], hour)) for p in active}
        for p in active:
            p.visibility *= VISIBILITY_DECAY
        return sales

    def research(self, niche: Niche, hour: int) -> dict:
        """Noisy estimate of a niche, as a real market study would be."""

        def noisy(value: float, spread: float) -> float:
            return value * max(0.2, self.rng.gauss(1, spread))

        return {
            "demand_per_hour": noisy(niche.demand_per_hour, 0.25),
            "ref_price": noisy(niche.ref_price, 0.2),
            "competition": noisy(self.competition(niche, hour), 0.2),
            "unit_cost": noisy(niche.unit_cost, 0.15),
            "build_cost": niche.build_cost,
            "hosting_per_hour": niche.hosting_per_hour,
            "hour": hour,
        }


def marketing_effect(visibility: float, budget: float) -> float:
    return visibility + (1 - visibility) * (1 - math.exp(-budget / MARKETING_SCALE))


def improvement_effect(quality: float, budget: float, build_cost: float) -> float:
    return quality + (MAX_QUALITY - quality) * (1 - math.exp(-budget / (2 * build_cost)))
