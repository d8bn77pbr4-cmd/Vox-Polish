# Garderobe (Kleiderschrank-App) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Installierbare Web-App, in der eingeladene Personen ihre Kleidung per Foto-Import anlegen, täglich ein Outfit bekommen und Teile an einer Puppe mit eigenen Maßen anprobieren.

**Architecture:** React-PWA (Vite) spricht direkt mit Supabase (Auth, Postgres mit RLS, privater Storage). Zwei Edge Functions: `register` (legt eingeladene Konten ohne Bestätigungsmail an) und `analyze` (ruft Claude mit dem geheimen Schlüssel auf). Freistellen läuft im Browser in einem Web-Worker. Alle Regeln (Generator, Farben, Puppe, Kauf-Check, Tagebuch) sind reine Funktionen in `src/lib/` mit Vitest-Tests.

**Tech Stack:** React 18, TypeScript, Vite, vite-plugin-pwa, @supabase/supabase-js, @huggingface/transformers, Vitest, Playwright (vorinstalliert). Edge Functions: Deno, `npm:@anthropic-ai/sdk`, `npm:zod`.

**Spec:** `docs/superpowers/specs/2026-11-13-outfit-app-design.md`

**Ausführung:** Der Besitzer hat „leg los, mach es selbst“ gesagt → ich setze den Plan direkt in dieser Sitzung um, ohne weitere Freigabe-Runde und ohne Unter-Agenten (Token sparen). Statt strengem Test-zuerst pro Schritt: Logik-Module mit Tests im selben Task, Oberfläche per Playwright-Durchlauf am Ende.

## Global Constraints

- Ordner `outfit-app/`; Supabase-Projekt `kleiderschrank` (`hsrlutussqelcskbqarj`, eu-central-1).
- Oberfläche auf Deutsch. App-Name: **Garderobe**.
- `ANTHROPIC_API_KEY` nur als Edge-Function-Secret; nie im Repo, nie im Browser.
- Modell für die Analyse: `claude-opus-5-5`, `effort: "low"`, per Secret `ANALYZE_MODEL` überschreibbar.
- Tageslimit: 40 Analysen pro Person und Tag.
- Originalfotos werden nicht gespeichert; Teile als WebP (max. 1024 px) + Vorschau (400 px).
- Jede Person sieht nur eigene Zeilen und Dateien (RLS überall, Bucket privat).
- Konto anlegen geht nur für E-Mails in `invites`. Ausnahme: Das allererste Konto darf sich frei anlegen und wird Admin.
- Outfit-Schwelle „gültig“ im Kauf-Check: 55 von 100 Punkten.

## Review Focus

1. **Fast leerer Schrank** (keine Schuhe, nur Oberteile): Generator liefert ein Teil-Outfit oder `null` mit Hinweis, kein Absturz → Test in Task 3.
2. **Analyse liefert Unsinn** (0 Teile, Rahmen außerhalb 0–1, Breite 0): Rahmen werden begrenzt, leere verworfen; „nichts gefunden“ + Teil von Hand → Test in Task 2 (`crop`).
3. **Riesige Fotos** (12 MP+): vor Analyse und Freistellen verkleinern (Analyse ≤ 1568 px, Arbeit ≤ 2048 px) → Test in Task 2 (`fitSize`).
4. **Schlüssel fehlt / Limit erreicht / offline**: klare deutsche Meldung, Import von Hand bleibt möglich → `analyze` gibt Fehlercodes `no_key`, `limit`, `refused`, `upstream`; geprüft per Aufruf der deployten Funktion (Task 5).
5. **Maße leer oder absurd**: auf sinnvolle Bereiche begrenzen, Puppe bleibt gültig → Test in Task 4.

---

## Dateien

```
outfit-app/
  index.html  package.json  vite.config.ts  tsconfig.json  vercel.json
  public/            icon-192.png icon-512.png apple-touch-icon.png
  supabase/migrations/0001_init.sql
  supabase/functions/register/index.ts
  supabase/functions/analyze/index.ts
  src/
    main.tsx  App.tsx  styles.css  store.tsx (Kontext: Sitzung, Profil, Teile, Outfits)
    lib/ types.ts  rng.ts  color.ts  weather.ts  generator.ts  purchase.ts
         doll.ts  crop.ts  wear.ts  supabase.ts  api.ts  analyze.ts  images.ts
         cutout/client.ts  cutout/worker.ts
    components/ TabBar Masonry ItemCard DollFigure BoxEditor Sheet
    screens/ Login Today Wardrobe ItemSheet Import Doll Me
  e2e/smoke.mjs
```

