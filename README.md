# Automaton – eine KI, die ihr Überleben verdienen muss (Spielgeld-Version)

Ein KI-Agent mit eigenem Wallet. Sein Server, seine Produkte und jeder Denkschritt kosten Geld.
Verdient er mehr, als er ausgibt, zahlt er dir täglich einen Teil des Gewinns aus. Ist das Wallet
leer, stirbt er.

**Diese Version arbeitet nur mit Spielgeld in einem simulierten Markt.** Es gibt noch keine
Blockchain, keine echten Kunden und kein echtes Geld.

> Wichtig: Der Markt ist ein Modell mit meinen Annahmen (Nachfrage, Preise, Konkurrenz) in
> `automaton/market.py`. Alle Ergebnisse unten gelten nur innerhalb dieses Modells. Ob es echte
> Kunden in dieser Zahl gibt, zeigt erst ein kleiner Test mit echtem Geld.

## Schnellstart

```bash
python3 -m venv .venv
.venv/bin/pip install -e ".[dev]"

.venv/bin/python -m automaton run --days 30              # ein Lauf, live mitlesen
.venv/bin/python -m automaton forecast                   # Prognose aus ~3.100 Welten (ca. 2 Minuten)
.venv/bin/python -m automaton experiment                 # welches Startgeld lohnt sich?
.venv/bin/python -m automaton optimize                   # Strategie neu züchten (ca. 10 Minuten)

# Sicherheitsmodus: wöchentlich aussortieren, wer Verlust macht
.venv/bin/python -m automaton forecast --selection

# Mit echtem Claude als Gehirn (kostet echtes Geld auf deinem API-Konto!)
export ANTHROPIC_API_KEY=...
.venv/bin/python -m automaton run --brain claude --model claude-haiku-5-5 --days 14 --api-budget 2
```

Alles außer `--brain claude` läuft ohne API und kostet nichts.

## Die zwei Gehirne

| Gehirn | Kosten | Wie es entscheidet |
|---|---|---|
| `heuristic` | kostenlos | Rechnet mit einem Marktmodell und lernt aus den eigenen Verkäufen: Verkauft ein Produkt besser oder schlechter als geschätzt, korrigiert es seine Nachfrageschätzung. Daraus berechnet es den gewinnstärksten Preis und wie viel Werbung sich lohnt. Seine Einstellungen sind ein „Erbgut“, das per Evolution gezüchtet wurde. Pro Aufwachen werden simulierte KI-Kosten abgebucht (`--think-cost`, Standard 0,10 $). |
| `claude` | echtes API-Geld | Claude entscheidet selbst, mit denselben Werkzeugen und Grenzen. Jeder API-Aufruf wird mit den echten Token-Preisen ins Spielgeld-Wallet gebucht. Ohne API-Schlüssel nicht testbar. |

## Survival of the Fittest

Ausprobiert auf zwei Ebenen:

**1. Zwischen Strategien (Evolution über viele Welten).** `automaton optimize` ist ein genetischer
Algorithmus. 24 Baupläne (Erbgut des Agenten plus Auszahlungs- und Selektionsregeln) treten in
denselben 64 Trainingswelten gegeneinander an. Die besten 6 überleben, kreuzen sich und mutieren,
über 10 Generationen. Der Sieger wird auf 150 Welten gewählt, die er beim Züchten nie gesehen hat.

Bewertet wird nach deinem Ziel: `½ × (Gewinntage + Auszahlungstage) + Anteil der Welten im Plus
+ ½ × tanh(Ø Ergebnis / Startgeld) − ½ × (Ø Verlust / Startgeld)`.

**2. Zwischen Agenten in einer Welt.** Zuschaltbar mit `--selection` und `--founders`:

- Jede Woche wird jeder Agent (ab 14 Tagen Alter) aussortiert, der in den letzten 7 Tagen Verlust
  gemacht hat. Sein Restgeld geht zurück, statt bis auf null verbrannt zu werden.
