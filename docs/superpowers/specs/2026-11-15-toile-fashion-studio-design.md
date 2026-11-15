# TOILE – digitales Atelier für Schnitt, Material und 3D-Anprobe

Stand: 2026-11-15 · Status: freigegeben am 2026-11-15

> Name: In der Haute Couture ist die *Toile* der Probeschnitt aus Nessel, der auf der
> Büste geprüft wird, bevor der echte Stoff geschnitten wird. Genau das soll die App sein.
> (Arbeitstitel, jederzeit änderbar.)

## 1. Absicht und Warum

Eine Web-App, in der man Kleidungsstücke vom Grundschnitt bis zur 3D-Anprobe selbst entwirft:
Schnitt wählen oder selbst konstruieren, Größe und Maße einstellen, Stoffe, Drucke und Farben
aus eigenen Bildern auf einzelne Schnittteile legen, darauf malen wie in Procreate und das
Ergebnis auf einem maßgenauen Avatar in 3D prüfen. Bedienung angelehnt an Procreate und
Photoshop (Ebenen, Pinsel, Mischmodi, Verlauf, Tastenkürzel, Stift).

Nutzer: der Auftraggeber selbst, eventuell 2–3 Freunde. Anspruch: so, dass ein Designer aus
einem Luxushaus damit ernsthaft arbeiten könnte – präzise in Millimetern, mit echter
Schnittlogik statt Deko.

## 2. Ziele, Nicht-Ziele, Anti-Ziele

**Ziele**
- Parametrische Grundschnitte für viele Kategorien, die sich live mit Maßen, Größe und
  Silhouetten-Parametern neu berechnen.
- Eigener Schnitteditor: bestehende Teile verändern und neue Teile zeichnen, inklusive Nähte
  definieren, damit auch eigene Teile in 3D genäht werden.
- Größen: Größensätze Damen/Herren/INT, Gradierung, Maßanfertigung, Gradierbild (alle Größen
  übereinander).
- Material: Bilder hochladen und als Stoff (Rapport in cm), Platzierungsdruck, Farbe oder Muster
  pro Schnittteil einsetzen; Ebenen mit Mischmodi; Malen mit Druckempfindlichkeit.
- 3D-Anprobe: Schnittteile werden um den Avatar gelegt, virtuell zusammengenäht und fallen
  physikalisch; Drucke sitzen exakt dort, wo sie im Schnitt liegen. Passformkarte zeigt, wo es
  spannt.
- Ausgabe: Schnitt 1:1 (SVG, PDF gekachelt mit Kontrollquadrat, DXF), Tech Pack als PDF,
  3D-Renderbilder, Projektdatei zum Teilen.

**Nicht-Ziele (v1)**
- Konten, Login, Cloud-Sync, Bezahlung (später über Supabase/Stripe nachrüstbar).
- Stoff-Stoff-Kollision und Selbstkollision in der Simulation (siehe 9.4 für den Ersatz).
- Hemden mit Klappkragen, Knopfleisten, Abnäherverlegung, Futter – Roadmap.
- Gemeinsames gleichzeitiges Arbeiten an einem Projekt.

