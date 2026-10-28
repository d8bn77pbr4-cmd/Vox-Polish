# Automaton – eine KI, die ihr Überleben verdienen muss (Spielgeld-Version)

Ein KI-Agent mit eigenem Wallet. Sein Server, seine Produkte und jeder Denkschritt kosten Geld.
Verdient er mehr, als er ausgibt, zahlt er dir täglich einen Teil des Überschusses aus und kann
Kopien von sich starten. Ist das Wallet leer, stirbt er.

**Diese Version arbeitet nur mit Spielgeld in einem simulierten Markt.** Es gibt noch keine
Blockchain, keine echten Kunden und kein echtes Geld. Damit lässt sich gefahrlos testen, ob und wie
so ein Agent überleben kann.

> Wichtig: Die Simulation ist ein Modell mit Annahmen (Nachfrage, Preise, Konkurrenz). Ein gutes
> Ergebnis hier beweist nicht, dass der Agent in der echten Welt Geld verdient. Alle Annahmen stehen
> in `automaton/market.py` und lassen sich ändern.

## Schnellstart

```bash
python3 -m venv .venv
.venv/bin/pip install -e ".[dev]"

# Ein Lauf mit dem kostenlosen Regel-Gehirn (keine API-Kosten)
.venv/bin/python -m automaton run --days 30

# Viele Läufe: Wie viel Startgeld braucht er, und wie oft verdienst du daran?
.venv/bin/python -m automaton experiment --runs 40 --capitals 5,10,20,50 --days 60

# Mit echtem Claude als Gehirn (kostet echtes Geld auf deinem API-Konto!)
export ANTHROPIC_API_KEY=...
.venv/bin/python -m automaton run --brain claude --days 14 --api-budget 2
.venv/bin/python -m automaton run --brain claude --model claude-haiku-5-5   # viel günstiger
```

Jeder Lauf legt unter `runs/` ein Protokoll (`events.jsonl`) und einen Bericht (`report.json`) ab.

## Die zwei Gehirne

| Gehirn | Kosten | Wozu |
|---|---|---|
| `heuristic` | kostenlos | Feste Regeln. Testet die ganze Mechanik und ist die Messlatte. Simuliert pro Aufwachen KI-Kosten (`--think-cost`, Standard 0,10 $). |
| `claude` | echtes API-Geld | Claude entscheidet selbst: was es erforscht, baut, wie es Preise setzt, wann es sich kopiert. Jeder API-Aufruf wird mit den echten Token-Preisen ins Spielgeld-Wallet gebucht. Standardmodell `claude-opus-5-5`, wählbar mit `--model`. |

Du musst nicht entscheiden, womit der Agent Geld verdient. Das macht er selbst.

## So funktioniert die Welt

- **Kosten:** Server 0,01 $/h, Hosting je Produkt, Marktforschung, Bau, Marketing, Verbesserungen,
  Stückkosten pro Verkauf, 1 % Zahlungsgebühr und die KI-Kosten bei jedem Aufwachen.
- **Markt:** 7 Nischen (Daten-API, Code-Reviews, Übersetzung, Texte, Recherche, Landingpages,
  Datenbereinigung). Verkäufe hängen von Nachfrage, Preis, Qualität, Sichtbarkeit und Konkurrenz ab.
  Die Konkurrenz wächst, bis eine Nische gesättigt ist. Marktforschung liefert nur ungenaue Schätzungen.
- **Auszahlung an dich:** Jeden Abend gehen 50 % von allem über der Reserve (14 Tage Kosten,
  mindestens 10 $) an dich. Kopien zahlen an ihre Eltern.
- **Kopien:** Ein Agent kann eine Kopie mit eigenem Wallet starten und ihr Startgeld geben. Die Kopie
  erbt seine Marktforschung und konzentriert sich auf eine Nische.
- **Tod:** Bei Kontostand 0 werden Server und Produkte abgeschaltet.

## Schutzgrenzen