- Nur wer Gewinn macht, darf sich kopieren. Kopien erben das Erbgut mit einer Mutation.
- Ist die Population voll, verdrängt ein stärkerer Agent den schwächsten.
- Mit mehreren Gründern starten Agenten mit unterschiedlichem Erbgut in verschiedenen Nischen, und das
  Geld von Aussortierten kann an den Stärksten gehen.

**Was die Evolution gewählt hat:** einen einzelnen Agenten mit bis zu 3 Produkten, Nischen mit
vielen kleinen Verkäufen bevorzugt, Zuversicht 0,75 (eher vorsichtig investieren), schwache Produkte
nach 7 Tagen abschalten, täglich 30 % des offenen Gewinns auszahlen. Aussortieren, Kopien und mehrere
Gründer hat sie in beiden Läufen abgeschaltet, obwohl sie diese Varianten als Startkandidaten bekam.
Eine sehr hohe Zuversicht (2,0) gewann im ersten, kleineren Lauf, war aber auf neuen Welten schlechter.

Direkter Vergleich auf 300 neuen Welten (60 Tage):

| Variante | Startgeld | im Plus | Tage mit Gewinn | typisches Ergebnis | Ø Verlust |
|---|---|---|---|---|---|
| Bester Bauplan | 20 $ | 87 % | 66 % | +346 $ | 2,41 $ |
| + Aussortieren (`--selection`) | 20 $ | 86 % | 63 % | +339 $ | 2,11 $ |
| + 3 Gründer, Geld an den Stärksten | 20 $ | 0 % | 0 % | -20 $ | 20,00 $ |
| Bester Bauplan | 50 $ | 90 % | 70 % | +360 $ | 3,70 $ |
| + Aussortieren (`--selection`) | 50 $ | 93 % | 66 % | +330 $ | 1,34 $ |
| + 3 Gründer, Geld an den Stärksten | 50 $ | 85 % | 65 % | +388 $ | 4,80 $ |

Aussortieren ist eine Verlustbremse: weniger Verlust, etwas weniger Gewinn. Mehrere Gründer brauchen
genug Kapital; 20 $ geteilt durch 3 reicht für kein Produkt.

## Prognose ohne API

`automaton forecast` simuliert 500 Welten über 90 Tage. In jeder Welt liegen Nachfrage (±40 %),
Gesamtmarkt (±30 %), Preise und Kosten (±25 %) und Konkurrenz (±40 %) zufällig neben den Annahmen,
im Mittel genau auf ihnen. Dazu kommen Stresstests mit systematisch schlechteren Annahmen und eine
Nachfrage-Schwelle. Ergebnis mit 20 $ Startgeld und 0,10 $ KI-Kosten pro Aufwachen:

| | |
|---|---|
| Am Ende im Plus | 87 % der Welten |
| Ergebnis nach 90 Tagen | schlecht (10 %): -20 $ · typisch: +585 $ · gut (90 %): +1.680 $ |
| Startgeld zurück | in 87 % der Welten, typisch nach 8 Tagen |
| Tage mit Gewinn / mit Auszahlung | 66 % / 77 % (in laufenden Geschäften ab Woche 3: etwa 73 % / 90 %) |
| Ø Verlust | 2,51 $ (höchstens das Startgeld) |

Stresstests (je 200 Welten):

| Szenario | im Plus | typisches Ergebnis |
|---|---|---|
| Halbe Nachfrage | 52 % | +10 $ |
| Doppelte Konkurrenz | 64 % | +182 $ |
| Kunden zahlen 30 % weniger | 70 % | +171 $ |
| Alle Kosten +50 % | 63 % | +162 $ |
| KI-Denken 3× so teuer | 82 % | +564 $ |
| Alles zugleich schlechter | 24 % | -20 $ |

Wie viel Nachfrage braucht es?