**Anti-Ziele** (würde trotz „funktioniert" als Fehlschlag gelten)
- Spielzeug-Optik oder „Malbuch-T-Shirt": Schnitte, die nicht nähbar wären.
- Ungenaue Maße: ein 1:1-Ausdruck, der nicht stimmt.
- Kopierte Originalschnitte oder Logos realer Modehäuser.
- Eine 3D-Ansicht, deren Drucke nicht zum Schnitt passen.
- Datenverlust ohne Warnung.

## 3. Rahmenbedingungen

- Läuft komplett im Browser (Chrome, Edge, Safari aktuell; iPad mit Apple Pencil unterstützt).
- Kein Server, keine Konten. Daten liegen im Browser (IndexedDB). Wer den Browser-Speicher
  löscht, verliert Projekte → App erinnert an Sicherungen und bietet Projektdatei-Export.
- Teilen mit Freunden: gleiche App-Adresse + Projektdatei (`.toile`) austauschen.
- Lebt im Repo `Vox-Polish` im eigenen Ordner `toile/`, unabhängig vom Rest.
- Oberfläche auf Deutsch, Fachbegriffe wie in deutschen Ateliers (Vorderteil, Fadenlauf,
  Knipse, Nahtzugabe, Stoffbruch), englische Branchenbegriffe wo üblich (Tech Pack, Oversized).
- Intern rechnet alles in Millimetern; Anzeige in cm mit einer Nachkommastelle.

## 4. Ansätze

| Weg | Beschreibung | Abwägung |
|---|---|---|
| A – Online-Produkt | Login, Cloud, Abos, Simulation auf dem Server | Wochen Aufbau, laufende Kosten, Fokus geht vom Design-Kern weg |
| **B – Profi-Studio im Browser (gewählt)** | Alles lokal, React + TypeScript + Three.js | Voller Fokus auf Schnitt, Material, 3D; Ausbau zu A ohne Umbau, weil Speicherzugriff hinter einer Schnittstelle liegt |
| C – Baukasten (Lovable/Framer) | Seite aus Baukasten | Keine präzise Schnittkonstruktion/Gradierung möglich |

Gewählt vom Auftraggeber: **B**, zunächst für sich und 2–3 Freunde.

Für die 3D-Anprobe wurden zwei Unterwege abgewogen:
- *Vorgefertigte 3D-Kleidungsmodelle, die nur verformt werden* – einfach, aber Drucke passen
  nicht exakt zum Schnitt, und eigene Schnitte könnten nie in 3D erscheinen.
- **Schnittteile virtuell nähen und fallen lassen (gewählt)** – wie in professionellen
  3D-Schnitt-Programmen, nur vereinfacht. Eigene Schnitte funktionieren automatisch, Drucke
  sitzen exakt. Für feste Teile (Gürtel, Sneaker) wird stattdessen eine feste Form genutzt
  (Abschnitt 9.5).

## 5. Produktaufbau

### 5.1 Arbeitsbereiche

1. **Mappe** – Startseite: Projekte (Looks) als Karten mit 3D-Vorschaubild; neu, öffnen,
   duplizieren, löschen, importieren, exportieren.
2. **Schnitt** – 2D-Schnittansicht (Vektor) mit Werkzeugen, Größen, Parametern, Prüfungen.
3. **Design** – Fläche eines Schnittteils mit Ebenen, Materialien, Pinseln.
4. **Anprobe** – 3D-Avatar mit allen Teilen des Looks.

Geteilte Ansicht (Schnitt oder Design links, Anprobe rechts) ist jederzeit einschaltbar; die
3D-Ansicht aktualisiert sich live.

```
┌────────────────────────────────────────────────────────────────────────────────┐
│ TOILE  Look „SS27 Hoodie" ▾   [Schnitt] [Design] [Anprobe] [⇆]    ↶ ↷   Export ▾ │
├──┬────────────────────────────────────────┬──────────────────┬────────────────┤
│▣ │                                        │                  │ Teile          │
│✎ │   Arbeitsfläche                        │   3D-Anprobe     │ Ebenen         │
│⌫ │   (Schnitt oder Design)                │   (bei ⇆)        │ Eigenschaften  │
│◎ │                                        │                  │ Material       │
│⊕ │                                        │                  │ Maße & Größe   │
├──┴────────────────────────────────────────┴──────────────────┴────────────────┤
│ 100 % · x 23,4 cm  y 41,0 cm · Vorderteil · Größe M · French Terry 320 g/m²      │
└────────────────────────────────────────────────────────────────────────────────┘
```

Im Design-Bereich zusätzlich wie bei Procreate: zwei senkrechte Regler am linken Rand
(Pinselgröße, Deckkraft), Farbkreis oben rechts, Zwei-Finger-Tipp = Rückgängig,
Drei-Finger-Tipp = Wiederholen, Zwei-Finger-Zoom und -Verschieben.

### 5.2 Datenmodell (vereinfacht)

```
Projekt (Look)
 ├─ avatar: Körpermaße + Profil (Damen/Herren) – unabhängig von der Kleidergröße
 ├─ garments[]: Kleidungsstück
 │    ├─ templateId, silhouetteId, params (Mehrweiten, Längen, Stilwerte)
 │    ├─ size: { system, label } oder Maßanfertigung (eigene Maße)
 │    ├─ layerOrder (0 = am Körper, 1 = darüber …)
 │    ├─ pieces[]: Schnittteil (aus Vorlage erzeugt oder eigen/abgelöst)
 │    ├─ seams[]: Nahtpaare (Kante A ↔ Kante B)
 │    └─ instances[]: gestaltbare Fläche je zugeschnittenem Teil (z. B. Ärmel links/rechts)
 │         └─ layers[]: Grundstoff, Bild, Muster, Farbe, Malen, Text
 ├─ materials[]: Stoffbibliothek (Optik + Physik)
 └─ assets[]: hochgeladene Bilder (als Blob in IndexedDB)
```

**Wichtige Trennung:** Der Avatar hat Körpermaße, das Kleidungsstück hat eine Größe. So lässt sich
prüfen, wie Größe M an einem Körper mit Brustumfang 100 cm sitzt – das ist der eigentliche
Zweck einer Anprobe.

## 6. Kategorien und Silhouetten (v1)

Silhouetten sind benannte Parameter-Sätze klassischer Archetypen, keine Kopien realer Häuser.
Jeder Wert bleibt danach per Regler frei änderbar.

| Familie | Kategorie | Silhouetten v1 | Teile |
|---|---|---|---|
| Oberteile | T-Shirt | Classic Regular, Slim, Boxy Cropped, Oversized Drop-Shoulder | Vorderteil, Rückenteil, Ärmel ×2, Halsbündchen |
| | Longsleeve | Regular, Oversized | wie T-Shirt, langer Ärmel, Ärmelbündchen ×2 |
| | Sweatshirt | Regular, Oversized Drop-Shoulder | + Bund, Ärmelbündchen |
| | Hoodie | Regular, Oversized Drop-Shoulder, Cropped Boxy | + Kapuze ×2, Bund, Ärmelbündchen; Kängurutasche als aufgesetzte Linie |
| | Tanktop | Regular, Muscle | Vorderteil, Rückenteil |
| | Jacke | Bomber (Rippbündchen), Boxy Jacket (kastige, kragenlose Couture-Jacke) | Vorderteile ×2, Rückenteil, Ärmel ×2, ggf. Bündchen |
| | Kleid | Shift, A-Linie, T-Shirt-Kleid | Vorderteil, Rückenteil, optional Ärmel |
| Unterteile | Hose/Jeans | Straight Five-Pocket, Slim Tapered, Wide Leg (Marlene), Baggy, Bootcut/Flare, Tailored mit Bundfalte | Vorderhose ×2, Hinterhose ×2, Bund; Passe, Taschen, Steppnähte als Linien |
| | Shorts | Regular, Bermuda | wie Hose |
| | Rock | Bleistift, A-Linie, Tellerrock, Schrägschnitt-Midi | Vorderteil, Rückenteil, Bund |
| Accessoires | Mütze | Beanie (6 Keile + Umschlag), Slouch | Keile ×6, Umschlag |
| | Schal | Klassisch 180×30, Oversize-Stola 200×70 | 1 Teil |
| | Gürtel | Klassisch 3,5 cm, Breit 5 cm | Riemen (+ Schließe als feste Form) |
| | Sneaker | Low-Top Court | Vorderblatt, Seitenteile ×2, Zunge, Fersenkappe, Sohle |

## 7. Schnitt-Engine

### 7.1 Schnittteil

- Umriss: geschlossener Pfad aus Knoten `{id, x, y, Ecke|Glatt, Griff rein, Griff raus}`;
  Segmente sind Geraden oder kubische Bézierkurven. Knoten-IDs sind stabil (z. B. `HPS`,
  `SCHULTERPUNKT`, `ACHSEL`, `SAUM_SEITE`), damit Nähte und Messpunkte nach Neuberechnung
  gültig bleiben.
- Fadenlauf (Linie mit Pfeilen, Winkel frei – Schrägschnitt = 45°).
- Knipse (Position auf einer Kante), innere Linien (Passe, Taschen, Steppnaht, Bundfalte),
  Symmetrieachse.
- Zuschnitt: Anzahl (1/2), gegengleich ja/nein, Stoffbruch ja/nein.
- Nahtzugabe: global (Standard 10 mm, Saum 30 mm, Halsausschnitt 7 mm) und je Kante
  überschreibbar. Anzeige: Nählinie durchgezogen, Schnittlinie außen.
- Platzierung am Körper (für 3D): Zone (Vorderkörper, Rücken, Arm links/rechts, Bein vorne/hinten
  links/rechts, Kopf, Hals, Taille …) und Ausrichtung.

### 7.2 Konstruktion

Jede Vorlage ist eine reine Funktion: `(Maße, Größe, Parameter) → Teile, Nähte, Messpunkte`.
Konstruktion nach klassischer Grundschnitt-Logik (angelehnt an gängige Konstruktionssysteme
wie Müller & Sohn und Aldrich):

- Oberteile: Viertel-Brustweite + Mehrweite, Halsausschnittbreite/-tiefe aus Halsumfang,
  Schulterneigung, Schulterverlängerung (Drop-Shoulder), Armlochtiefe aus Brustumfang und
  Mehrweite, Taillierung optional, Saumweite.
- **Ärmel aus dem Armloch abgeleitet:** Die Armkugel wird so berechnet, dass ihre Länge der
  gemessenen Armlochlänge plus Einhaltemehrweite entspricht (Jersey 0–5 mm, Webware 10–20 mm).
- Hosen: Vorder-/Hinterhose mit Schrittverlängerung (vorne ≈ Hüfte/16, hinten ≈ Hüfte/8),
  schräger hinterer Mitte, Leibhöhe, Bundhöhe (Low/Mid/High Rise), Knie- und Saumweite je
  Silhouette.
- Röcke: Bahnen mit Saumausstellung, Tellerrock als Kreisausschnitt aus dem Taillenradius,
  Schrägschnitt durch Fadenlauf 45°.
- Mütze: Keile aus Kopfumfang (negative Mehrweite für Strick), Schal und Gürtel als Rechtecke mit
  Formparametern, Sneaker über die abgewickelte Leistenkopie (9.5).

### 7.3 Maße, Größen, Gradierung

- Körpermaße: Körpergröße, Brust-, Taillen-, Hüft-, Hals-, Oberarm-, Handgelenk-, Oberschenkel-,
  Knie-, Kopfumfang, Schulterbreite, Rückenlänge, Armlänge, Schrittlänge, Leibhöhe, Fußlänge,
  Fußbreite.
- Größensätze: Damen EU 32–48, Herren EU 44–58, INT XS–3XL (Zuordnung). Werte als Tabelle mit
  Sprungwerten pro Größe; bearbeitbar und als eigener Größensatz speicherbar.
- Maßanfertigung: eigene Maße eingeben, Schnitt wird dafür konstruiert.
- Gradierung: Bei Vorlagen exakt (Neuberechnung je Größe). Bei abgelösten oder eigenen Teilen
  proportional nach den zugehörigen Maßen (Breite nach Brust/Hüfte, Länge nach Körpergröße) –
  im UI als „proportionale Gradierung" gekennzeichnet.
- Gradierbild: alle Größen übereinander in abgestuften Farben.

### 7.4 Schnitteditor (eigene Schnitte)

Werkzeuge: Auswählen/Verschieben (V), Direktauswahl Punkt (A), Punkt einfügen (+), Punkt löschen,
Ecke ↔ Kurve umschalten (C), Zeichenstift für neue Teile (P), Spiegeln/Symmetrisch bearbeiten,
Messen (M, Strecke und Kurvenlänge), Knipse setzen (N), Fadenlauf drehen, **Nähen (S)**: zwei
Kanten anklicken → Naht (Richtung umkehrbar), Hand (H/Leertaste), Zoom.

„Vom Grundschnitt lösen": Ein Vorlagenteil wird zum frei editierbaren Teil (Parameter wirken dann
nicht mehr darauf). Raster/Magnet an Knoten, Hilfslinien; Eingabe exakter Werte im
Eigenschaften-Panel (x/y in cm, Kurvenlänge).

