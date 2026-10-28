from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime
from pathlib import Path

from .experiment import run_experiment, table
from .report import summary, to_dict
from .wallet import fmt
from .world import Settings, World


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

    exp = sub.add_parser("experiment", help="Viele kostenlose Läufe: Wie viel Startgeld braucht er?")
    exp.add_argument("--runs", type=int, default=30)
    exp.add_argument("--capitals", default="5,10,20,50", help="Kommagetrennte Startgeld-Beträge")
    exp.add_argument("--days", type=int, default=60)
    exp.add_argument("--think-cost", type=float, default=0.10)
    exp.add_argument("--seed", type=int, default=0)

    args = parser.parse_args(argv)
    if args.command == "experiment":
        capitals = [float(c) for c in args.capitals.split(",")]
        print(table(run_experiment(capitals, args.runs, args.days, args.think_cost, args.seed), args.days, args.think_cost))
    else:
        _run(args)


def _run(args) -> None:
    if args.brain == "claude":
        from .brains.claude import DEFAULT_MODEL, ClaudeBrain
        brain = ClaudeBrain(model=args.model or DEFAULT_MODEL, effort=args.effort)
        print(f"Achtung: Mit --brain claude kostet jedes Aufwachen echtes Geld auf deinem API-Konto "
              f"({brain.model}). Hartes Limit: {args.api_budget:.2f} $.\n")
    else:
        from .brains import HeuristicBrain
        brain = HeuristicBrain(args.think_cost)

    out = Path(args.out) / f"{datetime.now():%Y%m%d-%H%M%S}-{args.brain}"
    out.mkdir(parents=True, exist_ok=True)
    settings = Settings(seed_capital=args.capital, days=args.days, seed=args.seed, spawn_approval=args.approve,
                        api_budget=args.api_budget)
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
