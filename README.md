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
| Bester Bauplan | 20 $ | 87 % | 66 % | +349 $ | 2,48 $ |
| + Aussortieren (`--selection`) | 20 $ | 86 % | 64 % | +346 $ | 2,19 $ |
| + 3 Gründer, Geld an den Stärksten | 20 $ | 0 % | 0 % | -20 $ | 20,00 $ |
| Bester Bauplan | 50 $ | 93 % | 71 % | +349 $ | 2,67 $ |
| + Aussortieren (`--selection`) | 50 $ | 95 % | 68 % | +347 $ | 0,75 $ |
| + 3 Gründer, Geld an den Stärksten | 50 $ | 85 % | 65 % | +388 $ | 4,80 $ |

Aussortieren ist eine Verlustbremse: Bei 50 $ sinkt der durchschnittliche Verlust von 2,67 $ auf
0,75 $, dafür gibt es etwas weniger Gewinntage. Mehrere Gründer brauchen genug Kapital; 20 $ geteilt
durch 3 reicht für kein Produkt.

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

## Daytrading-Desk (echte Kurse, Spielgeld)

Ein Desk aus drei Gruppen von KIs handelt Bitcoin, Ethereum und Solana auf echten 15-Minuten-Kursen
(Binance, Oktober 2024 bis September 2026, 730 Handelstage) mit Spielgeld:

- **Trader** handeln. Jeder hat ein Erbgut: Coin, Stil (Ausbruch, Rückkehr zum Mittel, Trend),
  Zeitfenster, Schwelle, Stop-Loss, Gewinnziel, Positionsgröße, Long/Short, maximale Trades pro Tag.
  Am Tagesende ist jede Position geschlossen.
- **Prüfer** lassen einen neuen Trader nur zu, wenn er auf den letzten 30 Tagen im Plus war, genug
  Trades hatte, einen Gewinnfaktor über der Schwelle und einen begrenzten Drawdown. Vor jeder Order
  prüfen sie die Risikogrenzen: Verliert ein Trader heute 3 % oder der ganze Desk 4 %, gibt es keine
  neuen Positionen mehr.
- **Chef** bewertet jeden Abend. Trader ohne Gewinn in den letzten 7 Tagen oder mit mehr als 8 %
  Drawdown werden abgeschaltet, ihr Geld geht zurück. Neue Kandidaten sind meist Mutationen der
  bisher besten Trader. Scheitern zu viele Zugelassene schnell, macht der Chef die Prüfung strenger.
  Er schöpft Gewinne ab, zahlt dir täglich 30 % des offenen Gewinns aus und stoppt alles, wenn der Desk
  25 % verloren hat.

So ist der Test aufgebaut, damit er nichts schönrechnet:

- Signale nur auf abgeschlossenen Kerzen, Ausführung zur nächsten Kerze.
- Gebühr 0,05 % plus Schlupf 0,02 % pro Order (Binance-Futures, Taker, Basisstufe).
- Stop vor Gewinnziel, wenn beides in derselben Kerze liegt.
- Laufende Kosten: Server 0,24 $ pro Tag plus 0,02 $ pro KI.
- **Zufallskontrolle:** dieselben Kerzen in zufälliger Reihenfolge. Schneidet der Desk auf echten Kursen
  nicht klar besser ab, war ein Gewinn Glück.
- **Erstes gegen zweites Jahr**, und eine Evolution der Desk-Regeln, die nur das erste Jahr sieht.

```bash
.venv/bin/python -m automaton trade download              # Kurse laden (ca. 1 Minute)
.venv/bin/python -m automaton trade run --capital 1000    # einen Desk laufen lassen und mitlesen
.venv/bin/python -m automaton trade test --capital 1000   # der ehrliche Test (ca. 1 Minute)
.venv/bin/python -m automaton trade tune --capital 10000  # Desk-Regeln züchten (ca. 8 Minuten)
```

Ergebnis von `trade test` (je 6 Desks pro Zeile):

