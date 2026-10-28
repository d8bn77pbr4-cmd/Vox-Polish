from __future__ import annotations

from dataclasses import dataclass, field

from .market import Product
from .wallet import Wallet

MAX_NOTES = 12
MAX_EVENTS = 40


@dataclass
class Automaton:
    id: str
    name: str
    generation: int
    parent_id: str | None
    wallet: Wallet
    mission: str
    born_hour: int
    focus: str | None = None  # niche a copy was created for
    genome: object | None = None  # strategy the brain uses for this automaton, inherited with mutations
    heartbeat_hours: int = 6
    next_wake: int = 0
    alive: bool = True
    died_hour: int | None = None
    cause_of_death: str = ""
    products: list[Product] = field(default_factory=list)
    research: dict[str, dict] = field(default_factory=dict)
    notes: list[str] = field(default_factory=list)
    events: list[tuple[int, str]] = field(default_factory=list)
    children: list[str] = field(default_factory=list)
    wake_costs: list[int] = field(default_factory=list)  # LLM cost of each wake-up
    wakes: int = 0

    def active_products(self) -> list[Product]:
        return [p for p in self.products if p.active]

    def product(self, product_id: str) -> Product | None:
        return next((p for p in self.products if p.id == product_id), None)

    def remember(self, note: str) -> None:
        self.notes.append(note)
        del self.notes[:-MAX_NOTES]

    def log(self, hour: int, text: str) -> None:
        self.events.append((hour, text))
        del self.events[:-MAX_EVENTS]
