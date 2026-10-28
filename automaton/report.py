from __future__ import annotations

from typing import TYPE_CHECKING

from .wallet import COST_KINDS, fmt, usdc

if TYPE_CHECKING:
    from .agent import Automaton
    from .world import World


def summary(world: World) -> str:
    h = world.hour
    lines = [f"=== Ergebnis nach {h // 24} Tagen und {h % 24} Stunden ==="]
    if world.halted:
        lines.append(f"Angehalten: {world.halted}")
    lines.append("")

    def walk(agent: Automaton, depth: int) -> None:
        indent = "   " * depth
        status = "lebt" if agent.alive else f"tot seit Tag {agent.died_hour // 24 + 1} ({agent.cause_of_death})"
        lines.append(
            f"{indent}{'└─ ' if depth else ''}{agent.name} (Generation {agent.generation}) – {status}\n"
            f"{indent}   Kontostand {fmt(agent.wallet.balance)} | Umsatz {fmt(agent.wallet.sum({'sale'}))} | "
            f"Kosten {fmt(-agent.wallet.sum(COST_KINDS))} | ausgezahlt {fmt(-agent.wallet.sum({'payout_out'}))} | "
            f"{agent.wakes}× aufgewacht")
        for p in agent.products:
            off = "" if p.active else " (abgeschaltet)"
            lines.append(f"{indent}   · {p.name} [{p.niche.key}] {p.units(0)} Verkäufe, Umsatz {fmt(p.revenue())}, "
                         f"Ergebnis inkl. Investitionen {fmt(p.profit() - p.invested)}{off}")
        for cid in agent.children:
            walk(world.agents[cid], depth + 1)

    walk(world.genesis, 0)
    payouts = world.creator.sum({"payout_in"})
    refunds = world.creator.sum({"refund_in"})
    in_wallets = sum(a.wallet.balance for a in world.alive_agents())
    days = world.days
    rows = [
        ("Dein Startgeld:", fmt(usdc(world.settings.seed_capital))),
        ("An dich ausgezahlt (Gewinn):", fmt(payouts)),
        ("Zurück von Aussortierten:", fmt(refunds)),
        ("Dein Ergebnis:", fmt(world.creator.balance)),
        ("Noch in lebenden Wallets:", fmt(in_wallets)),
    ]
    if days:
        rows.append(("Tage mit Gewinn:", f"{sum(d.profit > 0 for d in days)} von {len(days)}, "
                                         f"mit Auszahlung an dich: {sum(d.payout > 0 for d in days)}"))
    if world.api_cost:
        rows.append(("Echte API-Kosten:", fmt(world.api_cost)))
    lines += [""] + [f"{label:<30}{value}" for label, value in rows]
    return "\n".join(lines)


def to_dict(world: World) -> dict:
    return {
        "hours": world.hour,
        "halted": world.halted,
        "settings": vars(world.settings),
        "creator_result_usdc": world.creator.balance / 1e6,
        "payouts_usdc": world.creator.sum({"payout_in"}) / 1e6,
        "refunds_usdc": world.creator.sum({"refund_in"}) / 1e6,
        "days": [d._asdict() for d in world.days],
        "api_cost_usd": world.api_cost / 1e6,
        "agents": [{
            "id": a.id, "name": a.name, "generation": a.generation, "parent": a.parent_id,
            "alive": a.alive, "born_hour": a.born_hour, "died_hour": a.died_hour,
            "balance_usdc": a.wallet.balance / 1e6, "revenue_usdc": a.wallet.sum({"sale"}) / 1e6,
            "notes": a.notes,
            "products": [{"id": p.id, "niche": p.niche.key, "name": p.name, "price": p.price, "active": p.active,
                          "units": p.units(0), "revenue_usdc": p.revenue() / 1e6,
                          "result_usdc": (p.profit() - p.invested) / 1e6} for p in a.products],
        } for a in world.agents.values()],
    }