| Fall | Kapital | im Plus | typisches Ergebnis | Handel vor Gebühren | Gebühren | laufende Kosten |
|---|---|---|---|---|---|---|
| Echte Kurse, 2 Jahre | 1.000 $ | 0 % | −246 $ (Chef stoppt) | +12 $ | 99 $ | 141 $ |
| Zufallskontrolle | 1.000 $ | 0 % | −237 $ (Chef stoppt) | +28 $ | 110 $ | 124 $ |
| Echte Kurse, 2 Jahre | 10.000 $ | 0 % | −1.436 $ | +259 $ | 1.530 $ | 218 $ |
| Zufallskontrolle | 10.000 $ | 0 % | −1.981 $ | +126 $ | 1.451 $ | 202 $ |
| Echte Kurse, erstes Jahr | 10.000 $ | 17 % | −1.291 $ | +29 $ | 978 $ | 112 $ |
| Echte Kurse, zweites Jahr | 10.000 $ | 0 % | −878 $ | +46 $ | 881 $ | 113 $ |

Gewinntage: etwa 15 % aller Handelstage. Prognose für 90 Tage aus echten Desk-Tagen: bei 1.000 $ in
13 % der Fälle im Plus (typisch −51 $), bei 10.000 $ in 32 % (typisch −205 $).

Evolution der Desk-Regeln (Training erstes Jahr, Test zweites Jahr, 10.000 $):

| Regeln | Training: im Plus | Test: im Plus | Test: typisches Ergebnis | Zufallskontrolle im Test |
|---|---|---|---|---|
| gezüchtet, Platz 1 | 67 % | 0 % | −1.045 $ | −912 $ |
| gezüchtet, Platz 2 | 67 % | 0 % | −686 $ | −1.144 $ |
| Standard | – | 0 % | −878 $ | −1.189 $ |

**So liest du das:**

1. **Kein Vorteil vor Gebühren.** Der Handel liegt vor Gebühren nahe null und nicht klar über der
   Zufallskontrolle. Die Gebühren machen daraus einen sicheren Verlust, bei kleinem Kapital zusätzlich
   die laufenden Kosten.
2. **Optimieren macht es nicht besser.** Gezüchtete Regeln sehen im Trainingsjahr gut aus und verlieren
   im Testjahr wie der Zufall. Das ist Überanpassung, das Hauptrisiko jeder Trading-Optimierung.
3. **Der Chef begrenzt Verluste, erzeugt aber keine Gewinne.** Abschalten und Verlustgrenze stoppen das
   Bluten. Aus Strategien ohne Vorteil kann keine Auswahl einen Vorteil machen.
4. **Der Desk ist ein Prüfstand.** Wer eine neue Handelsidee hat, kann sie als Stil einbauen und mit
   `trade test` gegen die Zufallskontrolle prüfen, bevor echtes Geld fließt.

Nicht berücksichtigt: Finanzierungsgebühren von Futures (bei Positionen unter einem Tag klein),
Unterschiede zwischen Spot- und Futures-Kursen, niedrigere Maker-Gebühren bei Limit-Orders.

## Profi-Trader

Die Profi-Trader kennen die Werkzeuge, mit denen professionelle Daytrader arbeiten, und halten sich an
deren Regeln (`automaton/trading/pro.py`):

- **Sechs Setups:** Opening-Range-Breakout zu Sessionbeginn (Asien 0:00, London 8:00, New York 13:00/14:00
  UTC), Rückkehr zum Session-VWAP im Seitwärtsmarkt, VWAP-Pullback im Trend, Intraday-Momentum,
  Squeeze-Ausbruch (Bollinger-Bänder), Erschöpfungs-Fade nach Liquidationskerzen mit hohem Volumen.
- **Filter:** Trend auf höherem Zeitrahmen (EMA 200), Marktregime (Efficiency-Ratio), relatives Volumen zur
  gleichen Tageszeit, Wochenenden.
- **Risiko:** fester Anteil des Kapitals pro Trade (0,5 %), Positionsgröße aus der Stop-Distanz,
  Stop in ATR, Gewinnziel in R-Vielfachen, Stop auf Einstand nach einem Teilgewinn, höchstens 3-facher Hebel.
