"""`automaton trade ...`: download prices, run the desk, test it honestly, tune its rules."""

from __future__ import annotations

import json
import random
from dataclasses import replace
from pathlib import Path

from .data import SYMBOLS, align, download, load
from .desk import Desk, DeskSettings, date_of
from .strategy import Market


def add_parser(sub) -> None:
    trade = sub.add_parser("trade", help="Daytrading-Desk mit Tradern, Prüfern und Chef (echte Kurse, Spielgeld)")
    tsub = trade.add_subparsers(dest="trade_command", required=True)

    dl = tsub.add_parser("download", help="Echte 15-Minuten-Kurse von Binance laden")
    _period(dl)

    run = tsub.add_parser("run", help="Einen Desk über die Kurse laufen lassen und mitlesen")
    _period(run)
    _desk(run)
    run.add_argument("--seed", type=int, default=0)
    run.add_argument("--quiet", action="store_true")

    test = tsub.add_parser("test", help="Ehrlicher Test: echte Kurse gegen Zufallskontrolle, Jahr 1 gegen Jahr 2")
    _period(test)
    _desk(test)
    test.add_argument("--runs", type=int, default=6)

    tune = tsub.add_parser("tune", help="Desk-Regeln auf dem ersten Jahr züchten, auf dem zweiten testen")
    _period(tune)
    _desk(tune)
    tune.add_argument("--generations", type=int, default=6)
    tune.add_argument("--population", type=int, default=16)
    tune.add_argument("--out", default="desk.json")

    profi = tsub.add_parser("profi", help="Profi-Trader: lernen (2022-2024), auswählen (2024/25), "
                                          "einmal testen (2025/26)")
    profi.add_argument("--relearn", action="store_true", help="Playbook neu erforschen statt das gespeicherte nehmen")


def _period(p) -> None:
    p.add_argument("--start", default="2024-10", help="erster Monat (JJJJ-MM)")
    p.add_argument("--end", default="2026-09", help="letzter Monat (JJJJ-MM)")


def _desk(p) -> None:
    p.add_argument("--capital", type=float, default=1000.0, help="Spielgeld in Dollar")
    p.add_argument("--settings", default=None, help="Desk-Regeln aus 'trade tune'")


def main(args) -> None:
    if args.trade_command == "download":
        download(start=args.start, end=args.end)
        return
    if args.trade_command == "profi":
        return _profi(args.relearn)
    market = Market(align({s: load(s, args.start, args.end) for s in SYMBOLS}))
    settings = DeskSettings(capital=args.capital)
    if args.settings:
        settings = replace(DeskSettings(**_tuples(json.loads(Path(args.settings).read_text()))), capital=args.capital)
    if args.trade_command == "run":
        _run(market, replace(settings, seed=args.seed), args.quiet)
    elif args.trade_command == "test":
        _test(market, settings, args.runs)
    else:
        _tune(market, settings, args)


def money(x: float, sign: bool = False) -> str:
    text = f"{x:{'+' if sign else ''},.2f}".replace(",", "_").replace(".", ",").replace("_", ".")
    return f"{text} $"


def _tuples(d: dict) -> dict:
    return {k: tuple(v) if isinstance(v, list) else v for k, v in d.items()}


