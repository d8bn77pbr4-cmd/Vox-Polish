import type { GarmentTemplate, PatternPiece, Seam, Silhouette, ParamDef, InternalLine } from '../pattern/types';
import type { Vec2 } from '../geometry/vec';
import { nd, P, join, piece, pd } from './helpers';
import { buildLast, type LastModel } from './sneakerLast';

const S = (id: string, name: string, description: string, params: Record<string, number>): Silhouette => ({ id, name, description, params });
const acc = (o: Omit<GarmentTemplate, 'family' | 'gradeKeys'> & Partial<Pick<GarmentTemplate, 'gradeKeys'>>): GarmentTemplate =>
  ({ family: 'accessory', gradeKeys: { x: 'head', y: 'head' }, ...o });

// ---------- beanie ----------
const BEANIE_P: ParamDef[] = [
  pd('easeHead', 'Mehrweite Kopf (Strick negativ)', -40, -100, 60, 'Weite'),
  pd('heightAdj', 'Höhe ±', 0, -60, 160, 'Länge'),
  pd('cuffHeight', 'Umschlag', 70, 0, 120, 'Details'),
];
function beanie(m: Parameters<GarmentTemplate['build']>[0], p: Record<string, number>) {
  const total = m.head + p.easeHead, gw = total / 6, gh = m.head * 0.36 + p.heightAdj;
  const pieces: PatternPiece[] = [];
  const seams: Seam[] = [];
  for (let k = 1; k <= 6; k++) {
    pieces.push(piece(`gore${k}`, `Keil ${k}`, [
      nd('TIP', 0, 0, P(-gw * 0.35, gh * 0.15), P(gw * 0.35, gh * 0.15)),
      nd('BR', gw / 2, gh, P(gw / 2, gh * 0.45)),
      nd('BL', -gw / 2, gh, null, P(-gw / 2, gh * 0.45)),
    ], { sa: 6, placement: { zone: 'head', mode: 'sphere', wrap: 1 / 6, angle: (k - 1) * 60 } }));
  }
  for (let k = 1; k <= 6; k++) seams.push(join(`gore${k}`, [`gore${k}`, undefined, 'TIP', 'BR'], [`gore${(k % 6) + 1}`, undefined, 'TIP', 'BL'], pieces));
  const R = m.head / (2 * Math.PI);
  if (p.cuffHeight > 0) {
    const ids = ['T0', 'TC1', 'TC2', 'TC3', 'TC4', 'TC5', 'T1'];
    const top = ids.map((id, i) => nd(id, -total / 2 + gw * i, 0));
    pieces.push(piece('cuff', 'Umschlag', [...top, nd('B1', total / 2, p.cuffHeight), nd('B0', -total / 2, p.cuffHeight)],
      { sa: 6, role: 'rib', placement: { zone: 'head', mode: 'cyl', wrap: 1, angle: 30, drop: R * (1 - Math.cos(Math.min(Math.PI, gh / R))), radiusAdd: 4 } }));
    for (let i = 0; i < 6; i++) {
      const g = ((i + 4) % 6) + 1;
      seams.push(join(`cuff${i}`, [`gore${g}`, undefined, 'BL', 'BR'], ['cuff', undefined, ids[i], ids[i + 1]], pieces));
    }
    seams.push(join('cuff_end', ['cuff', undefined, 'T1', 'B1'], ['cuff', undefined, 'T0', 'B0'], pieces));
  }
  return { pieces, seams, pom: [{ id: 'head', label: 'Kopfweite', value: total }, { id: 'height', label: 'Höhe', value: gh + p.cuffHeight * 0 }] };
}

// ---------- scarf ----------
const SCARF_P: ParamDef[] = [pd('width', 'Breite', 300, 120, 900, 'Maße', 10), pd('length', 'Länge', 1800, 800, 2600, 'Maße', 10)];
function scarf(_m: unknown, p: Record<string, number>) {
  const w = p.width, l = p.length;
  const pc = piece('scarf', 'Schal', [nd('TL', -w / 2, 0), nd('TR', w / 2, 0), nd('BR', w / 2, l), nd('BL', -w / 2, l)],
    { sa: 10, placement: { zone: 'scarf' }, internal: [{ id: 'hem1', kind: 'stitch', pts: [P(-w / 2 + 5, 15), P(w / 2 - 5, 15)] }, { id: 'hem2', kind: 'stitch', pts: [P(-w / 2 + 5, l - 15), P(w / 2 - 5, l - 15)] }] });
  return { pieces: [pc], seams: [], pom: [{ id: 'length', label: 'Länge', value: l }, { id: 'width', label: 'Breite', value: w }] };
}