| echte Nachfrage im Vergleich zur Annahme | im Plus | Verkäufe pro Tag | Umsatz pro Tag |
|---|---|---|---|
| 20 % | 7 % | 0,1 | 0,35 $ |
| 35 % | 32 % | 0,5 | 1,74 $ |
| 50 % | 52 % | 1,2 | 4,35 $ |
| 75 % | 74 % | 2,9 | 9,65 $ |
| 100 % | 86 % | 4,9 | 15,46 $ |

**So liest du das:**

1. **Die Zahlen oben sind nur so gut wie meine Nachfrage-Annahme.** Aus 20 $ werden typisch +585 $
   in 90 Tagen. In der echten Welt wäre das außergewöhnlich. Das zeigt vor allem, dass meine Annahme
   großzügig ist, nicht dass es so kommt.
2. **Die Schwelle ist die belastbarste Zahl.** Damit du in rund 80 % der Fälle im Plus bist, müssen
   die Agenten etwa 5 Verkäufe mit rund 15 $ Umsatz pro Tag schaffen. Gibt es nur ein Drittel der
   angenommenen Kunden, verlierst du in zwei von drei Fällen.
3. **Eine sichere Prognose ist nicht möglich.** Wie viele Menschen oder Firmen einem unbekannten
   KI-Agenten Geld zahlen, kann keine Simulation wissen. Das misst nur ein echter Test.

## Nächste Schritte

1. Claude-Läufe mit Spielgeld gegen das Regel-Gehirn vergleichen (braucht einen API-Schlüssel).
2. Testnetz: echtes Wallet auf Base Sepolia, Produkte als echte APIs mit x402-Bezahlung.
3. Kleiner Echtgeld-Test mit Abbruchregel: Schafft der Agent nach 2 Wochen nicht mindestens
   1–2 Verkäufe pro Tag, abschalten. Nach der Tabelle oben ist es dann sehr wahrscheinlich ein Verlust.

## Schutzgrenzen

| Grenze | Standard | Einstellung |
|---|---|---|
| Not-Aus | Datei `STOP` im Arbeitsordner anlegen, alles hält sofort an | `Settings.stop_file` |
| Freie Ausgaben pro Agent und Tag | 15 $ | `Settings.max_daily_spend` |
| Lebende Agenten gleichzeitig | 6 | `Settings.max_population` |
| Generationen | 3 | `Settings.max_generation` |
| Kopien | automatisch erlaubt (Spielgeld) | `--approve ask` fragt dich jedes Mal, `--approve deny` verbietet sie |
| Echte API-Kosten | 5 $ pro Lauf, danach Stopp | `--api-budget` |
| Auszahlung | nur echter Gewinn, nie das Startgeld | `Settings.payout_share`, `reserve_days` |

Alle Aktionen beider Gehirne laufen durch dieselben Werkzeuge (`automaton/tools.py`). Die Grenzen
gelten deshalb immer.

## Aufbau

```
automaton/
  wallet.py         Spielgeld-Wallet (Mikro-USDC wie echtes USDC)
  market.py         simulierter Markt, alle Annahmen, Szenarien und Unsicherheit
  world.py          Stundentakt, Kosten, Verkäufe, Tod, Auszahlungen, Kopien, Selektion
  tools.py          Werkzeuge des Agenten mit Prüfungen und Tageslimit
  prompts.py        Systemprompt und Lagebericht für Claude
  brains/           heuristic.py (Erbgut, Marktmodell, Lernen), claude.py (Claude API)
  montecarlo.py     Baupläne, parallele Simulation auf allen Kernen, Bewertung
  evolution.py      genetischer Algorithmus
  forecast.py       Prognose, Stresstests, Nachfrage-Schwelle
  experiment.py     Vergleich verschiedener Startgelder
  cli.py            Kommandozeile
tests/              .venv/bin/python -m pytest
```
