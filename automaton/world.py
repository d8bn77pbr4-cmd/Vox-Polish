"""The simulation: hourly ticks, costs, sales, wake-ups, deaths, payouts and copies."""

from __future__ import annotations

import json
import random
from dataclasses import dataclass
from pathlib import Path
from typing import Callable, Protocol

from .agent import Automaton
from .market import FEE_RATE, Market
from .wallet import COST_KINDS, RECURRING_KINDS, Wallet, fmt, usdc


class Brain(Protocol):
    def think(self, world: World, agent: Automaton) -> None: ...


@dataclass
class Settings:
    seed_capital: float = 20.0
    days: int = 30
    server_per_hour: float = 0.01  # a small VPS, ~7 $ per month
    payout_share: float = 0.5  # share of the daily surplus paid to the creator (or parent)
    reserve_days: float = 14  # runway an automaton keeps before paying out
    min_reserve: float = 10.0
    max_population: int = 6
    max_generation: int = 3
    min_child_funding: float = 5.0
    spawn_cost: float = 1.0  # setting up a server for the copy
    max_daily_spend: float = 15.0  # discretionary spending cap per automaton and day
    spawn_approval: str = "auto"  # auto | ask | deny
    api_budget: float = 5.0  # hard cap on real Claude API spend in dollars
    stop_file: str = "STOP"
    seed: int | None = None


