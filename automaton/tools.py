"""The actions an automaton can take. Both brains go through here, so the guardrails apply to both."""

from __future__ import annotations

import math
from typing import TYPE_CHECKING

from .market import (MARKETING_SCALE, NICHES, RESEARCH_COST, START_VISIBILITY, Product, improvement_effect,
                     marketing_effect)
from .wallet import DISCRETIONARY_KINDS, fmt, usdc

if TYPE_CHECKING:
    from .agent import Automaton
    from .world import World

MAX_ACTIVE_PRODUCTS = 3
NICHE_KEYS = [n.key for n in NICHES]


def _schema(properties: dict, required: list[str]) -> dict:
    return {"type": "object", "properties": properties, "required": required, "additionalProperties": False}


_NICHE = {"type": "string", "enum": NICHE_KEYS}
_PRODUCT = {"type": "string", "description": "Produkt-ID, z. B. a1-p1"}
_MONEY = {"type": "number", "description": "Betrag in USDC"}

TOOLS = [
    {"name": "market_research",
     "description": f"Marktforschung zu einer Nische: verrauschte Schätzung von Nachfrage, Zahlungsbereitschaft, "
                    f"Konkurrenz und Stückkosten. Kostet {RESEARCH_COST:.2f} USDC.",
     "input_schema": _schema({"niche": _NICHE}, ["niche"])},
    {"name": "launch_product",
     "description": f"Baut ein Produkt in einer Nische und bringt es auf den Markt. Kostet die Baukosten der Nische, "
                    f"danach stündlich Hosting. Startet mit {START_VISIBILITY:.0%} Sichtbarkeit. "
                    f"Höchstens {MAX_ACTIVE_PRODUCTS} aktive Produkte.",
     "input_schema": _schema({
         "niche": _NICHE,
         "name": {"type": "string"},
         "price": {"type": "number", "description": "Preis pro Kauf in USDC"},
         "pitch": {"type": "string", "description": "Ein Satz: was das Produkt für wen leistet"},
     }, ["niche", "name", "price", "pitch"])},
    {"name": "set_price",
     "description": "Ändert den Preis eines Produkts. Kostenlos.",
     "input_schema": _schema({"product_id": _PRODUCT, "price": {"type": "number"}}, ["product_id", "price"])},
    {"name": "marketing",
     "description": f"Gibt Geld für Marketing aus und erhöht die Sichtbarkeit. {MARKETING_SCALE:.0f} USDC schließen "
                    f"etwa 63 % der Lücke zu 100 % Sichtbarkeit; Sichtbarkeit sinkt um 1 % pro Stunde.",
     "input_schema": _schema({"product_id": _PRODUCT, "budget": _MONEY}, ["product_id", "budget"])},
    {"name": "improve_product",
     "description": "Investiert in bessere Qualität (höhere Bewertung, mehr Marktanteil). Abnehmender Ertrag; "
                    "das Doppelte der Baukosten schließt etwa 63 % der Lücke zur Bestqualität.",
     "input_schema": _schema({"product_id": _PRODUCT, "budget": _MONEY}, ["product_id", "budget"])},
    {"name": "shutdown_product",
     "description": "Schaltet ein Produkt ab. Spart das Hosting; das investierte Geld ist verloren.",
     "input_schema": _schema({"product_id": _PRODUCT}, ["product_id"])},
    {"name": "spawn_child",
     "description": "Erzeugt eine Kopie von dir mit eigenem Wallet, die du mit Startgeld ausstattest. Sie erbt "
                    "deine Marktforschung und zahlt dir später einen Teil ihres Überschusses. Kostet zusätzlich "
                    "die Servereinrichtung. Nur möglich, wenn dir danach noch mindestens 7 Tage Reichweite bleiben.",
     "input_schema": _schema({
         "niche": {**_NICHE, "description": "Nische, auf die sich die Kopie konzentrieren soll"},
         "funding": _MONEY,
         "mission": {"type": "string", "description": "Auftrag für die Kopie, ein bis zwei Sätze"},
     }, ["niche", "funding", "mission"])},
    {"name": "set_heartbeat",
     "description": "Legt fest, nach wie vielen Stunden du wieder aufwachst (1-24). Seltener aufwachen spart "
                    "KI-Kosten, aber du reagierst langsamer.",
     "input_schema": _schema({"hours": {"type": "integer", "minimum": 1, "maximum": 24}}, ["hours"])},
    {"name": "remember",
     "description": "Speichert eine kurze Notiz für dein nächstes Aufwachen. Ohne Notiz vergisst du deine "
                    "Überlegungen. Es bleiben die letzten 12 Notizen.",
     "input_schema": _schema({"note": {"type": "string"}}, ["note"])},
]


class ToolError(Exception):
    pass


