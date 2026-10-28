"""The simulation: hourly ticks, costs, sales, wake-ups, deaths, payouts, copies and selection."""

from __future__ import annotations

import json
import random
from dataclasses import dataclass
from pathlib import Path
from typing import Callable, NamedTuple, Protocol

from .agent import Automaton
from .market import FEE_RATE, Hour, Market, adjusted_niches
from .wallet import COST_KINDS, PROFIT_KINDS, RECURRING_KINDS, Wallet, fmt, usdc


class Brain(Protocol):
    def think(self, world: World, agent: Automaton) -> None: ...


@dataclass
class Settings:
    seed_capital: float = 20.0
    days: int = 30
    server_per_hour: float = 0.01  # a small VPS, ~7 $ per month
    # Payout rule found by evolution: every evening 30 % of the profit not yet paid out, above a reserve
    # of 7 days of costs. Small daily shares spread the money over almost every day.
    payout_share: float = 0.3
    reserve_days: float = 7
    min_reserve: float = 10.0
    max_population: int = 6
    max_generation: int = 3
    min_child_funding: float = 5.0
    spawn_cost: float = 1.0  # setting up a server for the copy
    max_daily_spend: float = 15.0  # discretionary spending cap per automaton and day
    spawn_approval: str = "auto"  # auto | ask | deny
    api_budget: float = 5.0  # hard cap on real Claude API spend in dollars
    stop_file: str = "STOP"  # empty: no kill switch (batch simulations)
    seed: int | None = None
    # Survival of the fittest ("Sicherheitsmodus"): weekly, automatons that lost money over the last week
    # are retired and their money goes back; only profitable ones may copy themselves, and the strongest
    # can displace the weakest when the population is full. Off by default: in the simulations it cut
    # losses but also some profit (see README).
    selection: bool = False
    selection_window_days: int = 7
    selection_min_age_days: int = 14
    founders: int = 1  # automatons started at once, each with a share of the seed and its own genome
    refund_to_fittest: bool = False  # retired automatons' money goes to the strongest one instead of back
    # Market scenario: factors on the assumptions in market.py, plus random per-run deviations.
    demand_factor: float = 1.0
    price_factor: float = 1.0
    competition_factor: float = 1.0
    cost_factor: float = 1.0
    market_uncertainty: float = 0.0


class Day(NamedTuple):
    profit: int  # operating profit of all automatons that day: sales minus every cost
    payout: int  # paid to the creator that day (profit only, not returned capital)
    creator: int  # creator's running result: payouts and returned capital minus seed
    alive: int


