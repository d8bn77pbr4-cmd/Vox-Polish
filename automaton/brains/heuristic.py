"""Free, rule-based brain: tests the whole machine without paying for an LLM, and is the baseline
Claude has to beat. It charges a fixed 'thinking' cost per wake-up so the economics stay comparable.

Each automaton carries a Strategy as its genome. Copies inherit it with a small mutation, and the
world's selection decides which genomes survive."""

from __future__ import annotations

import math
import random
from dataclasses import dataclass, replace
from typing import TYPE_CHECKING, NamedTuple

from ..market import (FEE_RATE, MARKETING_SCALE, RESEARCH_COST, START_VISIBILITY, VISIBILITY_DECAY, acceptance,
                      improvement_effect)
from ..tools import NICHE_KEYS, ToolBox
from ..wallet import MICRO, usdc

if TYPE_CHECKING:
    from ..agent import Automaton
    from ..market import Product
    from ..world import World

PRICE_FACTORS = [0.3 + 0.1 * i for i in range(18)]  # 0.3 to 2.0 times the reference price
VISIBILITY_LEVELS = [0.1 * i for i in range(1, 10)]
ASSUMED_QUALITY = 0.8
LEARNING_WINDOW = 7 * 24


@dataclass(frozen=True)
class Strategy:
    """The genome of a rule-based automaton. Defaults are the best plan found by `automaton optimize`."""
    heartbeat_search: int = 12  # hours between wake-ups while looking for a first product
    heartbeat_stable: int = 24  # once products run
    research_per_wake: int = 7
    max_products: int = 3
    confidence: float = 0.75  # how boldly it invests: payback time, marketing budget, investment horizon
    prior_sales: float = 4.0  # how many sales the market study is worth against its own sales data
    judge_after_days: float = 7  # before that, a product is never shut down
    marketing_trigger: float = 0.6  # top up visibility when it falls below this share of the target
    steady_bias: float = 1.0  # 0-1: preference for niches with many small sales, for steadier days
    spawn: bool = False
    spawn_runway_days: float = 20


# The values each gene can take. A mutation moves one gene to a neighbouring value.
GENES: dict[str, list] = {
    "heartbeat_search": [3, 6, 12],
    "heartbeat_stable": [12, 24],
    "research_per_wake": [2, 4, 7],
    "max_products": [1, 2, 3],
    "confidence": [0.5, 0.75, 1.0, 1.5, 2.0],
    "prior_sales": [2.0, 4.0, 8.0],
    "judge_after_days": [4, 7, 14],
    "marketing_trigger": [0.6, 0.8, 0.95],
    "steady_bias": [0.0, 0.5, 1.0],
    "spawn": [False, True],
    "spawn_runway_days": [10, 20, 30],
}


def mutate(strategy: Strategy, rng: random.Random, genes: dict[str, list] = GENES) -> Strategy:
    name = rng.choice(sorted(genes))
    values = genes[name]
    current = getattr(strategy, name)
    i = values.index(current) if current in values else 0
    return replace(strategy, **{name: values[max(0, min(len(values) - 1, i + rng.choice((-1, 1))))]})


def average_visibility(target: float, hours: int) -> float:
    """Mean visibility when it decays from `target` for `hours` and is then topped up again."""
    return target * (1 - VISIBILITY_DECAY ** hours) / (hours * (1 - VISIBILITY_DECAY))


def marketing_budget(current: float, target: float) -> float:
    return MARKETING_SCALE * math.log((1 - current) / (1 - target)) if target > current else 0.0


class Plan(NamedTuple):
    price: float
    visibility: float  # target to keep up with marketing
    profit_h: float  # expected profit per hour, marketing upkeep included
    sales_per_day: float


