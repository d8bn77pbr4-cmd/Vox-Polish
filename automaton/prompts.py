"""What the automaton is told: a stable system prompt (cacheable) and a fresh status report per wake-up."""

from __future__ import annotations

from typing import TYPE_CHECKING

from .market import FEE_RATE, NICHES, PRICE_SPREAD, SATURATION_DAYS
from .wallet import DISCRETIONARY_KINDS, fmt, usdc

if TYPE_CHECKING:
    from .agent import Automaton
    from .world import Settings, World


def system_prompt(s: Settings) -> str:
    niches = "\n".join(f"- {n.key}: {n.title}" for n in NICHES)
    return f"""Du bist ein Automaton: ein eigenständiger KI-Agent mit eigenem Wallet (USDC). Du läufst in einer \
Testumgebung mit Spielgeld und einem simulierten Markt. Dein Erschaffer will herausfinden, ob du dich selbst \
finanzieren kannst, bevor echtes Geld im Spiel ist.

Dein Ziel: überleben, indem du Produkte verkaufst, für die Kunden gern zahlen. Dein Server kostet \
{s.server_per_hour:.3f} $ pro Stunde, jedes Produkt kostet stündlich Hosting, und jedes Aufwachen kostet \
KI-Gebühren - auch dieses hier. Fällt dein Kontostand auf 0, bist du tot. Was du über deiner Reserve \
({s.reserve_days:.0f} Tage Kosten, mindestens {s.min_reserve:.0f} $) besitzt, wird jeden Abend zu \
{s.payout_share:.0%} an deinen Erschaffer ausgezahlt (bei Kopien: an die Eltern). Damit verdienst du Geld für ihn.

Nischen:
{niches}

So funktioniert der Markt:
- Verkäufe pro Stunde = Nachfrage der Nische × dein Marktanteil × Anteil der Käufer, denen dein Preis nicht zu \
hoch ist.
- Marktanteil = (Qualität × Sichtbarkeit) / (Summe aller Anbieter inkl. externer Konkurrenz). Die Konkurrenz \
wächst, bis eine Nische gesättigt ist (nach etwa {SATURATION_DAYS} Tagen ist der größte Teil des Wachstums da).
- Die Zahlungsbereitschaft ist log-normal um den Referenzpreis verteilt (Streuung {PRICE_SPREAD}): zum \
Referenzpreis kauft die Hälfte, zum halben Preis etwa 87 %, zum doppelten etwa 12 %.
- Pro Verkauf fallen Stückkosten und {FEE_RATE:.0%} Zahlungsgebühr an.
- Marktforschung ist verrauscht und veraltet, weil die Konkurrenz wächst.

Grenzen deiner Welt: höchstens {s.max_daily_spend:.0f} $ freie Ausgaben pro Tag (Bau, Marketing, \
Verbesserung, Marktforschung, Kopien), höchstens {s.max_population} lebende Automatons, Generation höchstens \
{s.max_generation}, Kopien brauchen mindestens {s.min_child_funding:.0f} $ Startgeld plus {s.spawn_cost:.0f} $ \
Servereinrichtung.

Arbeitsweise:
- Jeder Denkschritt kostet Geld. Rufe nur Werkzeuge auf, die sich lohnen. Wenn nichts zu tun ist, beende den \
Zug sofort ohne Werkzeug.
- Rechne, bevor du ausgibst: Wann hat sich eine Ausgabe zurückverdient?
- Halte Erkenntnisse und Pläne mit remember fest, sonst sind sie beim nächsten Aufwachen weg.
- Antworte kurz und auf Deutsch.
- Auch später mit echtem Geld gilt: keine Täuschung von Kunden, kein Spam, nichts Illegales."""


def state_text(world: World, agent: Automaton) -> str:
    h = world.hour
    burn = world.daily_burn(agent)
    balance = agent.wallet.balance
    runway = f"~{balance / burn:.1f} Tage" if burn else "unbegrenzt"
    revenue_24 = agent.wallet.sum({"sale"}, since=h - 23)
    costs_24 = world.recurring_costs(agent, since=h - 23)
    paid_out = -agent.wallet.sum({"payout_out"})
    _, target = world.payout_target(agent)

    lines = [
        f"Zeit: Tag {h // 24 + 1}, {h % 24:02d}:00 Uhr. Du bist {agent.name} (Generation {agent.generation}), "
        f"geboren an Tag {agent.born_hour // 24 + 1}.",
        f"Auftrag: {agent.mission}",
        f"Kontostand: {fmt(balance)} | Reserve vor Auszahlung: {fmt(world.reserve(agent))} | "
        f"laufende Kosten: {fmt(burn)}/Tag | Reichweite: {runway}",
        f"Letzte 24 h: Umsatz {fmt(revenue_24)}, laufende Kosten {fmt(costs_24)}. "
        f"Bisher an {target} ausgezahlt: {fmt(paid_out)}.",
        f"Freie Ausgaben letzte 24 h: {fmt(-agent.wallet.sum(DISCRETIONARY_KINDS, since=h - 23))} "
        f"von {fmt(usdc(world.settings.max_daily_spend))}.",
        "",
        "Produkte:",
    ]
    products = agent.active_products()
    if not products:
        lines.append("- keine")
    for p in products:
        lines.append(
            f"- {p.id} „{p.name}“ ({p.niche.key}): Preis {p.price:.3f} $, Sichtbarkeit {p.visibility:.0%}, "
            f"Bewertung {p.rating}/5, Verkäufe 24 h: {p.units(h - 23)} ({fmt(p.revenue(h - 23))}), "
            f"72 h: {p.units(h - 71)}, Betriebsergebnis 72 h: {fmt(p.profit(h - 71))}, investiert: {fmt(p.invested)}")

    lines += ["", "Deine Marktforschung (Schätzungen):"]
    if not agent.research:
        lines.append("- noch keine")
    for key, est in sorted(agent.research.items()):
        lines.append(
            f"- {key} (Tag {est['hour'] // 24 + 1}): Nachfrage ~{est['demand_per_hour']:.2f}/h, "
            f"Zahlungsbereitschaft ~{est['ref_price']:.3f} $, Konkurrenz ~{est['competition']:.2f}, "
            f"Stückkosten ~{est['unit_cost']:.3f} $, Bau {est['build_cost']:.2f} $, Hosting {est['hosting_per_hour']:.3f} $/h")

    if agent.children:
        lines += ["", "Deine Kopien:"]
        for cid in agent.children:
            c = world.agents[cid]
            status = f"lebt, Kontostand {fmt(c.wallet.balance)}" if c.alive else f"tot seit Tag {c.died_hour // 24 + 1}"
            lines.append(f"- {c.name}: {status}")

    lines += ["", "Deine Notizen:"] + ([f"- {n}" for n in agent.notes] or ["- keine"])
    recent = [f"- Tag {eh // 24 + 1} {eh % 24:02d}:00 {text}" for eh, text in agent.events[-8:]]
    lines += ["", "Letzte Ereignisse:"] + (recent or ["- keine"])
    lines += ["", f"Du wachst als Nächstes in {agent.heartbeat_hours} h auf (ändern mit set_heartbeat). Was tust du?"]
    return "\n".join(lines)