class World:
    def __init__(self, settings: Settings, brain: Brain,
                 approve: Callable[[Automaton, str, int, str], bool] | None = None,
                 log_path: Path | None = None, on_event: Callable[[int, str], None] | None = None):
        self.settings = settings
        self.brain = brain
        self.approve = approve or (lambda *_: False)
        self.on_event = on_event
        self.rng = random.Random(settings.seed)
        # A separate stream, so the same seed means the same market whatever the automatons do.
        market_rng = random.Random(None if settings.seed is None else f"market-{settings.seed}")
        s = settings
        self.market = Market(self.rng, adjusted_niches(
            market_rng, s.demand_factor, s.price_factor, s.competition_factor, s.cost_factor, s.market_uncertainty))
        self.creator = Wallet("creator")
        self.agents: dict[str, Automaton] = {}
        self.days: list[Day] = []
        self.hour = 0
        self.halted = ""
        self.api_cost = 0  # real money spent on the Claude API (micro-USD)
        self._log_file = log_path.open("a", encoding="utf-8") if log_path else None

        seed = usdc(settings.seed_capital)
        self.creator.debit(0, seed, "seed", "Startgeld")
        share = seed // max(1, settings.founders)
        mission = "Finde heraus, womit sich Geld verdienen lässt, und überlebe."
        self.genesis = self._create_agent(None, seed - share * (settings.founders - 1), mission)
        variant = getattr(brain, "variant", None)
        focus = [n.key for n in self.market.niches.values()]
        if settings.founders > 1:
            self.rng.shuffle(focus)
        for i in range(settings.founders - 1):
            founder = self._create_agent(None, share, mission)
            founder.focus = focus[i % len(focus)]  # spread the founders over different niches
            if variant:
                founder.genome = variant(self.rng)

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
        if self.settings.stop_file and Path(self.settings.stop_file).exists():
            return self.halt(f"Not-Aus: Datei {self.settings.stop_file} gefunden")
        if not self.alive_agents():
            return self.halt("Alle Automatons sind tot oder aussortiert")

        server = usdc(self.settings.server_per_hour * self.settings.cost_factor)
        for agent in self.alive_agents():
            agent.wallet.debit(h, server, "server")
            for p in agent.active_products():
                agent.wallet.debit(h, usdc(p.niche.hosting_per_hour), "hosting", p.id)

        products = [p for a in self.alive_agents() for p in a.active_products()]
        by_id = {p.id: p for p in products}
        visibility = {p.id: p.visibility for p in products}
        for pid, units in self.market.simulate_hour(products, h).items():
            p = by_id[pid]
            wallet = self.agents[p.owner].wallet
            revenue = usdc(p.price) * units
            fulfillment = usdc(p.niche.unit_cost) * units
            fee = round(revenue * FEE_RATE)
            if units:
                wallet.credit(h, revenue, "sale", f"{units}× {p.name}")
                wallet.debit(h, fulfillment, "fulfillment", p.id)
                wallet.debit(h, fee, "fee", p.id)
            cost = fulfillment + fee + usdc(p.niche.hosting_per_hour)
            p.history.append(Hour(h, units, revenue, cost, p.price, visibility[p.id]))

        self._bury_the_broke()
        for agent in sorted(self.alive_agents(), key=lambda a: a.id):
            if agent.next_wake <= h and agent.alive and not self.halted:
                self._wake(agent)
        self._bury_the_broke()

        if h % 24 == 23:
            for agent in self.alive_agents():
                self._pay_out(agent)
            if self.settings.selection and (h // 24 + 1) % self.settings.selection_window_days == 0:
                self._select()
            self._record_day()
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
        server = usdc(self.settings.server_per_hour * self.settings.cost_factor)
        fixed = server + sum(usdc(p.niche.hosting_per_hour) for p in agent.active_products())
        recent = agent.wake_costs[-10:]
        per_wake = sum(recent) / len(recent) if recent else 0
        return round(24 * fixed + 24 / agent.heartbeat_hours * per_wake)

    def recurring_costs(self, agent: Automaton, since: int) -> int:
        return -agent.wallet.sum(RECURRING_KINDS, since)

    def reserve(self, agent: Automaton) -> int:
        return max(usdc(self.settings.min_reserve), round(self.daily_burn(agent) * self.settings.reserve_days))

    def fitness(self, agent: Automaton) -> int:
        """Operating profit over the selection window: what counts in the survival of the fittest."""
        return agent.wallet.sum(PROFIT_KINDS, since=self.hour - 24 * self.settings.selection_window_days + 1)

    def is_judged(self, agent: Automaton) -> bool:
        return self.hour - agent.born_hour >= 24 * self.settings.selection_min_age_days

    def payout_target(self, agent: Automaton) -> tuple[Wallet, str]:
        parent = self.agents.get(agent.parent_id or "")
        if parent and parent.alive:
            return parent.wallet, parent.name
        return self.creator, "deinen Erschaffer"

    def spawn(self, parent: Automaton, niche_key: str, funding: int, mission: str) -> tuple[Automaton | None, str]:
        s = self.settings
        if s.spawn_approval == "deny":
            return None, "Kopien sind in dieser Welt deaktiviert."
        if s.selection and self.fitness(parent) <= 0:
            return None, "Nur wer in der letzten Woche Gewinn gemacht hat, darf sich kopieren."
        if parent.generation + 1 > s.max_generation:
            return None, f"Maximale Generation ({s.max_generation}) erreicht."
        if funding < usdc(s.min_child_funding):
            return None, f"Startgeld für eine Kopie muss mindestens {fmt(usdc(s.min_child_funding))} sein."
        total = funding + usdc(s.spawn_cost)
        if parent.wallet.balance - total < 7 * self.daily_burn(parent):
            return None, "Nach der Kopie bliebe dir weniger als 7 Tage Reichweite."
        weakest = None
        if len(self.alive_agents()) >= s.max_population:
            rivals = [a for a in self.alive_agents() if a is not parent and self.is_judged(a)]
            weakest = min(rivals, key=self.fitness, default=None)
            if not s.selection or weakest is None or self.fitness(weakest) >= self.fitness(parent):
                return None, f"Die Population ist voll (maximal {s.max_population} lebende Automatons)."
        if s.spawn_approval == "ask" and not self.approve(parent, niche_key, funding, mission):
            return None, "Dein Erschaffer hat die Kopie abgelehnt."
        if weakest:
            self.retire(weakest, f"verdrängt von {parent.name}")
        parent.wallet.debit(self.hour, usdc(s.spawn_cost), "spawn", "Server für Kopie")
        child = self._create_agent(parent, funding, mission)
        child.mission = f"{mission} (Schwerpunkt: {niche_key})"
        child.focus = niche_key
        inherit = getattr(self.brain, "inherit", None)
        if inherit:
            child.genome = inherit(parent, self.rng)
        return child, f"{child.name} lebt, Startgeld {fmt(funding)}."

    def retire(self, agent: Automaton, reason: str) -> None:
        """Switch an automaton off before it burns its money; what is left goes back up the family tree."""
        agent.alive = False
        agent.died_hour = self.hour
        agent.cause_of_death = f"aussortiert, {reason}"
        for p in agent.active_products():
            p.active = False
        target, label = self.payout_target(agent)
        if self.settings.refund_to_fittest and self.alive_agents():
            fittest = max(self.alive_agents(), key=self.fitness)
            target, label = fittest.wallet, fittest.name
        left = agent.wallet.balance
        agent.wallet.transfer(self.hour, target, left, "refund_out", "refund_in", agent.id)
        self.event(agent, f"{agent.name} aussortiert ({reason}), {fmt(max(left, 0))} zurück an {label}.")

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

    def _select(self) -> None:
        """Weekly selection: whoever lost money over the last week is retired before losing more."""
        for agent in sorted(self.alive_agents(), key=lambda a: a.id):
            if self.is_judged(agent) and self.fitness(agent) < 0:
                self.retire(agent, f"Verlust von {fmt(-self.fitness(agent))} in {self.settings.selection_window_days} Tagen")

    def _record_day(self) -> None:
        since = self.hour - 23
        profit = sum(a.wallet.sum(PROFIT_KINDS, since) for a in self.agents.values())
        self.days.append(Day(profit, self.creator.sum({"payout_in"}, since), self.creator.balance,
                             len(self.alive_agents())))

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
