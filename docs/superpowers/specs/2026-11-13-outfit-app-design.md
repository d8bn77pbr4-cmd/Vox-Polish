# Kleiderschrank-App – Design

Stand: 2026-11-13 · Ordner im Repo: `outfit-app/`

## Wozu

Jeden Morgen ein passendes Outfit aus dem eigenen Schrank, ohne nachzudenken, und vor dem Kauf
testen, ob ein neues Teil zum Rest passt. Die Kleidung landet ohne Einzel-Scannen in der App:
Fotos aus der Galerie hochladen, die App findet und speichert jedes Teil selbst.
Nutzer: du plus 3–4 eingeladene Freunde, jede Person mit eigenem, privatem Schrank.

## Ziele

1. **Import:** mehrere Galerie-Fotos auf einmal (auf dem Laptop auch per Drag & Drop). Jede Art Foto:
   Spiegel-Selfie, Teile auf Bett/Boden, Shop-Screenshot. Pro Teil: freigestelltes Bild, Kategorie,
   Farben, Muster, Material, Wärme, Formalität, Saison. Ergebnis vor dem Speichern prüfbar und korrigierbar.
2. **Schrank:** Kachel-Raster wie Pinterest/Tise, Filter nach Kategorie, Farbe, Saison, Wunschliste.
3. **Outfit des Tages:** täglicher Vorschlag, neu würfelbar, 👍/👎 fließt in künftige Vorschläge ein.
4. **Anprobe-Puppe:** Figur nach eigenen Maßen, der man Schrank-Teile und Kauf-Kandidaten anzieht.
5. **Extras:** Wetter-Outfit · Kauf-Check · Trage-Tagebuch.

## Nicht-Ziele

- App-Store-App (es wird eine installierbare Web-App/PWA).
- Passform- oder Größenvorhersage. Die Puppe zeigt Kombination und Proportionen, nicht, ob es passt.
- Soziale Funktionen (Feed, Teilen von Outfits zwischen Freunden).
- Analyse ohne Internet.

## Anti-Ziele (wäre ein Fehlschlag, auch wenn es technisch läuft)

- Jemand sieht den Schrank einer anderen Person.
- Fremde mit dem Link verbrauchen das API-Guthaben.
- Im Normalfall muss man jedes Teil einzeln nachbearbeiten.
- Die Puppe tut so, als zeige sie echte Passform.

## Rahmenbedingungen

- Kosten: kostenlose Tarife (Supabase, Vercel, Open-Meteo). Nur die Fotoanalyse kostet (wenige Cent
  pro Foto, über den Claude-API-Schlüssel des Besitzers, auch für die Freunde).
- Supabase-Konto hat schon 2 aktive kostenlose Projekte (`bewerbungsradar`, `streugut-zentrale`).
  Der kostenlose Tarif erlaubt nur 2 aktive Projekte → Entscheidung nötig (siehe „Offen“).
- Läuft gut auf iPhone-Safari und Android-Chrome. Schwere KI-Modelle nur bei Bedarf laden und cachen.
- Der API-Schlüssel steht nie im Browser-Code und nie im Repo.

## Vorgehensweisen (abgewogen, gewählt)

| Schritt | A | B | C | Gewählt |
|---|---|---|---|---|
| Fotoanalyse | Nur KI im Browser (gratis, schwach bei Bett-Fotos/Screenshots) | Claude erkennt Teile + Rahmen, Freistellen im Browser | Rahmen von Hand ziehen | **B mit C als Korrektur** (vom Nutzer gewählt) |
| Speicher & Login | Lokal, kein Login (Datenverlust, API ungeschützt) | Login per E-Mail-Link + Supabase-Cloud | Code pro Person (unsicher) | **B** (vom Nutzer gewählt) |
| Puppe | 2D-Figur mit Tiefe, Maße verformen sie, Teile an Ankerpunkten | Drehbare 3D-Figur, Kleidung als flaches Bild | KI-Anprobe auf Foto (teuer, Körperfotos extern) | **A** (vom Nutzer gewählt) |
| Freistellen (meine Wahl) | Nur Hintergrund-Entfernung (scheitert bei getragenen Teilen: schneidet die ganze Person aus) | Nur Kleidungs-Segmentierung (scheitert bei Teilen ohne Person) | **Je nach Foto:** getragen → Kleidungs-Segmentierung, liegend/Shop → Hintergrund-Entfernung | **C** |
| Outfit-Generator (meine Wahl) | Claude pro Vorschlag (kostet täglich, langsam) | **Regeln + Punkte im Browser** (gratis, sofort, lernt aus 👍/👎) | Zufall mit Filtern (oft unpassend) | **B** |
| Hosting (meine Wahl) | **Vercel (Seite) + Supabase (Daten, Login, Analyse-Funktion)** | Alles Supabase (kann keine Seite hosten) | GitHub Pages + Supabase (kein Vorschau-Deploy, schlechter für PWA-Header) | **A** |

