"""Claude as the automaton's brain: one tool-use loop per wake-up.

Every API call costs real money on your API key. The same amount is charged to the automaton's play
wallet, so what it costs to think is part of its survival."""

from __future__ import annotations

from typing import TYPE_CHECKING

import anthropic

from ..prompts import state_text, system_prompt
from ..tools import TOOLS, ToolBox
from ..wallet import MICRO

if TYPE_CHECKING:
    from ..agent import Automaton
    from ..world import World

# Dollars per million tokens: input, output, cache read, cache write (5 min).
PRICES = {
    "claude-opus-5-5": (4.00, 20.00, 0.20, 5.00),
    "claude-sonnet-5-5": (2.00, 10.00, 0.20, 2.50),
    "claude-haiku-5-5": (0.10, 0.50, 0.01, 0.125),
    # Possible server-side fallback targets.
    "claude-opus-5": (5.00, 25.00, 0.50, 6.25),
    "claude-sonnet-5": (2.00, 10.00, 0.20, 2.50),
    "claude-opus-4-8": (5.00, 25.00, 0.50, 6.25),
}
# Models that accept server-side refusal fallbacks (Haiku has none).
FALLBACK_MODELS = {"claude-opus-5-5", "claude-sonnet-5-5"}
DEFAULT_MODEL = "claude-opus-5-5"


class ClaudeBrain:
    real_money = True

    def __init__(self, model: str = DEFAULT_MODEL, effort: str = "medium", client=None, max_steps: int = 8):
        if model not in PRICES:
            raise ValueError(f"Kein Preis für {model} hinterlegt. Bekannt: {', '.join(PRICES)}")
        self.model = model
        self.effort = effort
        self.client = client or anthropic.Anthropic()
        self.max_steps = max_steps

    def think(self, world: World, agent: Automaton) -> None:
        system = [{"type": "text", "text": system_prompt(world.settings)}]
        tools = ToolBox(world, agent)
        messages = [{"role": "user", "content": state_text(world, agent)}]
        for _ in range(self.max_steps):
            try:
                response = self._create(system, messages)
            except anthropic.RateLimitError:
                return world.event(agent, "API überlastet (429), Aufwachen übersprungen.")
            except anthropic.APIStatusError as e:
                if e.status_code < 500:
                    raise
                return world.event(agent, f"API-Fehler {e.status_code}, Aufwachen übersprungen.")
            except anthropic.APIConnectionError:
                return world.event(agent, "Keine Verbindung zur API, Aufwachen übersprungen.")

            world.charge_llm(agent, self.cost(response), real=True)
            if response.stop_reason == "refusal":
                return world.event(agent, "Claude hat diese Anfrage abgelehnt.")
            messages.append({"role": "assistant", "content": response.content})
            thought = " ".join(b.text for b in response.content if b.type == "text").strip()
            if thought:
                world.event(agent, f"Gedanke: {thought[:600]}")
            if response.stop_reason == "pause_turn":
                continue
            calls = [b for b in response.content if b.type == "tool_use"]
            if not calls or response.stop_reason != "tool_use":
                return
            if agent.wallet.balance <= 0 or world.halted:
                return
            results = []
            for call in calls:
                text, error = tools.execute(call.name, call.input)
                results.append({"type": "tool_result", "tool_use_id": call.id, "content": text, "is_error": error})
            messages.append({"role": "user", "content": results})

    def _create(self, system: list, messages: list):
        params = dict(model=self.model, max_tokens=16000, system=system, tools=TOOLS, messages=messages,
                      output_config={"effort": self.effort}, cache_control={"type": "ephemeral"})
        if self.model in FALLBACK_MODELS:
            return self.client.beta.messages.create(
                betas=["server-side-fallback-2026-07-01"], fallbacks="default", **params)
        return self.client.messages.create(**params)

    def cost(self, response) -> int:
        """Cost of one response in micro-USD, priced at the model that actually served it."""
        u = response.usage
        inp, out, read, write = PRICES.get(response.model, PRICES[self.model])
        dollars = (u.input_tokens * inp + u.output_tokens * out
                   + (u.cache_read_input_tokens or 0) * read + (u.cache_creation_input_tokens or 0) * write) / 1e6
        return round(dollars * MICRO)