class World:
    def __init__(self, settings: Settings, brain: Brain,
                 approve: Callable[[Automaton, str, int, str], bool] | None = None,
                 log_path: Path | None = None, on_event: Callable[[int, str], None] | None = None):
        self.settings = settings
        self.brain = brain
        self.approve = approve or (lambda *_: False)
        self.on_event = on_event
        self.rng = random.Random(settings.seed)
        self.market = Market(self.rng)
        self.creator = Wallet("creator")
        self.agents: dict[str, Automaton] = {}
        self.hour = 0
        self.halted = ""
        self.api_cost = 0  # real money spent on the Claude API (micro-USD)
        self._log_file = log_path.open("a", encoding="utf-8") if log_path else None

        seed = usdc(settings.seed_capital)
        self.creator.debit(0, seed, "seed", "Startgeld")
        self.genesis = self._create_agent(None, seed, "Finde heraus, womit sich Geld verdienen lässt, und überlebe.")

    # ----- running -------------------------------------------------------------------------

    def run(self, on_day: Callable[[World], None] | None = None) -> None:
        try:
            while self.hour < self.settings.days * 24 and not self.halted:
                self.step()
                if on_day and self.hour % 24 == 0:
                    on_day(self)
        finally:
            if self._log_file:
                self._log_file.close()

    def step(self) -> None:
        h = self.hour
        if Path(self.settings.stop_file).exists():
            return self.halt(f"Not-Aus: Datei {self.settings.stop_file} gefunden")
        if not self.alive_agents():
            return self.halt("Alle Automatons sind tot")

        for agent in self.alive_agents():
            agent.wallet.debit(h, usdc(self.settings.server_per_hour), "server")
            for p in agent.active_products():
                agent.wallet.debit(h, usdc(p.niche.hosting_per_hour), "hosting", p.id)

        products = [p for a in self.alive_agents() for p in a.active_products()]
        by_id = {p.id: p for p in products}
        sales = self.market.simulate_hour(products, h)
        for pid, units in sales.items():
            p = by_id[pid]
            wallet = self.agents[p.owner].wallet
            revenue = usdc(p.price) * units
            fulfillment = usdc(p.niche.unit_cost) * units
            fee = round(revenue * FEE_RATE)
            hosting = usdc(p.niche.hosting_per_hour)
            if units:
                wallet.credit(h, revenue, "sale", f"{units}× {p.name}")
                wallet.debit(h, fulfillment, "fulfillment", p.id)
                wallet.debit(h, fee, "fee", p.id)
            p.history.append((h, units, revenue, fulfillment + fee + hosting))

        self._bury_the_broke()
        for agent in sorted(self.alive_agents(), key=lambda a: a.id):
            if agent.next_wake <= h and agent.alive and not self.halted:
                self._wake(agent)
        self._bury_the_broke()

        if h % 24 == 23:
            for agent in self.alive_agents():
                self._pay_out(agent)
        self.hour += 1

    def halt(self, reason: str) -> None:
        self.halted = reason
        self.event(None, f"Simulation angehalten: {reason}")

    # ----- helpers used by brains and tools ------------------------------------------------

    def alive_agents(self) -> list[Automaton]:
        return [a for a in self.agents.values() if a.alive]

    def charge_llm(self, agent: Automaton, amount: int, real: bool) -> None:
        agent.wallet.debit(self.hour, amount, "llm")
        if real:
            self.api_cost += amount
            if self.api_cost >= usdc(self.settings.api_budget):
                self.halt(f"API-Budget von {fmt(usdc(self.settings.api_budget))} erreicht")

    def daily_burn(self, agent: Automaton) -> int:
        """Expected recurring cost per day: server, hosting and thinking at the current heartbeat."""
        fixed = usdc(self.settings.server_per_hour) + sum(usdc(p.niche.hosting_per_hour) for p in agent.active_products())
        recent = agent.wake_costs[-10:]
        per_wake = sum(recent) / len(recent) if recent else 0
        return round(24 * fixed + 24 / agent.heartbeat_hours * per_wake)

    def recurring_costs(self, agent: Automaton, since: int) -> int:
        return -agent.wallet.sum(RECURRING_KINDS, since)

    def reserve(self, agent: Automaton) -> int:
        return max(usdc(self.settings.min_reserve), round(self.daily_burn(agent) * self.settings.reserve_days))

    def payout_target(self, agent: Automaton) -> tuple[Wallet, str]:
        parent = self.agents.get(agent.parent_id or "")
        if parent and parent.alive:
            return parent.wallet, parent.name
        return self.creator, "deinen Erschaffer"

    def spawn(self, parent: Automaton, niche_key: str, funding: int, mission: str) -> tuple[Automaton | None, str]:
        s = self.settings
        if s.spawn_approval == "deny":
            return None, "Kopien sind in dieser Welt deaktiviert."
        if len(self.alive_agents()) >= s.max_population:
            return None, f"Die Population ist voll (maximal {s.max_population} lebende Automatons)."
        if parent.generation + 1 > s.max_generation:
            return None, f"Maximale Generation ({s.max_generation}) erreicht."
        if funding < usdc(s.min_child_funding):
            return None, f"Startgeld für eine Kopie muss mindestens {fmt(usdc(s.min_child_funding))} sein."
        total = funding + usdc(s.spawn_cost)
        if parent.wallet.balance - total < 7 * self.daily_burn(parent):
            return None, "Nach der Kopie bliebe dir weniger als 7 Tage Reichweite."
        if s.spawn_approval == "ask" and not self.approve(parent, niche_key, funding, mission):
            return None, "Dein Erschaffer hat die Kopie abgelehnt."
        parent.wallet.debit(self.hour, usdc(s.spawn_cost), "spawn", "Server für Kopie")
        child = self._create_agent(parent, funding, mission)
        child.mission = f"{mission} (Schwerpunkt: {niche_key})"
        child.focus = niche_key
        return child, f"{child.name} lebt, Startgeld {fmt(funding)}."

    def event(self, agent: Automaton | None, text: str, **data) -> None:
        if agent:
            agent.log(self.hour, text)
        if self.on_event:
            self.on_event(self.hour, f"{agent.name}: {text}" if agent else text)
        if self._log_file:
            row = {"hour": self.hour, "agent": agent.id if agent else None, "text": text, **data}
            self._log_file.write(json.dumps(row, ensure_ascii=False) + "\n")

    # ----- internals ------------------------------------------------------------------------

    def _create_agent(self, parent: Automaton | None, funding: int, mission: str) -> Automaton:
        n = len(self.agents) + 1
        agent = Automaton(
            id=f"a{n}", name=f"Automaton-{n}",
            generation=parent.generation + 1 if parent else 0,
            parent_id=parent.id if parent else None,
            wallet=Wallet(f"0xsim{self.rng.getrandbits(40):010x}"),
            mission=mission, born_hour=self.hour, next_wake=self.hour + (1 if parent else 0),
        )
        self.agents[agent.id] = agent
        if parent:
            parent.wallet.transfer(self.hour, agent.wallet, funding, "funding_out", "funding_in", agent.id)
            parent.children.append(agent.id)
            agent.research = {k: dict(v) for k, v in parent.research.items()}
            agent.notes = [f"Von {parent.name} geerbt: {note}" for note in parent.notes[-3:]]
        else:
            agent.wallet.credit(self.hour, funding, "seed", "Startgeld")
        self.event(agent, f"{agent.name} geboren (Generation {agent.generation}) mit {fmt(funding)}.")
        return agent

    def _wake(self, agent: Automaton) -> None:
        before = agent.wallet.sum({"llm"})
        self.brain.think(self, agent)
        agent.wakes += 1
        agent.wake_costs.append(before - agent.wallet.sum({"llm"}))
        agent.next_wake = self.hour + agent.heartbeat_hours

    def _bury_the_broke(self) -> None:
        for agent in self.alive_agents():
            if agent.wallet.balance <= 0:
                agent.alive = False
                agent.died_hour = self.hour
                agent.cause_of_death = "Wallet leer"
                for p in agent.active_products():
                    p.active = False
                self.event(agent, f"{agent.name} ist gestorben: Wallet leer.")

    def profit_to_date(self, agent: Automaton) -> int:
        """Sales and payouts received minus all operating costs. Seed money and child funding are not profit."""
        return agent.wallet.sum({"sale", "payout_in"}) + agent.wallet.sum(COST_KINDS)

    def _pay_out(self, agent: Automaton) -> None:
        """Pay out a share of real profit only, and only above the reserve - never the seed money."""
        unpaid_profit = self.profit_to_date(agent) + agent.wallet.sum({"payout_out"})
        surplus = min(agent.wallet.balance - self.reserve(agent), unpaid_profit)
        if surplus <= 0:
            return
        amount = round(surplus * self.settings.payout_share)
        target, label = self.payout_target(agent)
        if agent.wallet.transfer(self.hour, target, amount, "payout_out", "payout_in", agent.id):
            self.event(agent, f"Auszahlung {fmt(amount)} an {label}.", amount=amount)
