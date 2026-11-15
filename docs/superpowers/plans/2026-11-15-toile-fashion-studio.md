# TOILE Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A browser-only fashion design studio (pattern → material → 3D fitting) in `toile/`.

**Architecture:** Pure TypeScript core (`src/core/**`: geometry, sizing, parametric templates, cloth simulation, exports) with unit tests; React UI on top (`src/views`, `src/ui`) reading a Zustand store whose project document changes through Immer patches (undo/redo). 2D pattern in SVG, design surfaces in Canvas 2D, 3D in three.js via @react-three/fiber. Data in IndexedDB behind a `ProjectStore` interface.

**Tech Stack:** Vite 8, React 19, TypeScript 5 strict, Zustand, Immer, three 0.187, @react-three/fiber 9, @react-three/drei, delaunator, jspdf, idb-keyval, nanoid, lucide-react, @fontsource (Inter, Cormorant Garamond), Vitest.

**Spec:** `docs/superpowers/specs/2026-11-15-toile-fashion-studio-design.md`

## Global Constraints

- App lives in `toile/`; nothing outside `toile/` and `docs/` changes.
- Internal unit mm (2D) and m (3D, y up, avatar faces +z, wearer's left = +x). UI shows cm with one decimal, German copy.
- Piece-local 2D: x to the viewer's right looking at the fabric face from outside, y down. Origin of a surface frame = piece anchor (bbox center x, bbox min y).
- Count-2 pieces produce instances `L` (as drafted) and `R` (x mirrored); count-1 → `C`. Instance key `${pieceId}:${side}`.
- Uploads downscaled to ≤ 4096 px long side; surface textures ≤ 2048 px and ≤ 4 px/mm.
- History ≥ 100 steps; autosave 1.5 s after the last change.
- No real brand names or logos in silhouette names or presets.
- Dark studio UI, one champagne accent `#d8c3a0`, Inter + Cormorant Garamond wordmark.

## Review Focus

1. Extreme sizes (Damen 32, Herren 58, custom chest 140 cm) → patterns still valid (no self-intersection, no NaN), sim still settles.
2. Detached / custom pieces after size change → proportional grading, seams still resolve (missing node id → seam dropped with a warning, no crash).
3. Huge upload (8000×6000 JPEG, PNG with alpha) → downscaled, stays usable, alpha respected.
4. Reload during painting → last stroke persisted or cleanly absent; no corrupt raster.
5. Linked L/R with asymmetric print → R shows mirrored position, text not mirrored; unlinking copies L to R.

---

### Task 1: Scaffold

**Files:** Create `toile/package.json`, `toile/vite.config.ts`, `toile/tsconfig.json`, `toile/index.html`, `toile/src/main.tsx`, `toile/src/App.tsx`, `toile/src/ui/theme.css`, `toile/src/ui/TopBar.tsx`, `toile/tests/smoke.test.ts`, `toile/.gitignore`

**Interfaces:** Produces `App` with workspace tabs Mappe/Schnitt/Design/Anprobe (placeholders), CSS tokens `--bg #111113, --panel #18181b, --line #2a2a2e, --text #ece9e4, --muted #8b8790, --accent #d8c3a0`.

- [ ] Install exact current versions; scripts `dev`, `build` (`tsc -b && vite build`), `test` (`vitest run`).
- [ ] `smoke.test.ts`: `expect(1+1).toBe(2)`; run `npm test` → PASS; `npm run build` → exit 0.
- [ ] Commit.

### Task 2: Geometry core

**Files:** Create `src/core/geometry/{vec,bezier,path,offset,mesh}.ts`; Test `tests/geometry.test.ts`

**Interfaces (Produces):**
- `type Vec2 = {x:number;y:number}`; `add, sub, scale, dot, cross, len, dist, norm, perp(v)=(-y,x), lerp, rotate(v, rad)`.
- `interface PathNode {id:string;x:number;y:number;hin?:Vec2|null;hout?:Vec2|null;smooth?:boolean}` (handles absolute).
- `flattenPath(nodes, tol=0.3): {pts:Vec2[]; nodeIdx:number[]}` (closed, last ≠ first).
- `edgePolyline(nodes, fromId, toId): Vec2[]` forward in node order with wrap, both ends included.
- `polylineLength, resamplePolyline(pts, n), pointAtLength(pts, s), polygonArea (shoelace, signed), pointInPolygon, bbox → {minX,minY,maxX,maxY}, widthAtY(poly, y) → {minX,maxX}|null`.
- `offsetPolygon(poly, dist:number[] per segment i→i+1, miterLimit=3): Vec2[]` — always outward (uses sign of area).
- `meshPolygon(boundary:Vec2[], spacing:number): {pts:Vec2[]; tris:Uint32Array; boundaryCount:number}` — boundary points first and in order; interior hex grid ≥ 0.45·spacing from boundary; Delaunator; drop triangles with centroid outside.

- [ ] Tests: square 100 mm → length 400, area ±10000; cubic quarter-circle approximation length within 0.2 % of 2πr/4; `edgePolyline` wraps across node 0; `offsetPolygon(square,[10,10,10,10])` bbox grows by 10 each side for both windings; `meshPolygon` on 300×400 rect at 20 mm: every triangle centroid inside, `boundaryCount` equals boundary length, no degenerate (area < 1e-6) triangles; `widthAtY` on rect returns exact extents.
- [ ] Implement, run `npx vitest run tests/geometry.test.ts` → PASS. Commit.

### Task 3: Sizing

**Files:** Create `src/core/sizing/{measurements,charts,grading}.ts`; Test `tests/sizing.test.ts`

**Interfaces (Produces):**
- `type Profile = 'women'|'men'`; `interface Measurements { height, chest, waist, hip, neck, shoulder, backLength, armLength, bicep, wrist, inseam, rise, thigh, knee, head, footLength, footWidth }` (all mm). `MEASUREMENT_LABELS: Record<keyof Measurements,string>` (German).
- `type SizeSpec = {system:'womenEU'|'menEU'; label:string} | {system:'custom'; m:Measurements}`.
- `SIZE_SYSTEMS`: womenEU labels `32..48` step 2 (base 38: height 1680, chest 880, waist 720, hip 970, …), menEU `44..58` (base 50: height 1800, chest 1000, waist 880, hip 1020, …); INT mapping `intLabel(system,label)`.
- `measurementsFor(spec: SizeSpec): Measurements`; `defaultAvatar(profile): Measurements`.
- `proportionalScale(base: Measurements, now: Measurements, keys:{x:keyof Measurements;y:keyof Measurements}): {sx:number; sy:number}`.

- [ ] Tests: womenEU 38 chest = 880; each step up adds 40 mm chest up to 40, 50 mm from 42; menEU 50→52 adds 40 mm chest; all values finite and increasing with size; `proportionalScale` identity → {1,1}.
- [ ] Implement, test PASS, commit.

### Task 4: Pattern model + top family

**Files:** Create `src/core/pattern/{types,piece,checks}.ts`, `src/core/templates/{registry,helpers,tops}.ts`; Test `tests/tops.test.ts`

**Interfaces (Produces):**
- `types.ts`: `Zone = 'torsoFront'|'torsoBack'|'arm'|'legFront'|'legBack'|'head'|'neck'|'waist'|'hem'|'wrist'|'scarf'|'none'`; `Placement {zone; angle?:deg; wrap?:fraction of circumference; drop?:mm; radiusAdd?:mm}`; `InternalLine {id; kind:'stitch'|'yoke'|'pocket'|'pleat'|'guide'|'fold'; pts:Vec2[]; closed?}`; `Notch {id; at:nodeId; offset:mm; double?}`; `PatternPiece {id; name; nodes:PathNode[]; grain:deg; internal; notches; sa:mm; saEdges?:Record<fromNodeId,mm>; cut:{count:1|2; fold?:boolean}; placement; role?:'main'|'rib'|'contrast'|'trim'}`; `Side='C'|'L'|'R'`; `EdgeRef {piece; side?:'L'|'R'; from; to}`; `Seam {id; a; b; flip?; ease?:mm; kind?:'join'|'rib'|'gather'}`; `Pom {id; label; value}`; `TemplateOutput {pieces; seams; pom}`; `ParamDef {key; label; min; max; step; unit:'mm'|'deg'|'%'|'n'; group}`; `Silhouette {id; name; description; params:Record<string,number>}`; `GarmentTemplate {id; category; family:'top'|'bottom'|'accessory'; name; kind:'cloth'|'belt'|'sneaker'; silhouettes; params:ParamDef[]; defaultMaterial:string; ribMaterial?:string; gradeKeys:{x;y}; build(m:Measurements, p:Record<string,number>): TemplateOutput}`.
- `piece.ts`: `piecePolygon(piece): Vec2[]`, `edgeLength(piece, from, to)`, `saOutline(piece): Vec2[]`, `mirrorPiece(piece): PatternPiece` (x → −x, node order kept), `pieceAnchor(piece): Vec2`, `scalePiece(piece, sx, sy)`.
- `checks.ts`: `seamReport(pieces, seams): {seamId; la; lb; diff; expected; status:'ok'|'warn'|'bad'}[]` (tolerance ±2 mm around `ease`).
- `registry.ts`: `TEMPLATES: GarmentTemplate[]`, `getTemplate(id)`, `CATEGORIES` (German labels).
- `tops.ts`: one torso drafter `draftTop(m, p, opts)`; templates `tshirt` (Classic Regular, Slim, Boxy Cropped, Oversized Drop-Shoulder), `longsleeve` (Regular, Oversized), `sweatshirt` (Regular, Oversized Drop-Shoulder), `hoodie` (Regular, Oversized Drop-Shoulder, Cropped Boxy), `tank` (Regular, Muscle), `jacket` (Bomber, Boxy Jacket — front split L/R as count-2 piece), `dress` (Shift, A-Linie, T-Shirt-Kleid). Params at least: `easeChest, length, shoulderDrop, sleeveLength, sleeveWidthEase, hemFlare, neckWidth, neckDepth, waistShaping, cuffHeight, bandHeight, hoodDepth`. Node ids on the full front: `CF_NECK, NECK_R, SH_R, UA_R, HEM_R, CF_HEM, HEM_L, UA_L, SH_L, NECK_L`; back `CB_NECK …` same pattern. Sleeve derived from measured armhole length + ease (jersey 3 mm, woven 12 mm).
- POM ids: `chest, hem, length, shoulder, sleeve, neckWidth`.

- [ ] Tests (every top template × silhouette × sizes womenEU 32/38/48 and menEU 44/58): all coordinates finite; every seam's node ids exist; `pom.chest` = (chest + easeChest)/2 ±2 mm; front and back side seams equal ±1 mm; shoulder seams equal ±1 mm; sleeve cap − armhole within ease ±3 mm; underarm sleeve seams equal; no self-intersection of outlines (segment-intersection check helper in test).
- [ ] Implement, test PASS, commit.

### Task 5: Bottoms and skirts

**Files:** Create `src/core/templates/bottoms.ts`; Modify `registry.ts`; Test `tests/bottoms.test.ts`

**Interfaces:** Templates `trousers` (Straight Five-Pocket, Slim Tapered, Wide Leg (Marlene), Baggy, Bootcut/Flare, Tailored mit Bundfalte), `shorts` (Regular, Bermuda), `skirt` (Bleistift, A-Linie, Tellerrock, Schrägschnitt-Midi with `grain` 45). Trouser pieces: `front` & `back` count 2, `waistband` count 1. Node ids front: `CF_WAIST, SIDE_WAIST, SIDE_HIP, SIDE_KNEE, SIDE_HEM, IN_HEM, IN_KNEE, CROTCH, CF_HIP`; back `CB_WAIST …` analog. Params: `easeHip, easeWaist, rise (low/mid/high mm offset), kneeWidth, hemWidth, length, pleat, waistbandHeight`. Internal lines: yoke, pockets, stitch lines for jeans silhouettes. POM ids `waist, hip, inseam, outseam, frontRise, backRise, knee, legOpening`.

- [ ] Tests (each silhouette, sizes 32/38/48 women, 44/58 men): inseam front = back ±1 mm; outseam front = back ±1 mm; `pom.hip` = (hip + easeHip)/2 ±3 mm; waistband length = sum of waist edges ±2 mm; back crotch extension > front; skirt hem ≥ hip width for A-Linie/Teller; Tellerrock waist edge length = waist + ease ±3 mm.
- [ ] Implement, PASS, commit.

### Task 6: Accessories (beanie, scarf, belt, sneaker)

**Files:** Create `src/core/templates/accessories.ts`, `src/core/templates/sneakerLast.ts`; Modify `registry.ts`; Test `tests/accessories.test.ts`

**Interfaces:**
- `beanie` (Beanie, Slouch): 6 gores `gore` with `cut.count` 1 each (ids `gore1..gore6`, placement head angle k·60, wrap 1/6) + `cuff` (tube); seams gore↔gore and gores↔cuff. Knit negative ease param `easeHead` (default −40 mm).
- `scarf` (Klassisch 1800×300, Oversize-Stola 2000×700): one piece, placement zone `scarf`.
- `belt` kind `belt` (Klassisch 35 mm, Breit 50 mm): `strap` piece with pointed tip and 5 holes as internal `guide` circles; params `width, extra (length beyond waist, default 200 mm), position (0 waist, 1 hip)`.
- `sneaker` kind `sneaker` (Low-Top Court): `sneakerLast.ts` exports `buildLast(m, p): LastModel` with `surface(s,t): [x,y,z]` (s heel→toe 0..1, t medial sole edge 0 → top centre 0.5 → lateral 1), `flat(s,t): Vec2` (u = arc length along s on the top line, v = signed arc length from the top centre), `domain: Vec2[]` (outline of the flattened upper), `throat`/`collar` params. Pieces (all `cut.count` 2 → L/R per shoe): `vamp, quarterLat, quarterMed, tongue, heel, sole, laces`; panels are polygons in the flattened domain; `role` and z-order fixed (quarters < vamp < heel).
- [ ] Tests: beanie gores' bottom edges sum = head + easeHead ±2 mm; adjacent gore seams equal; belt strap length = waist + extra ±1 mm; every sneaker panel vertex lies inside `domain` (±1 mm); `flat(surface)` round-trip distances: arc between neighbouring grid points ≈ flat distance within 8 %.
- [ ] Implement, PASS, commit.

### Task 7: Project model and garment resolution

**Files:** Create `src/core/model.ts`, `src/core/resolve.ts`; Test `tests/resolve.test.ts`

**Interfaces (Produces):**
- `model.ts`: `BlendMode`; `Adjust {hue;sat;bright;contrast}`; `RasterFrame {x0;y0;pxPerMm;w;h}`; `PatternSpec {type:'stripes'|'pinstripe'|'gingham'|'glencheck'|'houndstooth'|'dots'|'herringbone'|'camo'|'motif'; colors:string[]; scale:mm; angle:deg; motifAssetId?; repeat?:'full'|'half-drop'|'brick'|'mirror'}`; `Layer` union with kinds `base{materialId} | fill{color} | pattern{pattern} | image{assetId,x,y,w,rot,adjust} | paint{assetId|null, frame} | text{text,font,size,color,x,y,rot,tracking}` plus common `{id,name,visible,locked,opacity,blend}`; `Surface {layers}`; `Weave = 'jersey'|'twill'|'plain'|'rib'|'satin'|'leather'|'velvet'|'canvas'|'knit'`; `Material {id;name;color;textureAssetId?;repeat;weave;roughness;sheen;gsm;stretch:{warp;weft;bias};bend;composition}`; `TrimType = 'button4'|'button2'|'shank'|'snap'|'rivet'|'eyelet'|'zipper'|'drawcord'|'label'|'patch'`; `Finish = 'gold'|'silver'|'gunmetal'|'horn'|'pearl'|'plastic'|'wood'|'fabric'`; `Trim {id;type;key:instanceKey;x;y;size;color;finish;rot;length?;text?;assetId?}`; `Garment {id;name;templateId;silhouetteId;params;size:SizeSpec;layer;visible;overrides:Record<string,PatternPiece>;custom:PatternPiece[];customSeams:Seam[];baseMeasurements?:Measurements;surfaces:Record<string,Surface>;linkSides:boolean;layout:Record<string,Vec2>;trims:Trim[]}`; `Project {id;name;version:1;profile;avatar:Measurements;garments;materials;palette:string[];createdAt;updatedAt;lastExportAt?}`.
- `newProject(name, profile): Project`; `newGarment(templateId, silhouetteId, project): Garment` (default surfaces: one `base` layer with the template's default material, rib pieces get `ribMaterial`).
- `resolve.ts`: `interface Instance {key;pieceId;side:Side;mirrored:boolean;piece:PatternPiece /* already mirrored for R */}`; `interface Resolved {pieces;seams;pom;instances;m:Measurements;warnings:string[]}`; `resolveGarment(g): Resolved` (memoised by JSON of inputs) — template output, overrides scaled by `proportionalScale`, custom pieces, `customSeams` appended, seams whose node ids are missing dropped with a warning; `surfaceFor(g, key): Surface` (when `linkSides` and side R → L's layers, positions mirrored at render time).
- [ ] Tests: new hoodie has instances `sleeve:L`, `sleeve:R`, `front:C`; detaching `front` then changing size from 38 to 44 scales width by chest ratio; a custom seam to a deleted node yields a warning, not a throw; `linkSides` true returns L's surface for R key.
- [ ] Implement, PASS, commit.

### Task 8: State, history, persistence, project file

**Files:** Create `src/state/{store,history,persistence,projectFile}.ts`; Test `tests/state.test.ts`

**Interfaces (Produces):**
- `history.ts`: `type HistoryEntry = {kind:'patch';label;patches;inverse;key?;time} | {kind:'raster';label;layerId;rect:{x;y;w;h};before:ImageData;after:ImageData}`; `createHistory(limit=150)` → `{push(e), undo(): HistoryEntry|null, redo(), canUndo(), canRedo(), clear()}`; patch entries with the same `key` within 600 ms coalesce.
- `store.ts` (Zustand): state `project: Project|null`, `ui: UiState` (`workspace:'mappe'|'schnitt'|'design'|'anprobe'; split; tool; garmentId; instanceKey; layerId; selection:{pieceId?;nodeIds:string[]}; brush:BrushSettings; color; simQuality:'draft'|'standard'|'fine'; fitMap; light:'studio'|'day'|'runway'; dirty:boolean`); actions `openProject(p)`, `closeProject()`, `update(label, recipe:(d:Project)=>void, key?)`, `undo()`, `redo()`, `setUi(partial)`, `pushRaster(entry)`.
- `persistence.ts`: `interface ProjectStore {list(): Promise<ProjectMeta[]>; load(id); save(p, thumb?:Blob); remove(id); putAsset(id, blob); getAsset(id)}`; `idbStore` (idb-keyval stores `toile-projects`, `toile-assets`, `toile-meta`); `memoryStore` for tests; `startAutosave(store, ps, delay=1500)`.
- `projectFile.ts`: `exportProjectFile(p, ps): Promise<Blob>` (JSON `{format:'toile',version:1,project,assets:{id:base64}}`), `importProjectFile(blob, ps): Promise<Project>` (new id, assets re-stored).
- [ ] Tests: update → undo restores previous JSON exactly; redo re-applies; coalescing two slider updates within 600 ms → one undo step; limit 150 drops oldest; memoryStore save/load round-trip; project file export → import round-trip equal except id.
- [ ] Implement, PASS, commit.

### Task 9: Textile library

**Files:** Create `src/core/textile/{materials,patterns,weave}.ts`; Test `tests/textile.test.ts`

**Interfaces:**
- `MATERIAL_PRESETS: Material[]` ids `jersey180, frenchterry320, rib, denim14, flannel, gabardine, linen, satin, crepe, velvet, nappa, canvas` with German names, gsm, composition, stretch/bend.
- `drawPatternTile(ctx, spec, pxPerMm, motif?: CanvasImageSource): {w:number;h:number}` draws one repeat tile; `repeatOffset(repeat, col, row, tileW, tileH): Vec2` for full/half-drop/brick/mirror.
- `weaveNormalCanvas(weave, size=256): HTMLCanvasElement` (procedural height → normal).
- `BASE_COLORS: {name;hex}[]` (20 Atelier-Grundfarben, spec §8.5), `SEASON_PALETTES`, `PATTERN_PRESETS: {name;spec}[]`, `LAYER_PRESETS` (Brustdruck mittig, Rückendruck groß, Ärmelstreifen, Saumbordüre), `TRIM_CATALOG: {type;name;sizes:number[];finishes:Finish[]}[]`, `ligneToMm(l)=l*0.635`.
- [ ] Tests (pure): `ligneToMm(24)` = 15.24; 20 base colours with valid hex; `repeatOffset('half-drop',1,0,w,h)` = {x:w,y:h/2}; brick offsets row by w/2; all presets have 0 ≤ stretch ≤ 1 and gsm > 0; unique ids.
- [ ] Implement, PASS, commit.

### Task 10: Surface compositor, assets, brush engine

**Files:** Create `src/render2d/{frame,assets,raster,compositor,brush}.ts`; Test `tests/render2d.test.ts`

**Interfaces:**
- `frame.ts`: `surfaceFrame(piece, maxPx=2048, maxPxPerMm=4): RasterFrame` (frame in surface coords = piece coords minus anchor, 10 mm margin); `toUV(frame, x, y): [u,v]` (v flipped for CanvasTexture flipY).
- `assets.ts`: `putImageFile(file, ps): Promise<string>` (downscale ≤ 4096), `getBitmap(id): ImageBitmap|undefined` (+ `loadBitmap`), `assetVersion` signal for re-render.
- `raster.ts`: `getRaster(layerId, frame): HTMLCanvasElement` cache, `dirtyRasters: Set<string>`, `flushRasters(ps, project)` saves PNG blobs into `paint.assetId`.
- `compositor.ts`: `renderSurface(canvas, {instance, frame, layers, materials, mirrorPlacement, showStitches})` → clips to outline, draws each visible layer with opacity/blend; base layer tiles material color/texture rotated by grain; internal `stitch` lines as dashed strokes.
- `brush.ts`: `BRUSHES` (`fineliner, ink, marker, airbrush, chalk, eraser`), `class Stroke { constructor(ctx, settings, color); add(p:{x;y;pressure}); end(): {x;y;w;h} }` with spacing = max(1, size·spacing) and streamline smoothing.
- [ ] Tests: `surfaceFrame` of 600×700 piece → w ≤ 2048, pxPerMm ≤ 4; `toUV` maps frame corners to 0/1; Stroke dab count for a 100 px straight line at size 10, spacing 0.25 → 40 ±1 (dab counter injectable).
- [ ] Implement, PASS, commit.

### Task 11: Shell, Mappe, Schnitt workspace

**Files:** Create `src/views/{ProjectsView,PatternView}.tsx`, `src/ui/{Toolbar,Panel,PiecesPanel,ParamsPanel,SizePanel,ChecksPanel,PropertiesPanel,GarmentLibrary,Icons}.tsx`, `src/ui/shortcuts.ts`; Modify `App.tsx`

**Interfaces:** consumes store, `resolveGarment`, `seamReport`, `saOutline`. PatternView: SVG viewBox in mm, wheel/pinch zoom, space/hand pan, 1 cm grid, piece drag (layout), tools V/A/+/−/C/P/M/N/S/H; "Vom Grundschnitt lösen" writes `overrides[pieceId]` and `baseMeasurements`; pen tool creates a custom piece and asks for its body zone; sew tool picks two edges → `customSeams`; grading toggle overlays all sizes. GarmentLibrary dialog shows each silhouette with a miniature of its pattern.
- [ ] Verify: `npm run build` exit 0; Playwright script (scratchpad) creates a project, adds a hoodie, switches size 38→44, drags a node, undoes it; screenshot shows pieces, seam lengths panel with values.
- [ ] Commit.

### Task 12: Design workspace

**Files:** Create `src/views/DesignView.tsx`, `src/ui/{LayersPanel,MaterialPanel,ColorPicker,BrushPanel}.tsx`

**Interfaces:** consumes `renderSurface`, `Stroke`, `putImageFile`, `pushRaster`. Adds `src/ui/GalleryPanel.tsx` + `src/state/library.ts` (`listLibrary(), addToLibrary(blob,name), removeFromLibrary(id)`, global across projects; import via `<input type=file accept=image/* multiple>`, drag & drop, clipboard paste, URL with CORS fallback hint; actions Als Stoff / Als Druck / Als Motiv, drag onto surface) and `src/ui/TrimsPanel.tsx` (place trims by tap, edit size/finish/colour). Base colours, pattern and layer presets in the respective panels. Tools V (move/scale/rotate image, text layers with handles), B, E, I, G, T; Procreate sliders (size/opacity) left, colour disc top right; two-finger tap undo, three-finger tap redo; "Auf alle gleichen Teile" / "Auf ganzes Kleidungsstück" for base material; L/R link toggle with "Von links übernehmen".
- [ ] Verify: Playwright uploads a generated PNG as material and as print, paints a stroke, toggles blend mode; screenshot correct; reload page → stroke persists.
- [ ] Commit.

### Task 13: Cloth simulation core

**Files:** Create `src/core/sim/{body,placement,cloth,build}.ts`; Test `tests/sim.test.ts`

**Interfaces (Produces):**
- `body.ts`: `interface Body {rings:{y;cx;cz;rx;rz}[]; caps:{a:V3;b:V3;ra:number;rb:number;name:string}[]; head:{c:V3;r:number}; zones: Record<string, ZoneFrame>; floorY:0}`; `type V3=[number,number,number]`; `ZoneFrame {A:V3; d:V3; f:V3; kind:'cyl'|'sphere'; R?:number}` with keys `torsoFront, torsoBack, armL, armR, legFrontL, legFrontR, legBackL, legBackR, head, neck, waist, hem, wristL, wristR, scarf`; `buildBody(m, profile): Body` (A-pose arms 45°); `bodyDistance(body, x,y,z, n:Float32Array): number` (torso implicit via numeric gradient, capsules, head sphere).
- `placement.ts`: `placeInstance(pts:Vec2[], inst:Instance, body, gap:number): Float32Array` — θ = (x−xc(y))/w(y)·2π·wrap (+angle, negated for R), r = w(y)/(2π·wrap)+gap (cyl) or sphere latitude for `head`; `s = f × d`; zone `scarf` custom (middle third ring around neck, ends hang in front).
- `cloth.ts`: `interface ClothSetup {pos;invMass;stretch:{i;j;rest;comp};bend:{i;j;rest;comp};seams:{i;j;d0};gap:Float32Array}`; `class Cloth {constructor(setup, body); step(frameDt); time; settled; pos; strain(): Float32Array; maxSeamGap(): number}` — XPBD small steps (10 substeps), sewing phase 1.2 s (seam rest d0·(1−t/1.2), gravity 0.2 g), then full gravity, damping, collision thickness 3 mm + gap, friction; `settled` when mean speed < 3 mm/s for 0.5 s after 2 s, hard stop 12 s.
- `build.ts`: `QUALITY = {draft:25, standard:18, fine:12}` mm spacing; `buildLook(project, resolvedById, body, quality): {setup; parts: SimPart[]}`; `SimPart {garmentId; key; start; count; tris:Uint32Array; uv:Float32Array; local:Vec2[]}`; anisotropic compliance from grain angle (warp/weft/bias of material); garment `layer` → gap 6 mm per layer; seam pairing by normalised arc length both directions.
- [ ] Tests (node, fixed 1/60 steps): tee on womenEU 38 avatar: settles ≤ 12 s, `maxSeamGap` < 3 mm, no NaN, all particles above floor and within 0.25 m of body surface; same for trousers and beanie; strain array length = particle count.
- [ ] Implement, PASS, commit.

### Task 14: Anprobe workspace

**Files:** Create `src/views/FitView.tsx`, `src/three/{Avatar,GarmentMeshes,Belt,Sneaker,FitMap,Lights}.tsx`, `src/core/structured/{belt,sneaker}.ts`

**Interfaces:** consumes `buildBody`, `buildLook`, `Cloth`, `renderSurface` (CanvasTexture per instance), `buildLast`. `beltGeometry(body, params, gap)`, `sneakerMeshes(m, params, side)` (upper uv = flattened domain, sole, tongue, laces tube). Features: orbit, views vorne/hinten/seitlich, Drehteller, light presets, fit map (strain colours blue→green→red at 8 %) with legend, progress bar, quality select, screenshot PNG (2×), paint-on-3D (raycast uv → active instance raster via `Stroke`), drop gallery image onto 3D → image layer at hit uv, trims as meshes bound by barycentric coords to the simulated surface (`src/three/Trims.tsx`), split view live updates.
- [ ] Verify: Playwright opens a look with hoodie + trousers + beanie + belt + sneakers, waits for settle, screenshots front/back; fit map screenshot; paints on 3D and sees stroke in Design view.
- [ ] Commit.

### Task 15: Exports

**Files:** Create `src/core/export/{svg,dxf,pdf,techpack}.ts`, `src/ui/ExportDialog.tsx`; Test `tests/export.test.ts`

**Interfaces:** `patternSVG(resolvedList, opts:{sizes;seamAllowance:boolean}): string` (`width="…mm"`, viewBox in mm, 100 mm control square); `patternDXF(...)`: string (R12, `$INSUNITS` 4, layers `CUT, SEW, GRAIN, NOTCH, TEXT`); `patternPDF(..., {paper:'A4'|'A3'|'plotter'}): Blob` tiled with 10 mm overlap, tile labels A1…, control square on first page; `techPackPDF(project, garmentId, renders:{front;back}): Blob` (cover, pieces overview, POM table for all sizes, materials, palette, prints, trims list (BOM), seam check).
- [ ] Tests: SVG control square path spans exactly 100 mm; DXF contains one closed POLYLINE per piece instance with coordinates in mm; A4 tiling of a 1200×800 mm layout yields expected page count; tech pack POM table rows = POM count.
- [ ] Implement, PASS, commit.

### Task 16: Polish and delivery

**Files:** Modify views/ui; Create `public/manifest.webmanifest`, `public/icon.svg`, `toile/README.md`

- [ ] Backup reminder (7 days since `lastExportAt`), keyboard shortcut overlay (`?`), touch gestures, PWA manifest, empty states, German copy pass.
- [ ] Full Playwright walkthrough of spec §14 list; fix findings; `npm test` and `npm run build` green.
- [ ] README (German): start, features, limits. Commit and push.
