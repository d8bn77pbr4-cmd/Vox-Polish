import random

import pytest

from automaton.brains.heuristic import GENES, HeuristicBrain, Outlook, Strategy, mutate
from automaton.market import NICHES, Hour, Product
from automaton.tools import ToolBox
from automaton.wallet import usdc
from automaton.world import Settings, World


def product_with_sales(units_per_hour: int, hours: int) -> Product:
    p = Product(id="p", owner="a", niche=NICHES[0], name="x", pitch="y", price=1.0, quality=1.0, launched_hour=0)
    p.history = [Hour(h, units_per_hour, 0, 0, 1.0, 0.5) for h in range(hours)]
    return p


def test_mutation_changes_exactly_one_gene():
    rng = random.Random(3)
    base = Strategy()
    for _ in range(50):
        child = mutate(base, rng)
        assert sum(getattr(child, k) != getattr(base, k) for k in GENES) <= 1  # 0 at the edge of a range


def test_copies_inherit_a_mutated_genome():
    brain = HeuristicBrain()
    world = World(Settings(seed=1, seed_capital=100, stop_file=""), brain)
    world.genesis.wallet.credit(0, usdc(5), "sale")
    ToolBox(world, world.genesis).execute("spawn_child", {"niche": "research", "funding": 10, "mission": "m"})
    child = world.agents["a2"]
    assert isinstance(child.genome, Strategy)
    assert sum(getattr(child.genome, k) != getattr(brain.strategy, k) for k in GENES) <= 1


def test_learning_from_own_sales():
    outlook = Outlook(demand=1.0, ref_price=1.0, competition=1.0, unit_cost=0.1, hosting=0.01)
    expected_per_hour = outlook.buyers(1.0, 1.0, 0.5)
    busy = outlook.learn(product_with_sales(1, 48), now=47, prior_sales=4)
    assert busy.demand == pytest.approx((48 + 4) / (48 * expected_per_hour + 4))
    quiet = outlook.learn(product_with_sales(0, 48), now=47, prior_sales=4)
    assert quiet.demand < 1.0 < busy.demand


def test_plan_finds_a_profitable_price_and_visibility():
    outlook = Outlook(demand=2.0, ref_price=1.0, competition=0.5, unit_cost=0.2, hosting=0.01)
    plan = outlook.plan(quality=1.0, top_up_hours=24)
    assert plan.price > 0.2 and plan.profit_h > 0 and 0 < plan.visibility < 1
    hopeless = Outlook(demand=0.01, ref_price=1.0, competition=5.0, unit_cost=0.9, hosting=0.05)
    assert hopeless.plan(1.0, 24).profit_h < 0