### 7.5 Prüfungen (echter Mehrwert im Atelier)

- **Nahtlängen-Prüfung:** Jede Naht zeigt Länge A, Länge B und Differenz; Ampel je nach
  erwarteter Einhaltung (Seitennaht 0 mm, Armkugel/Armloch je Material, Bündchen bewusst kürzer).
- **Maßtabelle (Points of Measure)** wird aus der Geometrie berechnet, nicht geschätzt:
  Brustweite, Saumweite, Länge ab HPS, Schulterbreite, Ärmellänge, Bund, Schrittlänge, Leibhöhe,
  Knie-, Saumweite usw. – für alle Größen.

## 8. Material- und Design-Engine

### 8.1 Stoffbibliothek

Vorgaben mit Optik und Physik: Single Jersey 180 g/m², French Terry 320 g/m², Rippstrick, Denim
14 oz, Wollflanell, Gabardine, Leinen, Seidensatin, Crêpe, Samt, Nappaleder, Canvas.
Je Material: Farbe/Bild, Rapportgröße in cm, Glanz/Rauheit/Samtschimmer, Webbild als Struktur
(Jersey-Masche, Köper diagonal für Denim, Leinwand, Rippe, Satin, Ledernarbung – prozedural
erzeugt), Gewicht, Dehnung längs/quer/schräg, Biegesteifigkeit.

