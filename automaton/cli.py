from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime
from pathlib import Path

from .montecarlo import Blueprint
from .report import summary, to_dict
from .wallet import fmt
from .world import World


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(prog="automaton", description="Ein KI-Agent, der sein Überleben verdienen muss – mit Spielgeld.")
    sub = parser.add_subparsers(dest="command", required=True)

    run = sub.add_parser("run", help="Eine Simulation laufen lassen")
    run.add_argument("--brain", choices=["heuristic", "claude"], default="heuristic",
                     help="heuristic = kostenlose Regeln, claude = echtes Claude (kostet echtes API-Geld)")
    run.add_argument("--days", type=int, default=30)
    run.add_argument("--capital", type=float, default=20.0, help="Startgeld in Spiel-USDC")
    run.add_argument("--seed", type=int, default=None, help="Zufallsstartwert für reproduzierbare Läufe")
    run.add_argument("--approve", choices=["auto", "ask", "deny"], default="auto", help="Wer Kopien erlaubt")
    run.add_argument("--think-cost", type=float, default=0.10, help="Simulierte KI-Kosten pro Aufwachen (nur heuristic)")
    run.add_argument("--model", default=None, help="Claude-Modell (nur claude)")
    run.add_argument("--effort", choices=["low", "medium", "high", "xhigh", "max"], default="medium")
    run.add_argument("--api-budget", type=float, default=5.0, help="Hartes Limit für echte API-Kosten in Dollar")
    run.add_argument("--out", default="runs", help="Ordner für Protokolle")
    run.add_argument("--quiet", action="store_true", help="Keine Ereignisse live anzeigen")
    _blueprint_arg(run)

    exp = sub.add_parser("experiment", help="Viele kostenlose Läufe: Wie viel Startgeld braucht er?")
    exp.add_argument("--runs", type=int, default=100)
    exp.add_argument("--capitals", default="5,10,20,50", help="Kommagetrennte Startgeld-Beträge")
    exp.add_argument("--days", type=int, default=60)
    exp.add_argument("--think-cost", type=float, default=0.10)
    exp.add_argument("--uncertainty", type=float, default=1.0, help="0 = Annahmen exakt, 1 = zufällig daneben")
    exp.add_argument("--seed", type=int, default=0)
    _blueprint_arg(exp)

    opt = sub.add_parser("optimize", help="Survival of the Fittest: die beste Strategie züchten (ohne API)")
    opt.add_argument("--generations", type=int, default=12)
    opt.add_argument("--population", type=int, default=24)
    opt.add_argument("--days", type=int, default=60)
    opt.add_argument("--capital", type=float, default=20.0)
    opt.add_argument("--think-cost", type=float, default=0.10)
    opt.add_argument("--out", default="bauplan.json", help="Datei für den besten Bauplan")
    _blueprint_arg(opt)

    fc = sub.add_parser("forecast", help="Prognose aus hunderten Welten plus Stresstests (ohne API)")
    fc.add_argument("--capital", type=float, default=20.0)
    fc.add_argument("--days", type=int, default=90)
    fc.add_argument("--runs", type=int, default=500)
    fc.add_argument("--stress-runs", type=int, default=200)
    fc.add_argument("--think-cost", type=float, default=0.10)
    fc.add_argument("--json", default=None, help="Ergebnis zusätzlich als JSON speichern")
    _blueprint_arg(fc)

    args = parser.parse_args(argv)
    blueprint = Blueprint.load(Path(args.blueprint)) if args.blueprint else Blueprint()
    overrides = {"selection": True} if args.selection else {}
    if args.founders:
        overrides["founders"] = args.founders
    if overrides:
        blueprint = Blueprint.from_genes({**blueprint.genes(), **overrides})
    if args.command == "run":
        return _run(args, blueprint)

    from .montecarlo import Simulator
    with Simulator() as sim:
        if args.command == "experiment":
            from .experiment import run_experiment, table
            capitals = [float(c) for c in args.capitals.split(",")]
            rows = run_experiment(sim, blueprint, capitals, args.runs, args.days, args.think_cost, args.uncertainty,
                                  args.seed)
            print(table(rows, args.days, args.think_cost, args.uncertainty))
        elif args.command == "optimize":
            _optimize(sim, blueprint, args)
        else:
            from .forecast import make_forecast, text
            forecast = make_forecast(sim, blueprint, args.capital, args.days, args.runs, args.think_cost,
                                     args.stress_runs)
            print(text(forecast))
            if args.json:
                Path(args.json).write_text(json.dumps(forecast.to_dict(), indent=1), encoding="utf-8")