## Aufbau

**Technik (meine Wahl):** React + TypeScript + Vite, `vite-plugin-pwa`, Supabase JS,
`@huggingface/transformers` in einem Web-Worker für das Freistellen, schlichtes CSS mit Design-Tokens,
Vitest für die Logik. Oberfläche auf Deutsch.

**Navigation (Tab-Leiste unten):** Heute · Schrank · ＋ Import · Puppe · Ich

```
┌─────────────────────┐
│ Schrank   [Filter]  │
│ ┌────┐ ┌────┐       │   Masonry-Spalten (2 auf Handy, 4–5 am Laptop),
│ │ 👕 │ │    │       │   freigestellte Teile auf hellen, runden Karten
│ └────┘ │ 👖 │       │
│ ┌────┐ │    │       │
│ │ 👟 │ └────┘       │
├─────────────────────┤
│ Heute Schrank ＋ Puppe Ich │
└─────────────────────┘
```

### Daten (Supabase)

- `profiles`: Anzeigename, Maße (Größe, Schulterbreite, Brust, Taille, Hüfte, Innenbein), Hautton,
  Ort (Name, Breite, Länge), `is_admin`.
- `items`: Bildpfad + Vorschaubild, Kategorie/Unterkategorie, Farben (Hex + Name), Muster, Material,
  Wärme 1–5, Formalität 1–5, Saisons, Stil-Tags, Preis (optional), `is_wishlist`, angelegt am.
- `outfits`: Datum, Teile, Herkunft (Tag/manuell/Puppe), Bewertung (−1/0/1), getragen (ja/nein),
  Puppen-Anpassungen je Teil (Versatz, Größe).
- `invites`: eingeladene E-Mails. `analysis_usage`: Analysen pro Person und Tag.
- Speicher-Bucket `items`, Ordner je Person. Row-Level-Security: jede Person sieht nur eigene Zeilen/Dateien.
- Originalfotos werden **nicht** gespeichert, nur die freigestellten Teile (WebP mit Transparenz,
  max. 1024 px, Vorschaubild 400 px). Meine Wahl: Datenschutz und Speicherplatz.

### Login & Einladungen

- Anmeldung mit **E-Mail + Passwort**, ohne Bestätigungsmail. Grund (meine Wahl, Abweichung vom
  E-Mail-Link): Supabases eingebauter Mailversand schickt nur an Mitglieder des Supabase-Teams und
  nur wenige Mails pro Stunde; ein Login-Link käme bei den Freunden nicht an. Mit eigenem Mailserver
  (z. B. Resend + eigene Domain) lässt sich der E-Mail-Link später nachrüsten.
- Passwort vergessen: Admin setzt es im Supabase-Dashboard zurück (ohne eigenen Mailserver).
- Ein Auth-Hook („before user created“) lehnt jede E-Mail ab, die nicht in `invites` steht.
- Doppelt gesichert: Row-Level-Security und `analyze` prüfen zusätzlich, dass die E-Mail eingeladen ist
  (falls der Hook im Tarif fehlt, bleibt die App trotzdem dicht).
- Admin (du) trägt im Bereich „Ich“ E-Mails der Freunde ein.

### Fotoanalyse

1. Browser verkleinert das Foto (lange Seite ≤ 1568 px) und schickt es an die Supabase-Funktion `analyze`.
2. `analyze` prüft Login und Tageslimit (meine Wahl: 40 Fotos pro Person und Tag), ruft Claude mit
   festem JSON-Schema auf und gibt pro Teil zurück: Kategorie, „getragen ja/nein“, Rahmen (relativ 0–1),
   Farben, Muster, Material, Wärme, Formalität, Saisons, Stil-Tags.
3. Browser schneidet jeden Rahmen aus dem Originalfoto (mit etwas Rand) und stellt frei:
   getragen → Kleidungs-Segmentierung (Modell erkennt Oberteil, Hose, Rock, Kleid, Schuhe, Tasche, Hut,
   Schal, Gürtel an Personen); sonst → Hintergrund-Entfernung. Danach auf den Inhalt zuschneiden.