### 8.2 Ebenen pro Teilfläche

Ebenenarten: **Grundstoff** (Material, rotiert mit dem Fadenlauf), **Bild/Druck** (platziert:
Position in cm, Größe, Drehung), **Muster** (Streifen, Nadelstreifen, Vichy-Karo, Glencheck, Pepita,
Fischgrat, Tupfen, Camouflage, eigenes Motiv als Rapport), **Farbfläche**, **Malen**
(Rasterebene), **Text** (Schrift, Größe in mm).

Eigenschaften: sichtbar, gesperrt, Deckkraft, Mischmodus (Normal, Multiplizieren, Negativ
multiplizieren, Ineinanderkopieren, Weiches Licht, Abdunkeln, Aufhellen, Farbe, Luminanz),
Bildkorrekturen für Bildebenen (Farbton, Sättigung, Helligkeit, Kontrast). Alles wird auf den
Umriss des Teils beschnitten.

**Rapport-Arten** für hochgeladene Motive: Voll, Halb versetzt (Half-Drop), Ziegel (Brick),
Gespiegelt – wie in der Textildruckerei.

Anwenden: auf ein Teil, auf alle gleichen Teile (z. B. beide Ärmel) oder auf das ganze
Kleidungsstück. Für Teile, die zweimal zugeschnitten werden, gibt es je eine Fläche links und
rechts (unterschiedlich gestaltbar, z. B. Schriftzug nur am linken Ärmel). Der Druck liest sich auf
beiden Seiten richtig herum – wie beim echten Zuschnitt.