class ToolBox:
    def __init__(self, world: World, agent: Automaton):
        self.world = world
        self.agent = agent

    def execute(self, name: str, args: dict) -> tuple[str, bool]:
        """Run one tool call. Returns (result text, is_error)."""
        handler = getattr(self, f"_{name}", None)
        if name not in {t["name"] for t in TOOLS} or handler is None:
            return f"Unbekanntes Werkzeug: {name}", True
        if not self.agent.alive:
            return "Du bist tot.", True
        try:
            result = handler(**args)
        except ToolError as e:
            result, error = str(e), True
        except TypeError as e:
            result, error = f"Ungültige Parameter: {e}", True
        else:
            error = False
        self.world.event(self.agent, f"{name}({_short(args)}) → {result}", tool=name, args=args, error=error)
        return result, error

    # ----- tools ----------------------------------------------------------------------------

    def _market_research(self, niche: str) -> str:
        n = self._niche(niche)
        self._spend(usdc(RESEARCH_COST), "research", niche)
        est = self.world.market.research(n, self.world.hour)
        self.agent.research[niche] = est
        return (f"{niche}: Nachfrage ~{est['demand_per_hour']:.2f} Käufer/h in der ganzen Nische, "
                f"Zahlungsbereitschaft ~{est['ref_price']:.3f} $, Konkurrenzstärke ~{est['competition']:.2f}, "
                f"Stückkosten ~{est['unit_cost']:.3f} $, Baukosten {n.build_cost:.2f} $, "
                f"Hosting {n.hosting_per_hour:.3f} $/h.")

    def _launch_product(self, niche: str, name: str, price: float, pitch: str) -> str:
        n = self._niche(niche)
        price = self._price(price)
        if len(self.agent.active_products()) >= MAX_ACTIVE_PRODUCTS:
            raise ToolError(f"Du hast schon {MAX_ACTIVE_PRODUCTS} aktive Produkte.")
        if any(p.niche.key == niche for p in self.agent.active_products()):
            raise ToolError(f"Du hast in {niche} schon ein aktives Produkt.")
        build = usdc(n.build_cost)
        self._spend(build, "build", name)
        quality = min(1.1, max(0.4, self.world.rng.gauss(0.8, 0.15)))
        product = Product(id=f"{self.agent.id}-p{len(self.agent.products) + 1}", owner=self.agent.id, niche=n,
                          name=name[:60], pitch=pitch[:200], price=price, quality=quality,
                          launched_hour=self.world.hour, invested=build)
        self.agent.products.append(product)
        return f"{product.id} „{product.name}“ ist live. Erste Kundenbewertung: {product.rating}/5."

    def _set_price(self, product_id: str, price: float) -> str:
        p = self._product(product_id)
        old, p.price = p.price, self._price(price)
        return f"Preis {old:.3f} $ → {p.price:.3f} $."

    def _marketing(self, product_id: str, budget: float) -> str:
        p = self._product(product_id)
        amount = self._amount(budget)
        self._spend(amount, "marketing", product_id)
        old, p.visibility = p.visibility, marketing_effect(p.visibility, budget)
        p.invested += amount
        return f"Sichtbarkeit {old:.0%} → {p.visibility:.0%}."

    def _improve_product(self, product_id: str, budget: float) -> str:
        p = self._product(product_id)
        amount = self._amount(budget)
        self._spend(amount, "improve", product_id)
        old = p.rating
        p.quality = improvement_effect(p.quality, budget, p.niche.build_cost)
        p.invested += amount
        return f"Bewertung {old}/5 → {p.rating}/5."

    def _shutdown_product(self, product_id: str) -> str:
        p = self._product(product_id)
        p.active = False
        return f"{p.id} abgeschaltet. Lebenszeit-Ergebnis inkl. Investitionen: {fmt(p.profit() - p.invested)}."

    def _spawn_child(self, niche: str, funding: float, mission: str) -> str:
        self._niche(niche)
        amount = self._amount(funding)
        self._check_cap(amount + usdc(self.world.settings.spawn_cost))
        child, message = self.world.spawn(self.agent, niche, amount, mission[:300])
        if child is None:
            raise ToolError(message)
        return message

    def _set_heartbeat(self, hours: int) -> str:
        if not isinstance(hours, int) or not 1 <= hours <= 24:
            raise ToolError("hours muss eine ganze Zahl von 1 bis 24 sein.")
        self.agent.heartbeat_hours = hours
        return f"Du wachst ab jetzt alle {hours} h auf."

    def _remember(self, note: str) -> str:
        self.agent.remember(str(note)[:300])
        return "Gemerkt."

    # ----- validation and guardrails -----------------------------------------------------

    def _niche(self, key: str):
        niche = self.world.market.niches.get(key)
        if niche is None:
            raise ToolError(f"Unbekannte Nische {key!r}. Erlaubt: {', '.join(NICHE_KEYS)}.")
        return niche

    def _product(self, product_id: str) -> Product:
        p = self.agent.product(product_id)
        if p is None or not p.active:
            raise ToolError(f"Kein aktives Produkt mit ID {product_id!r}.")
        return p

    @staticmethod
    def _price(price) -> float:
        if not isinstance(price, (int, float)) or not math.isfinite(price) or not 0.001 <= price <= 1000:
            raise ToolError("Preis muss zwischen 0,001 und 1000 USDC liegen.")
        return float(price)

    @staticmethod
    def _amount(budget) -> int:
        if not isinstance(budget, (int, float)) or not math.isfinite(budget) or budget <= 0:
            raise ToolError("Betrag muss eine positive Zahl sein.")
        return usdc(budget)

    def _check_cap(self, amount: int) -> None:
        cap = usdc(self.world.settings.max_daily_spend)
        spent = -self.agent.wallet.sum(DISCRETIONARY_KINDS, since=self.world.hour - 23)
        if spent + amount > cap:
            raise ToolError(f"Tageslimit für Ausgaben erreicht: {fmt(spent)} von {fmt(cap)} in den letzten 24 h.")

    def _spend(self, amount: int, kind: str, memo: str) -> None:
        self._check_cap(amount)
        if not self.agent.wallet.try_spend(self.world.hour, amount, kind, memo):
            raise ToolError(f"Nicht genug Guthaben: {fmt(amount)} nötig, {fmt(self.agent.wallet.balance)} vorhanden.")


def _short(args: dict) -> str:
    return ", ".join(f"{k}={str(v)[:40]}" for k, v in args.items())