def _run(market: Market, settings: DeskSettings, quiet: bool) -> None:
    log = None if quiet else (lambda day, role, text: print(f"[{date_of(market, day)}] {role}: {text}"))
    desk = Desk(market, settings, log=log)
    desk.run(0, market.days)
    traders = desk.traders + desk.retired
    trades = sum(t.trades for t in traders)
    wins = sum(t.wins for t in traders)
    active = [d for d in desk.days if desk.stopped_day is None or d.day <= desk.stopped_day]
    print(f"\n=== Desk über {market.days} Tage ({date_of(market, 0)} bis {date_of(market, market.days - 1)}) ===")
    if desk.stopped:
        print(f"Gestoppt am {date_of(market, desk.stopped_day)}: {desk.stopped}")
    rows = [
        ("Startkapital", money(settings.capital)),
        ("Handel vor Gebühren", money(sum(t.gross for t in traders), sign=True)),
        ("Gebühren und Schlupf", money(sum(t.fees for t in traders))),
        ("Laufende Kosten (Server, KIs)", money(desk.costs)),
        ("An dich ausgezahlt", money(desk.paid_out)),
        ("Noch auf dem Desk", money(desk.equity)),
        ("Dein Ergebnis", money(desk.creator_result, sign=True)),
        ("Tage mit Gewinn", f"{sum(d.pnl > 0 for d in active)} von {len(active)}"),
        ("Trades", f"{trades}, davon {wins / trades:.0%} Gewinner" if trades else "0"),
        ("Trader eingestellt", f"{desk.hired} (Prüfungen bestanden: {desk.exams_passed} von {desk.exams})"),
        ("Prüfer-Strenge am Ende", f"Gewinnfaktor ≥ {desk.exam_profit_factor}"),
    ]
    print("\n".join(f"{label + ':':<32}{value}" for label, value in rows))


def _test(market: Market, settings: DeskSettings, runs: int) -> None:
    from .evaluate import Lab, Summary, bootstrap, shuffled
    cap = settings.capital
    markets = {"real": market, **{f"zufall{k}": shuffled(market, random.Random(100 + k)) for k in range(runs)}}
    half = market.days // 2
    print(f"Teste {runs} Desks pro Fall über {market.days} Tage, {money(cap)} Spielgeld …\n")
    with Lab(markets) as lab:
        cases = {
            "Echte Kurse, ganzer Zeitraum": [("real", replace(settings, seed=k), 0, market.days) for k in range(runs)],
            "Zufallskontrolle (Kurse gemischt)": [(f"zufall{k}", replace(settings, seed=k), 0, market.days) for k in range(runs)],
            "Echte Kurse, erstes Jahr": [("real", replace(settings, seed=k), 0, half) for k in range(runs)],
            "Echte Kurse, zweites Jahr": [("real", replace(settings, seed=k), half, market.days) for k in range(runs)],
        }
        outcomes = {name: lab.run(jobs) for name, jobs in cases.items()}
    print(f"{'Fall':<36}| im Plus | typisches Ergebnis | Handel vor Gebühren |     Gebühren |     Kosten "
          f"| Gewinntage | gestoppt")
    for name, outs in outcomes.items():
        s = Summary.of(outs, cap)
        print(f"{name:<36}| {s.p_profit:>7.0%} | {money(s.median_result, True):>18} | "
              f"{money(s.trading + s.fees, True):>17} | {money(s.fees):>12} | {money(s.costs):>10} | "
              f"{s.profit_days:>10.0%} | {s.stopped:>8.0%}")
    fc = bootstrap([list(o.daily_returns) for o in outcomes["Echte Kurse, ganzer Zeitraum"]], cap, settings)
    print(f"\nPrognose für {fc.days} Tage (aus echten Desk-Tagen neu zusammengesetzt, {fc.paths} Pfade):")
    print(f"  im Plus: {fc.p_profit:.0%} | schlecht (10 %): {money(fc.p10, True)} | typisch: {money(fc.p50, True)} | "
          f"gut (90 %): {money(fc.p90, True)} | Tage mit Gewinn: {fc.profit_days:.0%} | Chef stoppt: {fc.stopped:.0%}")
    print("\nLiegt der Handel vor Gebühren auf echten Kursen nicht klar über der Zufallskontrolle,\n"
          "gibt es keinen Hinweis auf einen echten Vorteil.")


def _tune(market: Market, settings: DeskSettings, args) -> None:
    from .evaluate import Lab, Summary, settings_dict, tune
    half = market.days // 2
    with Lab({"real": market}) as lab:
        top = tune(lab, settings, (0, half), seeds=3, population=args.population, generations=args.generations,
                   elite=4)
        best_train, best = top[0]
        test = Summary.of(lab.run([("real", replace(best, seed=k), half, market.days) for k in range(6)]),
                          settings.capital)
    print(f"\nBeste Regeln im Training (erstes Jahr): im Plus {best_train.p_profit:.0%}, "
          f"typisch {money(best_train.median_result, True)}")
    print(f"Dieselben Regeln im Test (zweites Jahr): im Plus {test.p_profit:.0%}, "
          f"typisch {money(test.median_result, True)}, Gewinntage {test.profit_days:.0%}")
    Path(args.out).write_text(json.dumps(settings_dict(best), indent=2), encoding="utf-8")
    print(f"Regeln gespeichert: {args.out}")