### 8.3 Pinsel

Pinsel: Fineliner, Tusche, Marker, Airbrush, Kreide/Kohle, Radierer; Größe, Deckkraft, Härte,
Fluss, Abstand, Glättung (Stabilisierung), Druck → Größe/Deckkraft (Apple Pencil, Wacom).
Pipette, Füllen, Farbkreis (HSB) mit Hex-Eingabe, Projektpalette. Malen direkt auf dem Schnittteil
**oder direkt auf dem 3D-Modell**.

## 9. 3D-Anprobe

### 9.1 Avatar

Stilisierte Schneiderpuppe mit Armen, Beinen und Kopf, matt elfenbeinfarben, in A-Pose. Form
und Proportionen kommen aus den Körpermaßen (Torso aus Querschnitt-Ellipsen auf Hals-, Brust-,
Taillen-, Hüfthöhe; Arme, Beine als sich verjüngende Kapseln; Kopf, Füße). Dieselben Formen
dienen als Kollisionskörper.

### 9.2 Simulation

Positionsbasierte Stoffsimulation (PBD):
1. **Anordnen:** Jedes Teil wird vernetzt (Dreiecke, Abstand 12–25 mm je Qualitätsstufe) und
   gebogen um seine Körperzone gelegt.
2. **Nähen:** Gegenüberliegende Nahtkanten werden nach Länge gleich aufgeteilt und
   zusammengezogen (Mehrlänge erzeugt echtes Einhalten/Kräuseln, z. B. am Bündchen).