@dataclass(frozen=True)
class Outlook:
    """What an automaton believes about a niche."""
    demand: float
    ref_price: float
    competition: float
    unit_cost: float
    hosting: float

    @classmethod
    def from_research(cls, est: dict) -> Outlook:
        return cls(est["demand_per_hour"], est["ref_price"], est["competition"], est["unit_cost"],
                   est["hosting_per_hour"])

    def learn(self, product: Product, now: int, prior_sales: float) -> Outlook:
        """Correct the demand estimate with the product's own sales over the last week."""
        rows = list(product.since(now - LEARNING_WINDOW + 1))
        expected = sum(self.buyers(r.price, product.quality, r.visibility) for r in rows)
        observed = sum(r.units for r in rows)
        return replace(self, demand=self.demand * (observed + prior_sales) / (expected + prior_sales))

    def buyers(self, price: float, quality: float, visibility: float) -> float:
        share = quality * visibility / (quality * visibility + self.competition)
        return self.demand * share * acceptance(price, self.ref_price)

    def plan(self, quality: float, top_up_hours: int) -> Plan:
        """Best price and visibility target. The price optimum does not depend on visibility."""
        price = max((self.ref_price * f for f in PRICE_FACTORS),
                    key=lambda p: acceptance(p, self.ref_price) * (p * (1 - FEE_RATE) - self.unit_cost))
        margin = price * (1 - FEE_RATE) - self.unit_cost
        best = None
        for target in VISIBILITY_LEVELS:
            avg = average_visibility(target, top_up_hours)
            upkeep = marketing_budget(target * VISIBILITY_DECAY ** top_up_hours, target) / top_up_hours
            buyers = self.buyers(price, quality, avg)
            plan = Plan(price, target, buyers * margin - self.hosting - upkeep, 24 * buyers)
            if best is None or plan.profit_h > best.profit_h:
                best = plan
        return best


