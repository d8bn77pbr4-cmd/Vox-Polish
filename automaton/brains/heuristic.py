"""Free, rule-based brain: tests the whole machine without paying for an LLM, and is the baseline
Claude has to beat. It charges a fixed 'thinking' cost per wake-up so the economics stay comparable."""

from __future__ import annotations

from typing import TYPE_CHECKING

from ..market import (FEE_RATE, RESEARCH_COST, acceptance, improvement_effect, marketing_effect)
from ..tools import NICHE_KEYS, ToolBox
from ..wallet import MICRO, usdc

if TYPE_CHECKING:
    from ..agent import Automaton
    from ..market import Product
    from ..world import World

PRICE_FACTORS = [0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0, 1.2, 1.4]
ASSUMED_QUALITY = 0.8
LAUNCH_VISIBILITY = 0.3  # what one round of launch marketing roughly buys


def profit_per_hour(est: dict, price: float, quality: float, visibility: float) -> float:
    share = quality * visibility / (quality * visibility + est["competition"])
    buyers = est["demand_per_hour"] * share * acceptance(price, est["ref_price"])
    return buyers * (price * (1 - FEE_RATE) - est["unit_cost"]) - est["hosting_per_hour"]


def best_price(est: dict, quality: float = ASSUMED_QUALITY, visibility: float = LAUNCH_VISIBILITY) -> tuple[float, float]:
    """(profit per hour, price) at the most profitable price for an estimate."""
    return max((profit_per_hour(est, est["ref_price"] * f, quality, visibility), est["ref_price"] * f)
               for f in PRICE_FACTORS)