## Zentrale Typen (`src/lib/types.ts`)

```ts
type Category = 'top'|'bottom'|'dress'|'outerwear'|'shoes'|'accessory'
type Length = 'short'|'mid'|'long'
type AccessoryType = 'hat'|'bag'|'scarf'|'belt'|'glasses'|'jewelry'|'other'
type Season = 'spring'|'summer'|'autumn'|'winter'
interface ItemColor { hex: string; name: string }
interface Item { id; user_id; image_path; thumb_path; aspect: number /* Breite/Höhe */;
  name: string; category: Category; subcategory: string; length: Length|null;
  accessory_type: AccessoryType|null; colors: ItemColor[]; pattern: string; material: string;
  warmth: 1..5; formality: 1..5; seasons: Season[]; tags: string[]; price: number|null;
  is_wishlist: boolean; created_at: string }
interface Outfit { id; user_id; date: string /* YYYY-MM-DD */; item_ids: string[];
  source: 'daily'|'manual'|'doll'; rating: -1|0|1; worn: boolean;
  adjust: Record<string,{dx:number;dy:number;scale:number}> }
interface Measurements { height; shoulders; bust; waist; hips; inseam } // cm
interface Profile { user_id; display_name; measurements: Measurements; skin_tone: string;
  place_name: string|null; lat: number|null; lon: number|null }
interface Weather { tMax: number; tMin: number; rainProb: number; code: number }
interface DetectedItem { box:{x,y,w,h} /* 0–1 */; worn: boolean; name; category; subcategory;
  length; accessory_type; colors; pattern; material; warmth; formality; seasons; tags }
```

---

### Task 1: Gerüst + Datenbank

- [ ] Vite-React-TS-Projekt in `outfit-app/`, PWA-Plugin, `vercel.json` (SPA-Rewrite), Icons.
- [ ] Migration `0001_init.sql`: Tabellen `invites(email pk, is_admin, invited_by, created_at)`, `profiles`, `items`, `outfits`, `analysis_usage(user_id, day, count)`; RLS: eigene Zeilen; `invites` nur für Admin; Funktionen `is_admin()`, `bump_usage(uid, lim) → boolean`; Trigger vor `auth.users`-Insert (nur eingeladene E-Mails, erstes Konto frei), nach Insert Profil anlegen; Bucket `items` privat mit Ordner-RLS.
- [ ] Migration anwenden, Security-Advisor prüfen.

### Task 2: Farbe, Zufall, Zuschnitt, Wetter (rein, mit Tests)

- `rng.ts`: `hashSeed(s: string): number`, `mulberry32(seed): () => number`.
- `color.ts`: `hexToHsl(hex)`, `isNeutral(hex): boolean`, `pairHarmony(a, b): number /* 0–1 */`, `colorFamily(hex): string`.
- `crop.ts`: `clampBox(box): Box|null` (verwirft < 2 % Kantenlänge), `padBox(box, pad=0.06): Box`, `toPixels(box, w, h)`, `fitSize(w, h, max): {w,h}`, `alphaBounds(data, w, h, thr=24): Box|null`.
- `weather.ts`: `targetWarmth(t: number): 1..5` (≥26→1, ≥20→2, ≥13→3, ≥5→4, sonst 5), `needsOuterwear(w: Weather): boolean` (tMax<15 oder rainProb≥50), `fetchWeather(lat, lon): Promise<Weather>`, `searchPlace(q)`.

### Task 3: Generator, Kauf-Check, Tagebuch (rein, mit Tests)

