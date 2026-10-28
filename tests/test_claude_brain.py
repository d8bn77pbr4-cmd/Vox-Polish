"""The Claude brain against a scripted fake client - no network, no API costs."""

from types import SimpleNamespace

from automaton.brains.claude import ClaudeBrain
from automaton.wallet import usdc
from automaton.world import Settings, World


def text(t):
    return SimpleNamespace(type="text", text=t)


def tool_use(id, name, input):
    return SimpleNamespace(type="tool_use", id=id, name=name, input=input)


def response(content, stop_reason, model="claude-opus-5-5", input_tokens=1_000_000, output_tokens=0):
    usage = SimpleNamespace(input_tokens=input_tokens, output_tokens=output_tokens,
                            cache_read_input_tokens=None, cache_creation_input_tokens=0)
    return SimpleNamespace(content=content, stop_reason=stop_reason, model=model, usage=usage)


class FakeClient:
    def __init__(self, responses):
        self.responses = list(responses)
        self.calls = []
        self.messages = SimpleNamespace(create=lambda **kw: self._create("messages", kw))
        self.beta = SimpleNamespace(messages=SimpleNamespace(create=lambda **kw: self._create("beta", kw)))

    def _create(self, path, kwargs):
        self.calls.append((path, {**kwargs, "messages": list(kwargs["messages"])}))
        return self.responses.pop(0)


def make_world(tmp_path, client, model="claude-opus-5-5", **overrides):
    settings = Settings(seed=1, stop_file=str(tmp_path / "STOP"), **overrides)
    return World(settings, ClaudeBrain(model=model, client=client))


def test_tool_loop_runs_tools_and_charges_real_token_costs(tmp_path):
    client = FakeClient([
        response([text("Erst forschen."), tool_use("t1", "market_research", {"niche": "research"})], "tool_use"),
        response([text("Fertig.")], "end_turn", input_tokens=0, output_tokens=100_000),
    ])
    world = make_world(tmp_path, client, seed_capital=20)
    agent = world.genesis
    world.brain.think(world, agent)

    assert "research" in agent.research
    # 1M input tokens at 4 $ + 100k output tokens at 20 $ = 6 $, charged to the play wallet and tracked as real cost.
    assert -agent.wallet.sum({"llm"}) == usdc(6.0)
    assert world.api_cost == usdc(6.0)

    path, second = client.calls[1]
    assert path == "beta"
    assert second["fallbacks"] == "default" and second["betas"] == ["server-side-fallback-2026-07-01"]
    result = second["messages"][-1]["content"][0]
    assert result["type"] == "tool_result" and result["tool_use_id"] == "t1" and not result["is_error"]


def test_haiku_has_no_server_side_fallback(tmp_path):
    client = FakeClient([response([text("Nichts zu tun.")], "end_turn", model="claude-haiku-5-5")])
    world = make_world(tmp_path, client, model="claude-haiku-5-5")
    world.brain.think(world, world.genesis)
    path, kwargs = client.calls[0]
    assert path == "messages" and "fallbacks" not in kwargs
    assert -world.genesis.wallet.sum({"llm"}) == usdc(0.10)


def test_refusal_ends_the_wake_up(tmp_path):
    client = FakeClient([response([], "refusal", input_tokens=1000)])
    world = make_world(tmp_path, client)
    world.brain.think(world, world.genesis)
    assert len(client.calls) == 1
    assert "abgelehnt" in world.genesis.events[-1][1]


def test_api_budget_stops_mid_wake_up(tmp_path):
    client = FakeClient([
        response([tool_use("t1", "remember", {"note": "a"})], "tool_use", input_tokens=2_000_000),
        response([text("nie erreicht")], "end_turn"),
    ])
    world = make_world(tmp_path, client, api_budget=5.0)
    world.brain.think(world, world.genesis)
    assert "API-Budget" in world.halted
    assert len(client.calls) == 1 and world.genesis.notes == []


def test_tool_errors_are_returned_to_claude(tmp_path):
    client = FakeClient([
        response([tool_use("t1", "launch_product", {"niche": "mars", "name": "x", "price": 1, "pitch": "y"})],
                 "tool_use", input_tokens=0),
        response([text("Ok.")], "end_turn", input_tokens=0),
    ])
    world = make_world(tmp_path, client)
    world.brain.think(world, world.genesis)
    result = client.calls[1][1]["messages"][-1]["content"][0]
    assert result["is_error"] and "Unbekannte Nische" in result["content"]


def test_prompt_cache_prefix_is_stable_between_wake_ups(tmp_path):
    client = FakeClient([response([text("a")], "end_turn", input_tokens=0),
                         response([text("b")], "end_turn", input_tokens=0)])
    world = make_world(tmp_path, client)
    world.brain.think(world, world.genesis)
    world.hour += 5
    world.brain.think(world, world.genesis)
    first, second = client.calls[0][1], client.calls[1][1]
    assert first["system"] == second["system"] and first["tools"] == second["tools"]
    assert first["messages"] != second["messages"]