- **Ausführung:** Limit-Orders (Maker-Gebühr 0,02 %), gefüllt nur, wenn der Kurs durch das Limit läuft.
  Trades, deren Ziel nicht mindestens das Sechsfache der Gebühren bringt, werden ausgelassen.
- **Disziplin:** Tagesstopp nach 3 R Verlust, zwei Stunden Pause nach zwei Verlusten in Folge, keine neuen
  Trades in der letzten Stunde, abends flach.
- **Prüfer** verlangen zusätzlich einen positiven t-Wert. Der **Chef** begrenzt Positionen in dieselbe
  Richtung, weil Bitcoin, Ethereum und Solana stark zusammenlaufen.

Geforscht wird wie in einem Profi-Desk, in drei getrennten Zeiträumen von echten Binance-Kursen:

1. **Lernen** (Januar 2022 bis September 2024): Ein genetischer Algorithmus prüft Setup, Coin, Session und
   alle Parameter. Bewertet wird nach t-Wert der Tagesergebnisse, nicht nach dem höchsten Gewinn.
2. **Auswählen** (Oktober 2024 bis September 2025): Ins Playbook kommt nur, was auch hier im Plus und
   signifikant ist (`automaton/trading/playbook.json`).
3. **Abschlusstest** (Oktober 2025 bis September 2026), einmal, mit Kontrollen.

```bash
.venv/bin/python -m automaton trade profi            # Abschlusstest mit dem gespeicherten Playbook
.venv/bin/python -m automaton trade profi --relearn  # alles neu erforschen (ca. 1 Minute)
```

Ergebnis:

| Schritt | Ergebnis |
|---|---|
| Lernen | 984 Strategien geprüft. Bester Kandidat: Solana VWAP-Pullback, +37,7 % bei t = 3,3 |
| Auswählen | 15 Kandidaten mit t ≥ 1,5 geprüft, 3 bestehen, alle Ethereum Intraday-Momentum zur US-Eröffnung |
| Abschlusstest, Playbook | **+0,52 % im Jahr**, 6 von 12 Monaten positiv, schlechtester Monat −2,13 %, t = 0,13 |
| Münzwurf-Kontrolle | Gleiche Regeln, zufällige Richtung: 8 von 20 Läufen mindestens so gut |
| Zufallskurs-Kontrolle | +0,44 %, +0,30 %, +0,85 %, −5,75 %, +0,67 % |
| Lern-Favorit im Abschlusstest | Solana VWAP-Pullback: −4 % bis −6 % |
| Profi-Desk mit Chef und Prüfer, 1.000 $ | in 0 von 6 Läufen im Plus, typisch −113 $ (laufende Kosten 119 $, Handel vor Gebühren +13 $) |

**So liest du das:**

1. **Auch Profi-Wissen bringt hier keinen verlässlichen Vorteil.** Das beste, zweifach geprüfte Playbook
   liegt im Abschlussjahr bei null und ist von Münzwurf und Zufallskursen nicht zu unterscheiden.
2. **Der glänzendste Kandidat aus dem Lernen war reine Überanpassung.** Er verlor im Abschlussjahr.
   Genau so sehen Backtests aus, mit denen Trading-Systeme verkauft werden.
3. **Monatlich sicher im Plus ist mit diesen Mitteln nicht erreichbar.** Die Setups, Indikatoren und Regeln
   sind allgemein bekannt. Wer damit verdient, hat meist etwas anderes: Geschwindigkeit, Gebührenrabatte
   als Market-Maker, Informationen oder sehr viel Kapital.

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
  trading/          Daytrading-Desk: data.py (echte Kurse), strategy.py (Trader-Erbgut, Handelsmotor),
                    desk.py (Trader, Prüfer, Chef), evaluate.py (Zufallskontrolle, Evolution, Prognose),
                    indicators.py, pro.py (Profi-Setups und -Regeln), research.py (Lernen, Auswählen,
                    Abschlusstest), playbook.json (das ausgewählte Playbook)
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
