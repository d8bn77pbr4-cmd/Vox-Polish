# Garderobe

Kleiderschrank als Handy-Web-App: Fotos hochladen, die App legt jedes Kleidungsstück einzeln an,
schlägt jeden Tag ein Outfit vor und zeigt Kombinationen an einer Puppe mit eigenen Maßen.

Entwurf: `../docs/superpowers/specs/2026-11-13-outfit-app-design.md` ·
Bauplan: `../docs/superpowers/plans/2026-11-13-outfit-app.md`

## Starten

```bash
npm install
npm run dev        # Entwicklung, http://localhost:5173
npm test           # Regeln: Farben, Outfit-Punkte, Kauf-Check, Tagebuch, Puppe, Zuschnitt
npm run build      # fertige App nach dist/
```

## Aufbau

| Teil | Wo | Aufgabe |
|---|---|---|
| App | `src/` | React-Oberfläche. Regeln ohne Oberfläche liegen in `src/lib/` und sind getestet. |
| Datenbank | `supabase/migrations/` | Tabellen, Zugriffsregeln (jede Person sieht nur Eigenes), Einladungen, Bild-Speicher. |
| `register` | `supabase/functions/register/` | Legt Konten an – nur für eingeladene E-Mails mit Code. Das erste Konto wird Admin. |
| `analyze` | `supabase/functions/analyze/` | Schickt ein Foto an Claude und liefert die gefundenen Teile. Höchstens 40 Fotos pro Person und Tag. |
| Freistellen | `src/lib/cutout/` | Läuft im Browser: Kleidung an Personen über `Xenova/segformer_b2_clothes`, alles andere über `briaai/RMBG-1.4`. |

Supabase-Projekt: `kleiderschrank` (`hsrlutussqelcskbqarj`, Frankfurt).

## Einrichten

1. **Claude-Schlüssel:** im Supabase-Dashboard unter Edge Functions → Secrets als `ANTHROPIC_API_KEY` eintragen.
   Ohne Schlüssel läuft alles außer der automatischen Erkennung; Teile lassen sich dann von Hand einrahmen.
   Optional `ANALYZE_MODEL` (Standard `claude-opus-5-5`), z. B. `claude-haiku-5-5` für geringere Kosten.
2. **Erstes Konto:** App öffnen → „Konto anlegen“. Das erste Konto braucht keinen Code und wird Admin.
3. **Freunde einladen:** „Ich“ → Einladungen → E-Mail eintragen → „Link teilen“.

## Gut zu wissen

- Anmeldung mit E-Mail und Passwort, ohne Bestätigungsmail. Passwort vergessen: im Supabase-Dashboard
  unter Authentication → Users zurücksetzen.
- Originalfotos werden nicht gespeichert, nur die freigestellten Teile.
- `briaai/RMBG-1.4` ist nur für nicht-kommerzielle Nutzung lizenziert.
- Die Puppe zeigt, wie Teile zusammen aussehen. Sie sagt nichts darüber, ob eine Größe passt.

## Prüfen im Browser

Die Skripte in `e2e/` steuern einen Browser im Handy-Format gegen die laufende App
(`npm run build && npx vite preview --port 4173`). Sie brauchen ein Testkonto:

```bash
EMAIL=… PASSWORD=… node e2e/seed.cjs                       # Beispiel-Teile anlegen
EMAIL=… PASSWORD=… node e2e/tour.cjs                       # Rundgang durch alle Bildschirme
EMAIL=… PASSWORD=… PHOTO=foto.jpg node e2e/import.cjs      # Import mit echtem Freistellen
EMAIL=… PASSWORD=… PHOTO=foto.jpg node e2e/manual.cjs      # Weg ohne Claude-Schlüssel
```

`import.cjs` ersetzt die Fotoanalyse durch feste Ergebnisse (`localStorage['garderobe.mock']`),
damit der Test ohne Claude-Schlüssel und ohne Kosten läuft.
