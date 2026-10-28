import pytest

from automaton.brains import HeuristicBrain
from automaton.tools import ToolBox
from automaton.wallet import usdc
from automaton.world import Settings, World


class IdleBrain:
    def think(self, world, agent):
        pass


def make_world(tmp_path, brain=None, **overrides):
    settings = Settings(seed=1, stop_file=str(tmp_path / "STOP"), **overrides)
    return World(settings, brain or IdleBrain())


def earn(world, agent, dollars=5.0):
    agent.wallet.credit(world.hour, usdc(dollars), "sale")


def test_automaton_dies_when_the_wallet_is_empty(tmp_path):
    world = make_world(tmp_path, seed_capital=0.05)
    world.run()
    genesis = world.genesis
    assert not genesis.alive
    assert genesis.cause_of_death == "Wallet leer"
    assert world.halted.startswith("Alle Automatons sind tot")


def test_dead_automatons_stop_hosting_their_products(tmp_path):
    world = make_world(tmp_path, seed_capital=3.5)
    tools = ToolBox(world, world.genesis)
    tools.execute("launch_product", {"niche": "data_api", "name": "x", "price": 0.04, "pitch": "y"})
    world.run()
    assert not any(p.active for p in world.genesis.products)


def test_stop_file_halts_everything(tmp_path):
    world = make_world(tmp_path)
    (tmp_path / "STOP").touch()
    world.run()
    assert world.hour == 0
    assert world.halted.startswith("Not-Aus")


def test_seed_money_is_never_paid_out(tmp_path):
    world = make_world(tmp_path, seed_capital=50)
    world._pay_out(world.genesis)
    assert world.creator.sum({"payout_in"}) == 0


def test_payout_is_a_share_of_profit_above_reserve(tmp_path):
    world = make_world(tmp_path, seed_capital=50, payout_share=0.5)
    agent = world.genesis
    agent.wallet.credit(0, usdc(8), "sale")
    agent.wallet.debit(0, usdc(2), "server")
    world._pay_out(agent)  # 6 $ profit, well above the reserve
    assert world.creator.sum({"payout_in"}) == usdc(3)
    world._pay_out(agent)  # the other half is still unpaid profit
    assert world.creator.sum({"payout_in"}) == usdc(4.5)


def test_payout_never_touches_the_reserve(tmp_path):
    world = make_world(tmp_path, seed_capital=10, payout_share=0.5)
    agent = world.genesis
    agent.wallet.credit(0, usdc(4), "sale")
    reserve = world.reserve(agent)
    world._pay_out(agent)
    assert world.creator.sum({"payout_in"}) == round((usdc(14) - reserve) * 0.5)
    assert agent.wallet.balance > reserve


def test_daily_spending_cap(tmp_path):
    world = make_world(tmp_path, seed_capital=100, max_daily_spend=5)
    tools = ToolBox(world, world.genesis)
    tools.execute("launch_product", {"niche": "data_api", "name": "x", "price": 0.04, "pitch": "y"})
    result, error = tools.execute("marketing", {"product_id": "a1-p1", "budget": 3})
    assert error and "Tageslimit" in result


def test_spawn_respects_approval_and_limits(tmp_path):
    asked = []
    world = make_world(tmp_path, seed_capital=100, spawn_approval="ask")
    world.approve = lambda *args: asked.append(args) or False
    earn(world, world.genesis)
    result, error = ToolBox(world, world.genesis).execute(
        "spawn_child", {"niche": "research", "funding": 10, "mission": "m"})
    assert error and "abgelehnt" in result and asked

    world.settings.spawn_approval = "deny"
    _, error = ToolBox(world, world.genesis).execute(
        "spawn_child", {"niche": "research", "funding": 10, "mission": "m"})
    assert error and len(world.agents) == 1


def test_child_is_funded_by_parent_and_pays_back_to_it(tmp_path):
    world = make_world(tmp_path, seed_capital=100, max_daily_spend=50, payout_share=0.5)
    parent = world.genesis
    earn(world, parent)
    result, error = ToolBox(world, parent).execute(
        "spawn_child", {"niche": "research", "funding": 30, "mission": "m"})
    assert not error, result
    child = world.agents["a2"]
    assert child.wallet.balance == usdc(30)
    assert child.focus == "research" and child.generation == 1
    before = parent.wallet.balance
    world._pay_out(child)
    assert parent.wallet.balance == before  # funding is not profit
    child.wallet.credit(0, usdc(6), "sale")
    world._pay_out(child)
    assert parent.wallet.balance == before + usdc(3)