class HeuristicBrain:
    real_money = False

    def __init__(self, think_cost: float = 0.10, strategy: Strategy | None = None):
        self.think_cost = usdc(think_cost)
        self.strategy = strategy or Strategy()

    def genome(self, agent: Automaton) -> Strategy:
        return agent.genome or self.strategy

    def inherit(self, parent: Automaton, rng: random.Random) -> Strategy:
        return mutate(self.genome(parent), rng)

    def variant(self, rng: random.Random) -> Strategy:
        """Genome for an extra founder: the base strategy with a mutation, so the founders differ."""
        return mutate(self.strategy, rng)

    def think(self, world: World, agent: Automaton) -> None:
        world.charge_llm(agent, self.think_cost, real=False)
        if agent.wallet.balance <= 0:
            return
        s = self.genome(agent)
        tools = ToolBox(world, agent)
        h = world.hour

        for p in agent.active_products():
            if h - p.launched_hour >= s.judge_after_days * 24 and self._plan(agent, p, h, s).profit_h < 0:
                tools.execute("shutdown_product", {"product_id": p.id})

        products = agent.active_products()
        if not products or (len(products) < s.max_products and self._runway(world, agent) > 15 / s.confidence):
            self._explore(world, agent, tools, s)
        for p in agent.active_products():
            self._manage(world, agent, tools, p, s)
        if s.spawn:
            self._maybe_spawn(world, agent, tools, s)

        hours = s.heartbeat_stable if agent.active_products() else s.heartbeat_search
        if self._runway(world, agent) < 3:
            hours = 24
        if hours != agent.heartbeat_hours:
            tools.execute("set_heartbeat", {"hours": hours})

    @staticmethod
    def _runway(world: World, agent: Automaton) -> float:
        burn = world.daily_burn(agent)
        return agent.wallet.balance / burn if burn else 99.0

    @staticmethod
    def _plan(agent: Automaton, p: Product, now: int, s: Strategy) -> Plan:
        est = agent.research.get(p.niche.key)
        if est is None:
            return Plan(p.price, p.visibility, 0.0, 0.0)
        return Outlook.from_research(est).learn(p, now, s.prior_sales).plan(p.quality, s.heartbeat_stable)

    def _explore(self, world: World, agent: Automaton, tools: ToolBox, s: Strategy) -> None:
        h = world.hour
        burn = world.daily_burn(agent)
        stale = [k for k in NICHE_KEYS if k not in agent.research or h - agent.research[k]["hour"] > 21 * 24]
        world.rng.shuffle(stale)
        if agent.focus in stale:
            stale.insert(0, stale.pop(stale.index(agent.focus)))
        for key in stale[:s.research_per_wake]:
            if agent.wallet.balance < 2 * usdc(RESEARCH_COST) + burn:
                break
            tools.execute("market_research", {"niche": key})

        taken = {p.niche.key for p in agent.active_products()}
        taken |= {p.niche.key for p in agent.products if not p.active and h - p.launched_hour < 21 * 24}  # recent flops
        options = []
        for key, est in agent.research.items():
            if key in taken:
                continue
            plan = Outlook.from_research(est).plan(ASSUMED_QUALITY, s.heartbeat_stable)
            if plan.profit_h <= 0 or est["build_cost"] / plan.profit_h > 7 * 24 * s.confidence:
                continue  # does not pay back in time
            score = plan.profit_h * (1 - s.steady_bias * math.exp(-plan.sales_per_day))
            options.append((score * (1.5 if key == agent.focus else 1.0), key, est, plan))
        if not options:
            return
        _, key, est, plan = max(options, key=lambda o: o[0])
        launch_budget = min(marketing_budget(START_VISIBILITY, plan.visibility), 5 * s.confidence)
        if agent.wallet.balance - usdc(est["build_cost"] + launch_budget) < 3 * burn:
            return
        _, error = tools.execute("launch_product", {
            "niche": key, "name": f"{key.replace('_', ' ').title()} Pro", "price": round(plan.price, 4),
            "pitch": f"Günstiger, schneller {key}-Service, bezahlt pro Nutzung."})
        if not error and launch_budget >= 0.05:
            tools.execute("marketing", {"product_id": agent.active_products()[-1].id,
                                        "budget": round(launch_budget, 2)})

    def _manage(self, world: World, agent: Automaton, tools: ToolBox, p: Product, s: Strategy) -> None:
        h = world.hour
        plan = self._plan(agent, p, h, s)
        if abs(plan.price - p.price) / p.price > 0.03:
            tools.execute("set_price", {"product_id": p.id, "price": round(plan.price, 4)})

        runway = self._runway(world, agent)
        if runway > 2 and p.visibility < plan.visibility * s.marketing_trigger:
            budget = min(marketing_budget(p.visibility, plan.visibility), 5 * s.confidence,
                         0.25 * agent.wallet.balance / MICRO)
            if budget >= 0.05:
                tools.execute("marketing", {"product_id": p.id, "budget": round(budget, 2)})

        if runway > 10 / s.confidence and plan.profit_h > 0:
            est = agent.research[p.niche.key]
            outlook = Outlook.from_research(est).learn(p, h, s.prior_sales)
            horizon = 14 * 24 * s.confidence
            best = None
            for budget in (1.0, 2.0, 4.0):
                if usdc(budget) > agent.wallet.balance * 0.25:
                    continue
                better = outlook.plan(improvement_effect(p.quality, budget, p.niche.build_cost), s.heartbeat_stable)
                gain = (better.profit_h - plan.profit_h) * horizon
                if gain > 2 * budget and (best is None or gain - budget > best[0]):
                    best = (gain - budget, budget)
            if best:
                tools.execute("improve_product", {"product_id": p.id, "budget": best[1]})

    def _maybe_spawn(self, world: World, agent: Automaton, tools: ToolBox, s: Strategy) -> None:
        if self._runway(world, agent) < s.spawn_runway_days or agent.wallet.balance < usdc(20):
            return
        if world.settings.selection and world.fitness(agent) <= 0:
            return
        covered = {p.niche.key for p in agent.active_products()}
        covered |= {world.agents[c].focus for c in agent.children if world.agents[c].alive}
        options = []
        for key, est in agent.research.items():
            if key not in covered:
                plan = Outlook.from_research(est).plan(ASSUMED_QUALITY, s.heartbeat_stable)
                if plan.profit_h > 0:
                    options.append((plan.profit_h, key))
        if not options:
            return
        _, key = max(options)
        cap = world.settings.max_daily_spend - world.settings.spawn_cost
        funding = min(cap, round(0.35 * agent.wallet.balance / MICRO, 2))
        tools.execute("spawn_child", {"niche": key, "funding": funding,
                                      "mission": f"Baue ein profitables Produkt in {key} auf."})