3. **Fallen lassen:** Schwerkraft, Dehn- und Biegewiderstand nach Material, **richtungsabhängig
   nach Fadenlauf** (Webware fest in Kett- und Schussrichtung, nachgiebig im Schrägen; Strick
   quer dehnbar).
4. **Ruhe:** stoppt automatisch, wenn sich nichts mehr bewegt; danach läuft nichts im
   Hintergrund.

Neu simuliert wird bei Änderung von Schnitt, Größe, Material, Avatar. Ein Fortschrittsbalken
zeigt den Stand; Malen und Texturänderungen brauchen keine neue Simulation.

### 9.3 Darstellung

Physikalisch basiertes Material (Rauheit, Samtschimmer, Webbild-Struktur), Texturen aus der
Design-Engine mit den 2D-Schnittkoordinaten → Drucke exakt platziert. Licht: Studio, Tageslicht,
Laufsteg. Ansichten vorne/hinten/seitlich, Drehteller, Renderbild als PNG (2×).
**Passformkarte:** Farben von Blau (locker) über Grün bis Rot (spannt, > 8 % Dehnung) mit Legende.
Optional Nähte einblenden.

### 9.4 Mehrere Teile (Look)

Mehrere Kleidungsstücke gleichzeitig. Statt Stoff-Stoff-Kollision: Jede Lage kollidiert mit einem
um ihre Lagenstärke vergrößerten Körper (Lage 1 = +6 mm usw.). Lagenreihenfolge im Panel
verschiebbar (Hoodie über Shirt, Gürtel über Hose).

### 9.5 Feste Teile

- **Gürtel:** fester Ring entlang der Taillen-/Hüftform des Avatars (plus Lagenabstand), Riemen-
  Textur aus der Design-Fläche, Schließe als Metall-Form.
- **Sneaker:** Ein parametrischer Leisten aus Fußlänge/-breite; die Oberfläche des Leistens wird
  abgewickelt (*Leistenkopie* – so arbeiten Schuhmodelleure tatsächlich). Die Teile des Schafts
  (Vorderblatt, Seitenteile, Zunge, Fersenkappe) sind Bereiche auf dieser Abwicklung, jeweils
  eigene Design-Fläche, im Editor verschiebbar. Sohle als eigener Körper mit Profilkante,
  Schnürung als Röhren.