def _blueprint_arg(parser) -> None:
    parser.add_argument("--blueprint", default=None,
                        help="Bauplan-Datei aus 'optimize' (Standard: der eingebaute beste Bauplan)")
    parser.add_argument("--selection", action="store_true",
                        help="Sicherheitsmodus: wöchentlich aussortieren, wer Verlust macht; Restgeld geht zurück")
    parser.add_argument("--founders", type=int, default=None, help="Mit so vielen Agenten gleichzeitig starten")


def _optimize(sim, blueprint: Blueprint, args) -> None:
    from .evolution import evolve
    print(f"Züchte Strategien: {args.population} Baupläne, {args.generations} Generationen, "
          f"je 40 Trainingswelten. Ausgewählt wird auf 150 anderen Welten.\n")
    ranked = evolve(sim, blueprint, args.generations, args.population, max(2, args.population // 4), args.days,
                    args.capital, args.think_cost)
    print("\nFinalisten auf neuen Welten:")
    for score, bp in ranked:
        marker = " (Start)" if bp == blueprint else ""
        print(f"  Wert {score.value:.3f}{marker}: im Plus {score.p_profit:.0%}, Tage mit Gewinn {score.profit_days:.0%}, "
              f"Tage mit Auszahlung {score.payout_days:.0%}, typisch {score.median_result:+.0f} $")
    ranked[0][1].save(Path(args.out))
    print(f"\nBester Bauplan gespeichert: {args.out}")
    print(json.dumps(ranked[0][1].genes(), indent=2))


def _run(args, blueprint: Blueprint) -> None:
    if args.brain == "claude":
        from .brains.claude import DEFAULT_MODEL, ClaudeBrain
        brain = ClaudeBrain(model=args.model or DEFAULT_MODEL, effort=args.effort)
        print(f"Achtung: Mit --brain claude kostet jedes Aufwachen echtes Geld auf deinem API-Konto "
              f"({brain.model}). Hartes Limit: {args.api_budget:.2f} $.\n")
    else:
        from .brains import HeuristicBrain
        brain = HeuristicBrain(args.think_cost, blueprint.strategy)

    out = Path(args.out) / f"{datetime.now():%Y%m%d-%H%M%S}-{args.brain}"
    out.mkdir(parents=True, exist_ok=True)
    settings = blueprint.settings(seed_capital=args.capital, days=args.days, seed=args.seed,
                                  spawn_approval=args.approve, api_budget=args.api_budget)
    world = World(settings, brain, approve=_ask, log_path=out / "events.jsonl",
                  on_event=None if args.quiet else _print_event)
    print(f"Start: {world.genesis.name} mit {fmt(world.genesis.wallet.balance)} Spielgeld, {args.days} Tage. "
          f"Not-Aus: Datei {settings.stop_file} anlegen.\n")
    try:
        world.run(on_day=_print_day)
    except KeyboardInterrupt:
        world.halt("Abbruch mit Strg+C")
    except Exception as e:
        if type(e).__module__.startswith("anthropic"):
            sys.exit(f"Claude-API-Fehler: {e}\nIst ANTHROPIC_API_KEY gesetzt und das Modell verfügbar?")
        raise

    print("\n" + summary(world))
    (out / "report.json").write_text(json.dumps(to_dict(world), ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\nProtokoll: {out / 'events.jsonl'}\nBericht:   {out / 'report.json'}")


def _print_event(hour: int, text: str) -> None:
    print(f"[Tag {hour // 24 + 1} {hour % 24:02d}:00] {text}")


def _print_day(world: World) -> None:
    alive = world.alive_agents()
    total = sum(a.wallet.balance for a in alive)
    print(f"--- Tag {world.hour // 24} vorbei: {len(alive)} lebend, zusammen {fmt(total)}, "
          f"dein Ergebnis {fmt(world.creator.balance)} ---")


def _ask(parent, niche: str, funding: int, mission: str) -> bool:
    try:
        answer = input(f"\n{parent.name} möchte eine Kopie erzeugen (Nische {niche}, Startgeld {fmt(funding)}).\n"
                       f"Auftrag: {mission}\nErlauben? [j/N] ")
    except EOFError:
        return False
    return answer.strip().lower() in {"j", "ja", "y", "yes"}