4. Prüf-Ansicht: alle gefundenen Teile als Karten. Pro Teil änderbar: Kategorie, Farben, Werte;
   „Rahmen anpassen“ (Ecken auf dem Foto ziehen → neu freistellen); Freistellen an/aus; löschen.
5. Speichern lädt Bilder hoch und legt `items` an. Mehrere Fotos laufen nacheinander mit Fortschritt.

### Outfit des Tages + Wetter

- Wetter: Open-Meteo (ohne Schlüssel) für den Ort aus dem Profil oder per Standortfreigabe:
  Höchst-/Tiefstwert, Regenwahrscheinlichkeit.
- Ein Outfit = (Oberteil + Unterteil) oder Kleid, + Schuhe, optional Jacke/Pullover und Accessoire.
- Punkte: Wärme passt zur Temperatur · Farben harmonieren (Neutrale passen zu allem, sonst
  ähnliche oder Komplementär-Farbtöne, max. ein Muster) · ähnliche Formalität · Saison ·
  nicht in den letzten 7 Tagen getragen · gelernte Vorlieben aus 👍/👎 (Paar-Werte zwischen Teilen).
- Fester Zufalls-Startwert aus Datum + Person: Der Vorschlag bleibt den Tag über gleich, bis man neu würfelt.
- Wunschlisten-Teile sind nie im Tagesvorschlag.

### Anprobe-Puppe

- SVG-Figur. Maße verformen Schultern, Brust, Taille, Hüfte, Beinlänge; Umfänge werden in
  Frontbreiten umgerechnet. Weiche Schattierung für Tiefe. Hautton wählbar.
- Ankerzonen je Kategorie, z. B. Oberteil: Schulter → Hüfte (an Breite ausgerichtet);
  Hose: Taille → Knöchel (an Höhe ausgerichtet); Rock: Taille → Knie; Kleid: Schulter → Knie;
  Jacke über Oberteil; Schuhe an den Füßen; Hut, Tasche, Schal.
- Ebenen-Reihenfolge: Schuhe < Unterteil < Oberteil < Jacke < Accessoires.
- Feinjustieren per Ziehen/Zwei-Finger-Zoom; wird im Outfit gespeichert.
- Teile kommen aus dem Schrank oder der Wunschliste; Outfit speichern oder „Heute getragen“.

### Kauf-Check

- „Teil zum Testen“: Shop-Screenshot oder Foto → gleiche Analyse → als Wunschlisten-Teil gespeichert.
- Zeigt: wie viele gültige Outfits es mit dem Schrank ergibt (Generator-Regeln, Mindestpunktzahl),
  die 3 besten Kombis (antippen → auf der Puppe), Farb-Passung zum Schrank.
- „Gekauft“ verschiebt das Teil in den Schrank.

### Trage-Tagebuch

- „Heute getragen“ auf dem Heute-Tab und in der Puppe.
- Kalender-Monatsansicht mit Outfit-Vorschauen.
- Pro Teil: wie oft getragen, zuletzt getragen, Kosten pro Tragen (wenn Preis eingetragen).
- Liste „Lange nicht getragen“ (≥ 90 Tage oder nie, wenn seit ≥ 30 Tagen im Schrank).

### Offline

App-Oberfläche und zuletzt geladene Bilder werden gecacht. Schrank ansehen geht offline,
Ändern und Analysieren brauchen Internet. (Meine Wahl.)

## Tests

- Vitest für die reine Logik: Generator-Punkte, Farb-Harmonie, Puppen-Geometrie, Rahmen-Zuschnitt,
  Wetter-Zuordnung, Kauf-Check-Zählung.
- Die Analyse-Funktion wird in Tests durch eine Attrappe ersetzt (hier gibt es keinen API-Schlüssel).
- Playwright-Durchlauf auf Handy-Größe gegen die laufende App: Import (mit Attrappe), Schrank, Heute, Puppe.

## Dem Bauenden überlassen

Genaues Claude-Modell (Kosten/Qualität, wird bei der Umsetzung geprüft), genaue Freistell-Modelle,
Feinheiten des Aussehens, Gewichte im Generator.

## Offen (nur der Besitzer kann entscheiden)

1. **Supabase-Projekt:** neues Projekt (dafür eins der beiden bestehenden pausieren oder bezahlten Tarif)
   oder die Tabellen in ein bestehendes Projekt legen.
2. **Claude-API-Schlüssel:** trägst du selbst in Supabase ein (Edge Functions → Secrets → `ANTHROPIC_API_KEY`),
   nie im Chat.
3. **Erste Einladung:** deine eigene E-Mail trägst du selbst ein, oder ich darf sie eintragen.