| Grenze | Standard | Einstellung |
|---|---|---|
| Not-Aus | Datei `STOP` im Arbeitsordner anlegen, alles hält sofort an | `Settings.stop_file` |
| Freie Ausgaben pro Agent und Tag | 15 $ | `Settings.max_daily_spend` |
| Lebende Agenten gleichzeitig | 6 | `Settings.max_population` |
| Generationen | 3 | `Settings.max_generation` |
| Kopien | automatisch erlaubt (Spielgeld) | `--approve ask` fragt dich jedes Mal, `--approve deny` verbietet sie |
| Echte API-Kosten | 5 $ pro Lauf, danach Stopp | `--api-budget` |

Alle Aktionen beider Gehirne laufen durch dieselben Werkzeuge (`automaton/tools.py`). Die Grenzen
gelten deshalb immer, auch wenn Claude etwas anderes will.

## Erste Testergebnisse (Regel-Gehirn, 40 Läufe je Zeile, 60 Tage)

Mit 0,10 $ KI-Kosten pro Aufwachen (grob ein großes Modell):

| Startgeld | überlebt 60 Tage | Gewinn für dich | Ø dein Ergebnis | Ø noch in Wallets | Ø Agenten |
|---|---|---|---|---|---|
| 5 $ | 0 % | 0 % | -5,00 $ | 0,00 $ | 1,0 |
| 10 $ | 12 % | 30 % | +6,82 $ | 1,22 $ | 1,2 |
| 20 $ | 35 % | 65 % | +50,66 $ | 3,87 $ | 1,6 |
| 50 $ | 55 % | 52 % | +18,37 $ | 10,02 $ | 4,1 |

Mit 0,01 $ pro Aufwachen (grob ein kleines Modell) und 20 $ Startgeld: 48 % überleben,
Gewinn für dich in 75 % der Läufe, im Schnitt +58,87 $.

„Dein Ergebnis“ ist, was an dich ausgezahlt wurde, minus Startgeld. Ausgezahlt wird nur echter
Gewinn, nie das Startgeld. Der Durchschnitt wird von einzelnen sehr guten Läufen nach oben gezogen.
Aussagekräftiger ist die Spalte „Gewinn für dich“.

Was man daraus lernt:

1. **Ganz ohne Startgeld geht es nicht.** Mit 5 $ stirbt er immer, bevor das erste Produkt läuft.
2. **Die Strategie entscheidet.** Zwei verbesserte Regeln (Produkte länger testen, seltener aufwachen)
   haben bei 20 $ die Überlebensrate von 8 % auf 35 % und den Anteil der Läufe mit Gewinn für dich
   von 28 % auf 65 % gehoben. Genau hier soll Claude besser sein
   als feste Regeln. Das muss ein Claude-Lauf erst zeigen.
3. **Denken ist ein großer Kostenblock.** Ein günstigeres Modell oder seltenes Aufwachen verlängert das Leben deutlich.
4. **Kopien sind kein Selbstläufer.** Mit 50 $ kopieren sich die Agenten oft, die Kopien konkurrieren
   in denselben kleinen Märkten, und für dich bleibt weniger übrig als mit 20 $.

## Nächste Schritte

1. Claude-Läufe mit Spielgeld gegen das Regel-Gehirn vergleichen.
2. Testnetz: echtes Wallet auf Base Sepolia, Produkte als echte APIs mit x402-Bezahlung (Testgeld).
3. Echtes Geld erst, wenn 1 und 2 überzeugen: kleines Limit, Kopien nur mit deiner Freigabe.

## Aufbau

```
automaton/
  wallet.py       Spielgeld-Wallet (Mikro-USDC wie echtes USDC)
  market.py       simulierter Markt, alle Annahmen
  world.py        Stundentakt, Kosten, Verkäufe, Tod, Auszahlungen, Kopien, Grenzen
  tools.py        Werkzeuge des Agenten mit Prüfungen und Tageslimit
  prompts.py      Systemprompt und Lagebericht für Claude
  brains/         heuristic.py (kostenlos), claude.py (Claude API)
  experiment.py   viele Läufe mit verschiedenem Startgeld
  cli.py          Kommandozeile
tests/            .venv/bin/python -m pytest
```