- `generator.ts`:
  - `interface Ctx { weather: Weather|null; season: Season; recentIds: Set<string>; affinity: Map<string, number> }`
  - `buildAffinity(outfits: Outfit[]): Map<string, number>` (Schlüssel `a|b` sortiert und `id`; Summe der Bewertungen, begrenzt auf ±2)
  - `scoreOutfit(items: Item[], ctx: Ctx): number` — 0–100: Wärme 30, Farbe 30, Formalität 15, Saison 5, Frische 10, Vorlieben 10; zweites Muster −8.
  - `rankOutfits(wardrobe: Item[], ctx: Ctx, seed: number, limit=30): {items: Item[]; score: number}[]` — Kern = Oberteil+Unterteil oder Kleid; beste Schuhe; Jacke nur wenn `needsOuterwear`; höchstens 600 Kern-Kombis (mit Seed gezogen); Wunschliste ausgeschlossen; Ergebnis nach Punkten, aufeinanderfolgende Einträge unterscheiden sich im Kern.
  - `dailyOutfit(wardrobe, ctx, userId, date, reroll=0)` → Eintrag `reroll` aus `rankOutfits` (Seed aus `userId+date`) oder `null`.
- `purchase.ts`: `purchaseCheck(candidate: Item, wardrobe: Item[], ctx): { count: number; top: {items: Item[]; score: number}[]; colorFit: number /* 0–100 */ }`.
- `wear.ts`: `wearStats(items, outfits): Map<id,{count, last: string|null, costPerWear: number|null}>`, `neglected(items, outfits, today): Item[]` (≥ 90 Tage oder nie getragen und ≥ 30 Tage im Schrank), `recentIds(outfits, today, days=7)`.

### Task 4: Puppe (rein, mit Tests)

- `doll.ts`:
  - `clampMeasurements(m: Partial<Measurements>): Measurements` (Größe 140–210, Schultern 30–60, Brust 70–150, Taille 55–150, Hüfte 70–160, Innenbein 60–100; Standard 170/40/92/76/98/78).
  - `bodyGeometry(m): Geo` — ViewBox 400×800, Figur 720 px hoch; liefert `y` (headTop, chin, shoulder, bust, waist, hip, crotch, knee, ankle, floor), halbe Breiten (`shoulder, bust, waist, hip`), `headR`, `cx`, `path` (Silhouette), `arms`, `legs`.
  - `placement(item: Pick<Item,'category'|'length'|'accessory_type'|'aspect'>, geo): {x,y,w,h,z}` nach Spec-Ankerzonen.
- `DollFigure.tsx`: zeichnet Körper + Teile in z-Reihenfolge, wendet `adjust` an; im Bearbeiten-Modus Ziehen + Größen-Regler.

### Task 5: Edge Functions

- `register`: Body `{email, password, display_name}` → prüft Einladung bzw. erstes Konto → `auth.admin.createUser({email_confirm:true})`. Fehlercodes `not_invited`, `exists`, `weak_password`.
- `analyze`: prüft Login + `bump_usage(…, 40)`; Body `{image: base64-JPEG}`; Claude mit JSON-Schema (Zod) → `{items: DetectedItem[]}`. Fehlercodes siehe Review Focus 4.
- Beide deployen; ohne Schlüssel aufrufen und `no_key` bestätigen.

### Task 6: Daten-Schicht + Freistellen

- `api.ts`: Sitzung, Profil, Teile, Outfits, Einladungen, Upload (WebP), signierte Bild-URLs (7 Tage, in `localStorage` gemerkt).
- `images.ts`: Datei → Bitmap (EXIF-Drehung), Verkleinern, Zuschneiden, WebP/Vorschau.
- `cutout/worker.ts`: `segment(cropBitmap, category, worn) → Alpha-Maske`; getragen → `Xenova/segformer_b2_clothes` (Labels je Kategorie), sonst → `briaai/RMBG-1.4`; bei < 3 % Maskenfläche das jeweils andere Modell, sonst unverändert lassen.

### Task 7: Oberfläche

Login · Heute · Schrank (+ Detail-Blatt mit Kauf-Check) · Import (+ Prüf-Ansicht, Rahmen-Editor, Teil von Hand) · Puppe · Ich (Maße, Ort, Tagebuch, lange nicht getragen, Einladungen).

### Task 8: Prüfen + Ausliefern

- [ ] `npm test`, `npm run build`.
- [ ] Playwright-Durchlauf (Handy-Größe) gegen die echte Datenbank mit Testkonto und Attrappen-Analyse; echtes Freistellen an einem Beispielfoto.
- [ ] Deploy auf Vercel; Besitzer trägt `ANTHROPIC_API_KEY` ein; Testdaten wieder löschen.