// ---------- belt ----------
const BELT_P: ParamDef[] = [pd('width', 'Breite', 35, 15, 80, 'Maße', 1), pd('extra', 'Überlänge', 200, 80, 400, 'Maße'), pd('position', 'Sitz (0 Taille – 1 Hüfte)', 0.2, 0, 1, 'Sitz', 0.05, 'n')];
function belt(m: Parameters<GarmentTemplate['build']>[0], p: Record<string, number>) {
  const girth = m.waist + (m.hip - m.waist) * p.position, L = girth + p.extra, w = p.width;
  const holes: InternalLine[] = [];
  for (let i = 0; i < 5; i++) {
    const cx = L - 140 - i * 25, pts: Vec2[] = [];
    for (let a = 0; a < 12; a++) pts.push(P(cx + 2.5 * Math.cos((a / 12) * Math.PI * 2), w / 2 + 2.5 * Math.sin((a / 12) * Math.PI * 2)));
    holes.push({ id: `hole${i}`, kind: 'guide', pts, closed: true });
  }
  holes.push({ id: 'edge1', kind: 'stitch', pts: [P(8, 3), P(L - w * 0.6, 3)] }, { id: 'edge2', kind: 'stitch', pts: [P(8, w - 3), P(L - w * 0.6, w - 3)] });
  const strap = piece('strap', 'Riemen', [nd('B_START', 0, 0), nd('TIP_TOP', L - w * 0.6, 0), nd('TIP', L, w / 2), nd('TIP_BOT', L - w * 0.6, w), nd('B_END', 0, w)],
    { sa: 0, grain: 90, placement: { zone: 'waist' }, internal: holes });
  return { pieces: [strap], seams: [], pom: [{ id: 'length', label: 'Riemenlänge', value: L }, { id: 'width', label: 'Breite', value: w }, { id: 'girth', label: 'Mittleres Loch', value: girth + 50 }] };
}

// ---------- sneaker ----------
const SNEAKER_P: ParamDef[] = [
  pd('toeAllowance', 'Zugabe Zehen', 15, 5, 35, 'Leisten', 1), pd('widthAdj', 'Ballenweite ±', 0, -15, 25, 'Leisten', 1),
  pd('collarAdj', 'Schafthöhe ±', 0, -15, 40, 'Leisten', 1), pd('soleHeight', 'Sohlenhöhe', 28, 15, 60, 'Sohle', 1),
  pd('vampLine', 'Vorderblatt-Linie ±', 0, -0.08, 0.08, 'Schaft', 0.01, 'n'), pd('eyelets', 'Ösenpaare', 5, 3, 8, 'Schaft', 1, 'n'),
];
const poly = (pts: Vec2[], prefix = 'p') => pts.map((q, i) => nd(`${prefix}${i}`, q.x, q.y));
const line = (L: LastModel, s0: number, t0: number, s1: number, t1: number, n = 10) => {
  const out: Vec2[] = []; for (let i = 0; i <= n; i++) out.push(L.flat(s0 + ((s1 - s0) * i) / n, t0 + ((t1 - t0) * i) / n)); return out;
};
export function sneakerPanels(L: LastModel, p: Record<string, number>) {
  const sT = L.sT, sVb = 0.5 + (p.vampLine ?? 0), N = 30;
  const tLat = (s: number) => L.openT(s) ?? 0.5;
  const openLat: Vec2[] = [], openMed: Vec2[] = [];
  for (let i = 0; i <= N; i++) { const s = (sT * i) / N; openLat.push(L.flat(s, tLat(s))); openMed.push(L.flat(s, 1 - tLat(s))); }
  const bottomLat = (s0: number, s1: number) => line(L, s0, 1, s1, 1, 24), bottomMed = (s0: number, s1: number) => line(L, s0, 0, s1, 0, 24);
  const back = (tTop: number, tBot: number) => line(L, 0, tTop, 0, tBot, 8);
  const tA = tLat(sT);
  const quarterLat = [...openLat, ...line(L, sT, tA, sVb, 1).slice(1), ...bottomLat(sVb, 0).slice(1), ...back(1, tLat(0)).slice(1, -1)];
  const quarterMed = [...openMed, ...line(L, sT, 1 - tA, sVb, 0).slice(1), ...bottomMed(sVb, 0).slice(1), ...back(0, 1 - tLat(0)).slice(1, -1)];
  const ov = 0.03;
  const vamp = [
    ...line(L, sT - ov, tA, sT - ov, 1 - tA, 8),
    ...line(L, sT - ov, 1 - tA, sVb - ov, 0).slice(1),
    ...bottomMed(sVb - ov, 1).slice(1),
    ...line(L, 1, 0, 1, 1, 12).slice(1),
    ...bottomLat(1, sVb - ov).slice(1),
    ...line(L, sVb - ov, 1, sT - ov, tA).slice(1, -1),
  ];
  const hc = (s: number) => (s < 0.28 ? 48 - 30 * (s / 0.28) ** 1.6 : 8) * (L.FL / 250);
  const heel: Vec2[] = [];
  for (let i = 0; i <= 14; i++) { const s = (0.28 * i) / 14; heel.push(L.flat(s, L.tAtHeight(s, hc(s)))); }
  heel.push(L.flat(0.31, 1), ...bottomLat(0.31, 0).slice(1), ...back(1, L.tAtHeight(0, hc(0))).slice(1, -1));
  const sTop = L.sC - 0.07, gT = 30 * (L.FL / 250);
  const tAtVLat = (s: number, v: number) => { let lo = 0.5, hi = 1; for (let n = 0; n < 36; n++) { const mid = (lo + hi) / 2; if (L.flat(s, mid).y < v) lo = mid; else hi = mid; } return (lo + hi) / 2; };
  const tongueLat: Vec2[] = [], tongueMed: Vec2[] = [];
  const sF = sT + 0.03;
  for (let i = 0; i <= 20; i++) {
    const s = sTop + ((sF - sTop) * i) / 20;
    const round = i > 16 ? Math.sqrt(Math.max(0.05, 1 - ((i - 16) / 4.2) ** 2)) : 1;
    const t = tAtVLat(s, gT * round);
    tongueLat.push(L.flat(s, t)); tongueMed.push(L.flat(s, 1 - t));
  }
  const tongue = [...tongueLat, ...tongueMed.reverse()];
  return { vamp, quarterLat, quarterMed, heel, tongue };
}
function sneaker(m: Parameters<GarmentTemplate['build']>[0], p: Record<string, number>) {
  const L = buildLast(m, p);
  const pn = sneakerPanels(L, p);
  const opt = (pl: PatternPiece['placement']) => ({ cut: { count: 2 as const }, sa: 8, placement: pl });
  const z = { zone: 'none' as const };
  const pieces: PatternPiece[] = [
    piece('quarterLat', 'Seitenteil außen', poly(pn.quarterLat), { ...opt(z), saEdges: {} }),
    piece('quarterMed', 'Seitenteil innen', poly(pn.quarterMed), opt(z)),
    piece('vamp', 'Vorderblatt', poly(pn.vamp), opt(z)),
    piece('heel', 'Fersenkappe', poly(pn.heel), { ...opt(z), cut: { count: 2, fold: true } }),
    piece('tongue', 'Zunge', poly(pn.tongue), opt(z)),
    piece('sole', 'Sohle', poly(L.soleOutline.map((q) => ({ x: q.x, y: L.FL - q.y }))), { ...opt(z), sa: 0 }),
    piece('laces', 'Schnürsenkel', [nd('a', 0, 0), nd('b', 900, 0), nd('c', 900, 7), nd('d', 0, 7)], { ...opt(z), sa: 0, grain: 90 }),
  ];
  return { pieces, seams: [], pom: [
    { id: 'lastLength', label: 'Leistenlänge', value: L.FL }, { id: 'ball', label: 'Ballenweite', value: L.FW },
    { id: 'sole', label: 'Sohlenhöhe', value: L.soleH },
  ] };
}