class HeuristicBrain:
    real_money = False

    def __init__(self, think_cost: float = 0.10):
        self.think_cost = usdc(think_cost)

    def think(self, world: World, agent: Automaton) -> None:
        world.charge_llm(agent, self.think_cost, real=False)
        if agent.wallet.balance <= 0:
            return
        tools = ToolBox(world, agent)
        h = world.hour

        # A week of data before judging: products with few, large sales need time to show results.
        for p in agent.active_products():
            if h - p.launched_hour >= 7 * 24 and p.profit(h - 7 * 24 + 1) < 0:
                tools.execute("shutdown_product", {"product_id": p.id})

        products = agent.active_products()
        if not products or (len(products) < 2 and self._runway(world, agent) > 20):
            self._explore(world, agent, tools)
        for p in agent.active_products():
            self._manage(world, agent, tools, p)
        self._maybe_spawn(world, agent, tools)

        # Thinking costs money: wake often only while searching for a first product.
        hours = 24 if self._runway(world, agent) < 3 else 12 if agent.active_products() else 6
        if hours != agent.heartbeat_hours:
            tools.execute("set_heartbeat", {"hours": hours})

    @staticmethod
    def _runway(world: World, agent: Automaton) -> float:
        burn = world.daily_burn(agent)
        return agent.wallet.balance / burn if burn else 99.0

    def _explore(self, world: World, agent: Automaton, tools: ToolBox) -> None:
        h = world.hour
        burn = world.daily_burn(agent)
        stale = [k for k in NICHE_KEYS if k not in agent.research or h - agent.research[k]["hour"] > 14 * 24]
        world.rng.shuffle(stale)
        if agent.focus in stale:
            stale.insert(0, stale.pop(stale.index(agent.focus)))
        for key in stale[:2]:
            if agent.wallet.balance < 2 * usdc(RESEARCH_COST) + burn:
                break
            tools.execute("market_research", {"niche": key})

        taken = {p.niche.key for p in agent.active_products()}
        taken |= {p.niche.key for p in agent.products if not p.active and h - p.launched_hour < 21 * 24}  # recent flops
        options = []
        for key, est in agent.research.items():
            if key in taken:
                continue
            profit_h, price = best_price(est)
            if profit_h > 0 and est["build_cost"] / profit_h < 7 * 24:  # pays back within a week
                bonus = 1.5 if key == agent.focus else 1.0
                options.append((profit_h * bonus, price, key, est))
        if not options:
            return
        _, price, key, est = max(options)
        launch_budget = min(3.0, est["build_cost"])
        if agent.wallet.balance - usdc(est["build_cost"] + launch_budget) < 3 * burn:
            return
        _, error = tools.execute("launch_product", {
            "niche": key, "name": f"{key.replace('_', ' ').title()} Pro", "price": round(price, 4),
            "pitch": f"Günstiger, schneller {key}-Service, bezahlt pro Nutzung."})
        if not error:
            tools.execute("marketing", {"product_id": agent.active_products()[-1].id, "budget": launch_budget})

    def _manage(self, world: World, agent: Automaton, tools: ToolBox, p: Product) -> None:
        h = world.hour
        est = agent.research.get(p.niche.key)
        if est is None or h - est["hour"] > 7 * 24:
            if agent.wallet.balance > 3 * usdc(RESEARCH_COST) + world.daily_burn(agent):
                tools.execute("market_research", {"niche": p.niche.key})
                est = agent.research.get(p.niche.key)
        if est is None:
            return

        # Price: re-optimise on the estimate, nudged down when nothing sells.
        _, target = best_price(est, p.quality, max(p.visibility, 0.05))
        if h - p.launched_hour >= 24 and p.units(h - 23) == 0 and p.visibility > 0.2:
            target = min(target, p.price * 0.85)
        target = max(target, est["unit_cost"] * 1.2)
        if abs(target - p.price) / p.price > 0.05:
            tools.execute("set_price", {"product_id": p.id, "price": round(target, 4)})

        runway = self._runway(world, agent)
        if runway > 4:
            self._invest(tools, p, "marketing", [1.0, 2.0, 3.0, 5.0], horizon_h=72, est=est,
                         effect=lambda b: (p.quality, marketing_effect(p.visibility, b)), balance=agent.wallet.balance)
        if runway > 10 and p.profit(h - 71) > 0:
            self._invest(tools, p, "improve_product", [1.0, 2.0, 4.0], horizon_h=7 * 24, est=est,
                         effect=lambda b: (improvement_effect(p.quality, b, p.niche.build_cost), p.visibility),
                         balance=agent.wallet.balance)

    @staticmethod
    def _invest(tools, p, tool, budgets, horizon_h, est, effect, balance) -> None:
        """Spend on the budget with the best expected return, if any pays back twice within the horizon."""
        now = profit_per_hour(est, p.price, p.quality, p.visibility)
        best = None
        for b in budgets:
            if usdc(b) > balance * 0.25:
                continue
            quality, visibility = effect(b)
            gain = (profit_per_hour(est, p.price, quality, visibility) - now) * horizon_h * 0.7
            if gain > 2 * b and (best is None or gain - b > best[0]):
                best = (gain - b, b)
        if best:
            tools.execute(tool, {"product_id": p.id, "budget": best[1]})

    def _maybe_spawn(self, world: World, agent: Automaton, tools: ToolBox) -> None:
        h = world.hour
        profitable = sum(p.profit(h - 71) for p in agent.active_products()) > 0
        if not profitable or self._runway(world, agent) < 25 or agent.wallet.balance < usdc(30):
            return
        covered = {p.niche.key for p in agent.active_products()}
        covered |= {world.agents[c].focus for c in agent.children if world.agents[c].alive}
        options = [(best_price(est)[0], key) for key, est in agent.research.items() if key not in covered]
        options = [o for o in options if o[0] > 0]
        if not options:
            return
        _, key = max(options)
        cap = world.settings.max_daily_spend - world.settings.spawn_cost
        funding = min(cap, round(0.35 * agent.wallet.balance / MICRO, 2))
        tools.execute("spawn_child", {"niche": key, "funding": funding,
                                      "mission": f"Baue ein profitables Produkt in {key} auf."})