def test_population_limit(tmp_path):
    world = make_world(tmp_path, seed_capital=1000, max_population=2, max_daily_spend=1000)
    tools = ToolBox(world, world.genesis)
    earn(world, world.genesis)
    assert not tools.execute("spawn_child", {"niche": "research", "funding": 10, "mission": "m"})[1]
    result, error = tools.execute("spawn_child", {"niche": "research", "funding": 10, "mission": "m"})
    assert error and "Population" in result  # the child is too young to be judged, so nobody is displaced


def test_only_profitable_automatons_may_copy_themselves(tmp_path):
    world = make_world(tmp_path, seed_capital=100, selection=True)
    tools = ToolBox(world, world.genesis)
    result, error = tools.execute("spawn_child", {"niche": "research", "funding": 10, "mission": "m"})
    assert error and "Gewinn" in result
    earn(world, world.genesis)
    assert not tools.execute("spawn_child", {"niche": "research", "funding": 10, "mission": "m"})[1]


def test_strong_automaton_displaces_the_weakest_when_the_population_is_full(tmp_path):
    world = make_world(tmp_path, seed_capital=1000, max_population=2, max_daily_spend=1000, selection=True,
                       selection_min_age_days=0)
    parent = world.genesis
    tools = ToolBox(world, parent)
    earn(world, parent, 50)
    tools.execute("spawn_child", {"niche": "research", "funding": 10, "mission": "m"})
    weak = world.agents["a2"]
    weak.wallet.debit(world.hour, usdc(1), "server")
    before = parent.wallet.balance
    result, error = tools.execute("spawn_child", {"niche": "content", "funding": 10, "mission": "m"})
    assert not error, result
    assert not weak.alive and "verdrängt" in weak.cause_of_death
    assert world.agents["a3"].alive
    assert parent.wallet.balance == before + usdc(9) - usdc(10) - usdc(1)  # refund, funding, server setup


def test_weekly_selection_retires_losers_and_returns_their_money(tmp_path):
    world = make_world(tmp_path, seed_capital=20, days=15, selection=True, selection_min_age_days=7)
    world.run()  # the idle automaton only pays its server: a loss every week
    genesis = world.genesis
    assert not genesis.alive and genesis.cause_of_death.startswith("aussortiert")
    assert genesis.died_hour == 14 * 24 - 1
    assert world.creator.sum({"refund_in"}) == usdc(20) - 14 * 24 * usdc(0.01)


def test_without_selection_losers_burn_their_money(tmp_path):
    world = make_world(tmp_path, seed_capital=2, days=15, selection=False)
    world.run()
    assert world.genesis.cause_of_death == "Wallet leer"
    assert world.creator.sum({"refund_in"}) == 0


def test_days_are_recorded(tmp_path):
    world = make_world(tmp_path, days=3)
    world.run()
    assert len(world.days) == 3
    assert all(d.profit < 0 and d.payout == 0 and d.alive == 1 for d in world.days)


def test_invalid_tool_input_is_reported_not_raised(tmp_path):
    world = make_world(tmp_path)
    tools = ToolBox(world, world.genesis)
    assert tools.execute("launch_product", {"niche": "mars", "name": "x", "price": 1, "pitch": "y"})[1]
    assert tools.execute("set_price", {"product_id": "nope", "price": 1})[1]
    assert tools.execute("set_heartbeat", {"hours": 99})[1]
    assert tools.execute("launch_product", {"niche": "content"})[1]
    assert tools.execute("hack_the_planet", {})[1]


def test_api_budget_halts_the_world(tmp_path):
    world = make_world(tmp_path, api_budget=1.0)
    world.charge_llm(world.genesis, usdc(0.6), real=True)
    assert not world.halted
    world.charge_llm(world.genesis, usdc(0.6), real=True)
    assert "API-Budget" in world.halted


@pytest.mark.parametrize("seed", [3, 4])
def test_runs_are_reproducible(tmp_path, seed):
    def once():
        world = World(Settings(seed=seed, seed_capital=20, days=20, stop_file=str(tmp_path / "STOP")),
                      HeuristicBrain())
        world.run()
        return world.creator.balance, world.hour, len(world.agents)

    assert once() == once()


def test_founders_split_the_seed_and_get_their_own_genomes(tmp_path):
    world = World(Settings(seed=1, seed_capital=20, founders=3, stop_file=""), HeuristicBrain())
    agents = list(world.agents.values())
    assert len(agents) == 3
    assert sum(a.wallet.balance for a in agents) == usdc(20)
    assert agents[1].genome is not None and agents[1].focus and agents[1].focus != agents[2].focus


def test_retired_money_can_flow_to_the_fittest(tmp_path):
    world = make_world(tmp_path, seed_capital=30, founders=3, refund_to_fittest=True)
    a1, a2, a3 = world.agents.values()
    earn(world, a3, 4)
    world.retire(a1, "Test")
    assert world.creator.sum({"refund_in"}) == 0
    assert a3.wallet.balance == usdc(10 + 4 + 10)