- **Linker und rechter Schuh getrennt gestaltbar:** Standard ist „Paar gekoppelt" (links und
  rechts teilen alle Ebenen, Motive werden spiegelrichtig übernommen). Per Schalter
  „Links/Rechts getrennt" bekommt jeder Schuh eigene Ebenen für jedes Schaftteil, die Sohle und
  die Schnürung; „Von links übernehmen" kopiert den aktuellen Stand auf die andere Seite.
  Dasselbe Prinzip gilt für alle Teile, die zweimal zugeschnitten werden (Ärmel, Hosenbeine).

## 10. Ausgabe

- **Schnitt:** SVG 1:1 (mm), PDF gekachelt A4/A3 mit Klebemarken, Seitenraster und
  10-cm-Kontrollquadrat, PDF Plotter (eine große Seite), DXF (Schnittlinie, Nählinie, Fadenlauf,
  Knipse, Beschriftung als Layer). Optionen: Größen wählen, Nahtzugabe ein/aus.
- **Tech Pack (PDF):** Deckblatt mit 3D-Ansichten vorne/hinten, Schnittübersicht, Maßtabelle
  über alle Größen, Materialliste mit Gewicht und Zusammensetzung, Farbpalette, Drucke mit
  Position und Größe, Nahtliste mit Längenprüfung.
- **Bilder:** 3D-Renderings PNG, Design-Flächen PNG.
- **Projektdatei** `.toile` (JSON mit eingebetteten Bildern) zum Sichern und Teilen.

## 11. Speicherung und Teilen

- Automatisches Speichern (≈1,5 s nach jeder Änderung) in IndexedDB; Bilder und Malebenen als
  Blobs.
- Rückgängig/Wiederholen über alles (Schnitt, Ebenen, Pinselstriche), mindestens 100 Schritte.
- Speicherzugriff liegt hinter einer Schnittstelle (`ProjectStore`), damit später Supabase
  angeschlossen werden kann.
- Erinnerung an Sicherung, wenn ein Projekt länger nicht exportiert wurde.
- Offline-fähig und auf dem iPad als App installierbar (PWA).

## 12. Bedienung

Tastenkürzel: 1/2/3 Arbeitsbereich, ⌘/Strg+Z / ⇧+⌘/Strg+Z, V, A, P, C, M, N, S, H, B (Pinsel),
E (Radierer), I (Pipette), G (Füllen), T (Text), [ ] Pinselgröße, Leertaste = Hand,
⌘/Strg+0 = einpassen. Stift, Maus und Touch über Pointer Events; Druck und Neigung werden
ausgewertet. Dunkles, ruhiges Studio-UI mit feinen Linien, eine Akzentfarbe (Champagner),
Serifen-Wortmarke, Inter als Schrift.

## 13. Technik

- Vite, React 18, TypeScript (strict), Zustand + Immer (Zustand und Verlauf über Patches).
- 2D-Schnitt: SVG. Design-Flächen und Pinsel: Canvas 2D. 3D: three.js über
  @react-three/fiber und drei.
- Vernetzung: Delaunator; PDF: jsPDF; IndexedDB: idb-keyval; Icons: lucide-react; Schriften lokal
  über @fontsource.
- Tests: Vitest für Geometrie, Konstruktion, Gradierung, Nahtlängen, Exportmaßstab und
  Simulation.

```
toile/src/
  core/geometry   Vektoren, Bézier, Abtasten, Versatz (Nahtzugabe), Polygone, Vernetzung
  core/pattern    Teile, Nähte, Knipse, Messpunkte, Prüfungen
  core/sizing     Maße, Größensätze, Gradierung
  core/templates  Oberteile, Unterteile, Rock, Mütze, Schal, Gürtel, Sneaker, Silhouetten
  core/sim        Stoffsimulation, Körperformen, Platzierung
  core/textile    Materialien, Muster, Rapporte, Strukturkarten
  core/export     SVG, DXF, PDF, Tech Pack, Projektdatei
  state/          Store, Verlauf, Speicherung
  render2d/       Flächen-Compositing, Pinsel-Engine
  views/          Mappe, Schnitt, Design, Anprobe
  ui/             Leisten, Panels, Dialoge
```