export const ACCESSORY_TEMPLATES: GarmentTemplate[] = [
  acc({ id: 'beanie', category: 'beanie', name: 'Mütze', kind: 'cloth', params: BEANIE_P, defaultMaterial: 'rib', ribMaterial: 'rib', silhouettes: [
    S('beanie', 'Beanie', 'Sechs Keile mit Umschlag', {}),
    S('slouch', 'Slouch', 'Lässig lang, schmaler Bund', { heightAdj: 70, cuffHeight: 40 }),
  ], build: beanie }),
  acc({ id: 'scarf', category: 'scarf', name: 'Schal', kind: 'cloth', params: SCARF_P, defaultMaterial: 'flannel', silhouettes: [
    S('classic', 'Klassisch', '180 × 30 cm', {}), S('stole', 'Oversize-Stola', '200 × 70 cm', { width: 700, length: 2000 }),
  ], build: scarf, gradeKeys: { x: 'height', y: 'height' } }),
  acc({ id: 'belt', category: 'belt', name: 'Gürtel', kind: 'belt', params: BELT_P, defaultMaterial: 'nappa', silhouettes: [
    S('classic', 'Klassisch 3,5 cm', 'Dornschließe', {}), S('wide', 'Breit 5 cm', 'Breiter Riemen, tiefer Sitz', { width: 50, position: 0.6 }),
  ], build: belt, gradeKeys: { x: 'waist', y: 'waist' } }),
  acc({ id: 'sneaker', category: 'sneaker', name: 'Sneaker', kind: 'sneaker', params: SNEAKER_P, defaultMaterial: 'nappa', silhouettes: [
    S('court', 'Low-Top Court', 'Klassischer Court-Sneaker, Cupsole', {}),
  ], build: sneaker, gradeKeys: { x: 'footWidth', y: 'footLength' }, pieceMaterials: { sole: 'rubber', laces: 'canvas', tongue: 'nappa' } }),
];