def _profi(relearn: bool) -> None:
    import statistics

    from .evaluate import Lab as DeskLab
    from .evaluate import Summary, shuffled
    from .research import Lab, final_test, learn, load_playbook, period, save_playbook, select

    download(start="2022-01", end="2026-09", log=lambda _: None)
    market = Market(align({s: load(s, "2022-01", "2026-09") for s in SYMBOLS}))
    learn_days, select_days, test_days = period(market, "lernen"), period(market, "auswählen"), period(market, "test")
    markets = {"real": market, **{f"zufall{k}": shuffled(market, random.Random(500 + k), *test_days) for k in range(5)}}
    with Lab(markets) as lab:
        playbook = load_playbook()
        favourites: list = []
        if relearn or not playbook:
            print("Lernen (2022 bis September 2024) …")
            learned = learn(lab, *learn_days)
            rows, sent = select(lab, learned, *select_days)
            print(f"{len(learned)} Strategien geprüft, {sent} auf das Auswahljahr geschickt, {len(rows)} bestanden.")
            save_playbook(rows)
            playbook = load_playbook()
            favourites = [g for g, st in sorted(learned.items(), key=lambda kv: kv[1].t, reverse=True)[:5]]
        if not playbook:
            print("Keine Strategie hat Lernen und Auswahljahr bestanden. Es gibt nichts zu testen.")
            return
        out = final_test(lab, playbook, favourites, *test_days, shuffles=tuple(f"zufall{k}" for k in range(5)))
    settings = DeskSettings(capital=1000.0, kind="pro", playbook=tuple(playbook), max_traders=3, trader_share=0.33,
                            exam_days=90, exam_min_trades=5, exam_min_profit_factor=1.1, exam_min_t=0.0,
                            review_days=30, trader_max_drawdown=0.10, max_same_direction=2, candidates=8)
    with DeskLab({"real": market}) as dlab:
        desk = Summary.of(dlab.run([("real", replace(settings, seed=k), *test_days) for k in range(6)]), 1000.0)

    p = out["portfolio"]
    print(f"\n=== Abschlusstest Oktober 2025 bis September 2026 (nie zum Lernen oder Auswählen benutzt) ===")
    print(f"Playbook ({len(playbook)} Trader, gleiche Anteile an 100 $): {p['ergebnis']:+.2f} % im Jahr, "
          f"positive Monate {p['positiv']:.0%}, Ø Monat {p['mittel']:+.2f} %, schlechtester Monat "
          f"{p['schlechtester']:+.2f} %, t-Wert {p['t']:+.2f}")
    print("Monate: " + " ".join(f"{v:+.1f}" for v in p["verlauf"]))
    flips = out["münzwurf"]
    print(f"Münzwurf-Kontrolle (gleiche Regeln, zufällige Richtung): Median {statistics.median(flips):+.2f} %, "
          f"{sum(x >= p['ergebnis'] for x in flips)} von {len(flips)} mindestens so gut")
    print("Zufallskurs-Kontrolle: " + " ".join(f"{x:+.2f} %" for x in out["zufallskurse"]))
    for row in out["lern_favoriten"]:
        g, r = row["genome"], row["test"]
        print(f"Lern-Favorit {g['symbol'][:-4]} {g['setup']}: {r['pnl']:+.2f} % im Testjahr (t {r['t']:+.2f})")
    print(f"Profi-Desk mit Chef und Prüfer, 1.000 $: im Plus {desk.p_profit:.0%}, typisch "
          f"{money(desk.median_result, True)}, Handel vor Gebühren {money(desk.trading + desk.fees, True)}, "
          f"laufende Kosten {money(desk.costs)}")