## 14. Qualität und Prüfung

- Konstruktion: Für jede Vorlage und Größe stimmen die berechneten Fertigmaße mit den
  Sollwerten (Körpermaß + Mehrweite) auf ±2 mm überein; Seitennähte gleich lang; Armkugel minus
  Armloch innerhalb der Einhaltetoleranz.
- Export: SVG/PDF/DXF-Maßstab exakt (10-cm-Quadrat misst 100,0 mm).
- Simulation: keine ungültigen Werte, Nähte nach dem Nähen geschlossen (< 3 mm Abstand), Stoff
  ruht innerhalb einer festen Schrittzahl, keine Teile fallen vom Avatar.
- Im Browser durchgeklickt: jede Kategorie anlegen, Größe wechseln, Bild hochladen und als Stoff
  und Druck setzen, malen (auch in 3D), exportieren, Projekt neu laden.

## 15. Risiken

| Risiko | Gegenmaßnahme |
|---|---|
| Simulation instabil oder Kleidung rutscht ab | Stufenweises Nähen, vorsichtige Parameter, Tests je Vorlage, Qualitätsstufen |
| iPad zu langsam | Gröberes Netz automatisch, Simulation stoppt in Ruhe, Texturen max. 2048 px |
| Eigene Teile ohne sinnvolle Zone | Zone muss beim Anlegen gewählt werden; ohne Naht wird das Teil nur angezeigt, nicht simuliert |
| Umfang | Bau-Reihenfolge unten; jede Stufe ist für sich nutzbar |

## 16. Bau-Reihenfolge

1. Gerüst: Projektmappe, Store, Verlauf, Speicherung, Oberfläche.
2. Schnitt-Engine, Größen, T-Shirt und Hoodie, Schnittansicht mit Editor, Prüfungen.
3. Material- und Design-Engine: Stoffe, Ebenen, Upload, Muster, Pinsel.
4. 3D: Avatar, Simulation, Texturen, Passformkarte, Looks mit Lagen.
5. Weitere Kategorien: Longsleeve, Sweatshirt, Tanktop, Jacke, Kleid, Hose/Jeans, Shorts, Rock,
   Mütze, Schal.
6. Feste Teile: Gürtel, Sneaker.
7. Ausgabe: SVG, PDF, DXF, Tech Pack, Renderbilder, Projektdatei; Malen in 3D; Gradierbild.

## 17. Dem Builder überlassen

Exakte Konstruktionskonstanten innerhalb der genannten Logik, Simulationskonstanten, Pinseldynamik,
Icon-Auswahl, Mikro-Layout der Panels, Farbabstufungen, Standardwerte der Silhouetten.

### Entscheidungen, die ich (Claude) getroffen habe – bitte prüfen

- Name „TOILE", deutsche Oberfläche, Anzeige in cm.
- Avatar-Profil (Damen/Herren) wird beim Anlegen eines Looks gewählt, Standard Damen EU 38.
- Hochgeladene Bilder werden auf max. 4096 px (lange Seite) verkleinert, Texturen je Teil max.
  2048 px – Kompromiss aus Schärfe und iPad-Speicher.
- Sneaker immer als Paar; links/rechts gekoppelt oder getrennt gestaltbar (Wunsch des Auftraggebers).
- Teilen mit Freunden über Projektdatei, nicht über Konten.

## 18. Später (Roadmap)

Konten und Cloud (Supabase), Teilen per Link, Abos (Stripe), Hemd mit Kragen und Knopfleiste,
Abnäherverlegung, Futter, Stoff-Stoff-Kollision, Animation (Laufsteg-Gang), Avatar aus Fotos,
Verkauf/Print-on-Demand (Shopify).
