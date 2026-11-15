import type { Measurements } from '../sizing/measurements';
import type { GarmentTemplate, PatternPiece, Seam, Pom, TemplateOutput, ParamDef, Silhouette } from '../pattern/types';
import { edgeLength } from '../pattern/piece';
import { flattenCubic } from '../geometry/bezier';
import { polylineLength } from '../geometry/path';
import type { Vec2 } from '../geometry/vec';
import { nd, P, mir, join, piece, pd, solveLen } from './helpers';

type Params = Record<string, number>;
export interface TopOpts { sleeve: 'none' | 'short' | 'long'; hood?: boolean; split?: boolean; woven?: boolean; rib?: boolean; pocket?: boolean }

const cubicLen = (a: Vec2, b: Vec2, c: Vec2, d: Vec2) => polylineLength([a, ...flattenCubic(a, b, c, d, 0.1)]);

export function draftTop(m: Measurements, p: Params, o: TopOpts): TemplateOutput {
  const ease = p.easeChest, drop = p.shoulderDrop;
  const C = m.chest + ease, Q = C / 4;
  const nw = m.neck / 6 + 10 + p.neckWidth;
  const fnd = Math.max(15, m.neck / 6 + 25 + p.neckDepth), bnd = 20;
  const hs = m.shoulder / 2 + 5;
  const tipX = Math.max(nw + 25, hs + drop);
  const ang = Math.atan2(45, hs - nw) * (1 - (Math.min(150, Math.max(0, drop)) / 150) * 0.45);
  const tipY = (tipX - nw) * Math.tan(ang);
  const ahd = Math.max(tipY + 90, m.chest / 10 + 125 + ease / 8 + Math.max(0, drop) * 0.5 + p.armholeAdj);
  const L = Math.max(ahd + 60, m.backLength + 240 + p.lengthAdj);
  const waistY = m.backLength + 15, hipY = waistY + 0.12 * m.height;
  let hemW = Q + p.hemFlare;
  if (L > hipY + 20) {
    const H4 = (m.hip + 40) / 4, t = (hipY - ahd) / (L - ahd);
    if (Q + (hemW - Q) * t < H4) hemW = Q + (H4 - Q) / t;
  }
  hemW = Math.max(hemW, 0.8 * Q);
  const ws = L > waistY + 30 ? p.waistShaping : 0;
  const side1 = ws > 0 ? P(Q - ws * 1.2, ahd + (waistY - ahd) * 0.75) : null;
  const side2 = ws > 0 ? P(hemW - ws * 0.7, waistY + (L - waistY) * 0.3) : null;
  const h = ahd - tipY;
  const fc1 = P(tipX - 0.08 * h, tipY + 0.5 * h), fc2 = P(Q - Math.max(20, 0.5 * (Q - fc1.x)), ahd);
  const bc1 = P(tipX - 0.04 * h, tipY + 0.5 * h), bc2 = P(Q - Math.max(16, 0.4 * (Q - bc1.x)), ahd);
  const pieces: PatternPiece[] = [];
  const seams: Seam[] = [];
  const hemSA = o.rib && p.bandHeight > 0 ? 10 : 25;
  const hemStitch = (w: number, y: number) => (hemSA > 10 ? [{ id: 'hemstitch', kind: 'stitch' as const, pts: [P(-w + 4, y - 20), P(w - 4, y - 20)] }] : []);

  // ---- body pieces ----
  if (o.split) {
    pieces.push(piece('front', 'Vorderteil', [
      nd('CF_NECK', 0, fnd, null, P(nw * 0.55, fnd)),
      nd('NECK', nw, 0, P(nw - 3, fnd * 0.5)),
      nd('SH', tipX, tipY, null, fc1),
      nd('UA', Q, ahd, fc2, side1),
      nd('HEM', hemW, L, side2),
      nd('CF_HEM', 0, L),
    ], { cut: { count: 2 }, placement: { zone: 'torsoFront', wrap: 0.25, angle: 45 }, saEdges: { HEM: hemSA, CF_NECK: 7 },
      internal: hemStitch(hemW, L).map((l) => ({ ...l, pts: [P(4, L - 20), P(hemW - 4, L - 20)] })) }));
  } else {
    const pocket = o.pocket ? [{ id: 'pocket', kind: 'pocket' as const, closed: true, pts: [
      P(-Q * 0.5, L - 290), P(Q * 0.5, L - 290), P(Q * 0.72, L - 140), P(Q * 0.72, L - 20 - (p.bandHeight > 0 ? 0 : 20)), P(-Q * 0.72, L - 20 - (p.bandHeight > 0 ? 0 : 20)), P(-Q * 0.72, L - 140),
    ] }] : [];
    pieces.push(piece('front', 'Vorderteil', [
      nd('CF_NECK', 0, fnd, P(-nw * 0.55, fnd), P(nw * 0.55, fnd)),
      nd('NECK_L', nw, 0, P(nw - 3, fnd * 0.5)),
      nd('SH_L', tipX, tipY, null, fc1),
      nd('UA_L', Q, ahd, fc2, side1),
      nd('HEM_L', hemW, L, side2),
      nd('CF_HEM', 0, L),
      nd('HEM_R', -hemW, L, null, side2 && mir(side2)),
      nd('UA_R', -Q, ahd, side1 && mir(side1), mir(fc2)),
      nd('SH_R', -tipX, tipY, mir(fc1)),
      nd('NECK_R', -nw, 0, null, P(-nw + 3, fnd * 0.5)),
    ], { placement: { zone: 'torsoFront', wrap: 0.5 }, saEdges: { HEM_L: hemSA, CF_HEM: hemSA, CF_NECK: 7, NECK_R: 7 }, internal: [...hemStitch(hemW, L), ...pocket] }));
  }
  pieces.push(piece('back', 'Rückenteil', [
    nd('CB_NECK', 0, bnd, P(-nw * 0.6, bnd), P(nw * 0.6, bnd)),
    nd('NECK_R', nw, 0, P(nw - 2, bnd * 0.5)),
    nd('SH_R', tipX, tipY, null, bc1),
    nd('UA_R', Q, ahd, bc2, side1),
    nd('HEM_R', hemW, L, side2),
    nd('CB_HEM', 0, L),
    nd('HEM_L', -hemW, L, null, side2 && mir(side2)),
    nd('UA_L', -Q, ahd, side1 && mir(side1), mir(bc2)),
    nd('SH_L', -tipX, tipY, mir(bc1)),
    nd('NECK_L', -nw, 0, null, P(-nw + 2, bnd * 0.5)),
  ], { placement: { zone: 'torsoBack', wrap: 0.5 }, saEdges: { HEM_R: hemSA, CB_HEM: hemSA, CB_NECK: 7, NECK_L: 7 }, internal: hemStitch(hemW, L) }));

  const F = o.split ? (s: 'L' | 'R', n: string) => ['front', s, n] as const : (s: 'L' | 'R', n: string) => ['front', undefined, `${n}_${s}`] as const;
  const fe = (s: 'L' | 'R', a: string, b: string): [string, 'L' | 'R' | undefined, string, string] => {
    const A = F(s, a), B = F(s, b); return [A[0], A[1], A[2], B[2]];
  };
  const be = (s: 'L' | 'R', a: string, b: string): [string, undefined, string, string] => ['back', undefined, `${a}_${s}`, `${b}_${s}`];
  for (const s of ['L', 'R'] as const) {
    seams.push(join(`shoulder_${s}`, fe(s, 'NECK', 'SH'), be(s, 'NECK', 'SH'), pieces));
    seams.push(join(`side_${s}`, fe(s, 'UA', 'HEM'), be(s, 'UA', 'HEM'), pieces));
  }
  if (o.split) seams.push(join('cf', ['front', 'L', 'CF_NECK', 'CF_HEM'], ['front', 'R', 'CF_NECK', 'CF_HEM'], pieces));

  const front = pieces[0], back = pieces[1];
  const AF = o.split ? edgeLength(front, 'SH', 'UA') : edgeLength(front, 'SH_L', 'UA_L');
  const AB = edgeLength(back, 'UA_L', 'SH_L');
  const pom: Pom[] = [
    { id: 'chest', label: 'Brustweite (halb)', value: 2 * Q },
    { id: 'hem', label: 'Saumweite (halb)', value: 2 * hemW },
    { id: 'length', label: 'Länge ab HPS', value: L },
    { id: 'shoulder', label: 'Schulterbreite', value: 2 * tipX },
    { id: 'neckWidth', label: 'Halsausschnitt Breite', value: 2 * nw },
    { id: 'neckDepth', label: 'Halsausschnitt Tiefe vorne', value: fnd },
  ];

  // ---- sleeves ----
  const sleeveDrop = Math.max(0, drop) * 0.9;
  if (o.sleeve !== 'none') {
    const capEase = o.woven ? 12 : 3;
    const tf = AF + capEase * 0.45, tb = AB + capEase * 0.55;
    const wantHalf = (m.bicep + p.sleeveEase) / 2;
    let ch = Math.sqrt(Math.max(((tf + tb) / 2) ** 2 * 0.9 - wantHalf ** 2, (0.22 * h) ** 2));
    ch = Math.min(Math.max(ch, 0.22 * h), 0.85 * h);
    const lenB = (bb: number) => cubicLen(P(0, 0), P(bb * 0.5, 0), P(bb * 0.75, ch), P(bb, ch));
    const lenF = (bf: number) => cubicLen(P(-bf, ch), P(-bf * 0.72, ch), P(-bf * 0.5, 0), P(0, 0));
    const bb = solveLen(lenB, tb, wantHalf), bf = solveLen(lenF, tf, wantHalf);
    const cuffH = o.sleeve === 'long' ? p.cuffHeight : 0;
    let sl = o.sleeve === 'short' ? 0.33 * m.armLength + p.sleeveAdj : m.armLength + 30 - sleeveDrop - cuffH + p.sleeveAdj;
    sl = Math.max(ch + 40, sl);
    const cuffLen = Math.max(m.wrist + 30, 150);
    let hw: number;
    if (o.sleeve === 'short') hw = ((bf + bb) / 2) * 0.9;
    else if (cuffH > 0) hw = Math.min((bf + bb) / 2, cuffLen / 0.8 / 2);
    else hw = Math.min((bf + bb) / 2, (m.wrist + 90 + p.sleeveEase * 0.25) / 2);
    const sleeveSA = cuffH > 0 ? 10 : 25;
    pieces.push(piece('sleeve', 'Ärmel', [
      nd('CAP_TOP', 0, 0, P(-bf * 0.5, 0), P(bb * 0.5, 0)),
      nd('CAP_B', bb, ch, P(bb * 0.75, ch)),
      nd('HEM_B', hw + (bb - bf) / 2, sl),
      nd('HEM_F', -hw + (bb - bf) / 2, sl),
      nd('CAP_F', -bf, ch, null, P(-bf * 0.72, ch)),
    ], { cut: { count: 2 }, placement: { zone: 'arm', wrap: 1, drop: sleeveDrop }, saEdges: { HEM_B: sleeveSA },
      internal: sleeveSA > 10 ? [{ id: 'hemstitch', kind: 'stitch', pts: [P(-hw + 4, sl - 20), P(hw - 4, sl - 20)] }] : [],
      notches: [{ id: 'nf', at: 'CAP_F', offset: lenF(bf) * 0.4 }, { id: 'nb', at: 'CAP_TOP', offset: lenB(bb) * 0.6, double: true }] }));
    for (const s of ['L', 'R'] as const) {
      seams.push(join(`armholeF_${s}`, fe(s, 'SH', 'UA'), ['sleeve', s, 'CAP_TOP', 'CAP_F'], pieces, { ease: tf - AF }));
      seams.push(join(`armholeB_${s}`, be(s, 'SH', 'UA'), ['sleeve', s, 'CAP_TOP', 'CAP_B'], pieces, { ease: tb - AB }));
      seams.push(join(`underarm_${s}`, ['sleeve', s, 'CAP_B', 'HEM_B'], ['sleeve', s, 'CAP_F', 'HEM_F'], pieces));
    }
    pom.push({ id: 'sleeve', label: 'Ärmellänge', value: sl + cuffH }, { id: 'bicep', label: 'Oberarmweite (halb)', value: bf + bb }, { id: 'capHeight', label: 'Kugelhöhe', value: ch });
    if (cuffH > 0) {
      const cl = cuffLen;
      pieces.push(piece('cuff', 'Ärmelbündchen', [nd('T0', -cl / 2, 0), nd('T1', cl / 2, 0), nd('B1', cl / 2, cuffH), nd('B0', -cl / 2, cuffH)],
        { cut: { count: 2 }, role: 'rib', sa: 7, placement: { zone: 'arm', wrap: 1, drop: sleeveDrop + sl } }));
      for (const s of ['L', 'R'] as const) {
        seams.push(join(`cuff_${s}`, ['sleeve', s, 'HEM_B', 'HEM_F'], ['cuff', s, 'T1', 'T0'], pieces, { kind: 'rib' }));
        seams.push(join(`cuffend_${s}`, ['cuff', s, 'T1', 'B1'], ['cuff', s, 'T0', 'B0'], pieces));
      }
    }
  }

  // ---- neck finish ----
  const fHalf = o.split ? edgeLength(front, 'CF_NECK', 'NECK') : edgeLength(front, 'CF_NECK', 'NECK_L');
  const bHalf = edgeLength(back, 'NECK_L', 'CB_NECK');
  if (o.hood) {
    const hh = m.head * 0.62 + 40 + p.hoodAdj, hw2 = (m.head * 0.42 + 30) / 2;
    const sx = -hw2 + fHalf, cbx = sx + bHalf * 0.98;
    pieces.push(piece('hood', 'Kapuze', [
      nd('TOP_F', -hw2, 30, null, P(-hw2 + hw2 * 0.6, -10)),
      nd('TOP_B', hw2 - 10, 70, P(hw2 - 70, 5), P(hw2 + 20, 170)),
      nd('H_CB', cbx, hh - 25, P(cbx + 30, hh - 140)),
      nd('H_SH', sx, hh - 6),
      nd('H_CF', -hw2, hh),
    ], { cut: { count: 2 }, placement: { zone: 'head', mode: 'cyl', angle: 90, wrap: 0.5, radiusAdd: 35 }, saEdges: { H_CF: 25 } }));
    seams.push(join('hood_cb', ['hood', 'L', 'TOP_F', 'H_CB'], ['hood', 'R', 'TOP_F', 'H_CB'], pieces));
    for (const s of ['L', 'R'] as const) {
      seams.push(join(`hoodneckF_${s}`, o.split ? ['front', s, 'CF_NECK', 'NECK'] : ['front', undefined, 'CF_NECK', `NECK_${s}`], ['hood', s, 'H_CF', 'H_SH'], pieces, { kind: 'gather' }));
      seams.push(join(`hoodneckB_${s}`, ['back', undefined, `NECK_${s}`, 'CB_NECK'], ['hood', s, 'H_SH', 'H_CB'], pieces, { kind: 'gather' }));
    }
  } else if (p.neckbandHeight > 0) {
    const r = o.rib || !o.woven ? 0.86 : 1;
    const bl = 2 * (fHalf + bHalf) * r, H = p.neckbandHeight;
    const xSL = bl / 2 - bHalf * r, xSR = -bl / 2 + bHalf * r;
    pieces.push(piece('neckband', 'Halsbündchen', [
      nd('T_START', -bl / 2, 0), nd('T_END', bl / 2, 0), nd('B_END', bl / 2, H), nd('B_SL', xSL, H), nd('B_CF', 0, H), nd('B_SR', xSR, H), nd('B_START', -bl / 2, H),
    ], { role: 'rib', sa: 7, placement: { zone: 'neck', wrap: 1, drop: -H * 0.5 } }));
    for (const s of ['L', 'R'] as const) {
      seams.push(join(`neckF_${s}`, o.split ? ['front', s, 'CF_NECK', 'NECK'] : ['front', undefined, 'CF_NECK', `NECK_${s}`], ['neckband', undefined, 'B_CF', `B_S${s}`], pieces, { kind: 'rib' }));
    }
    seams.push(join('neckB_L', ['back', undefined, 'NECK_L', 'CB_NECK'], ['neckband', undefined, 'B_SL', 'B_END'], pieces, { kind: 'rib' }));
    seams.push(join('neckB_R', ['back', undefined, 'NECK_R', 'CB_NECK'], ['neckband', undefined, 'B_SR', 'B_START'], pieces, { kind: 'rib' }));
    seams.push(join('neckband_end', ['neckband', undefined, 'T_END', 'B_END'], ['neckband', undefined, 'T_START', 'B_START'], pieces));
  }

  // ---- hem band ----
  if (o.rib && p.bandHeight > 0) {
    const H = p.bandHeight, r = 0.86;
    const fh = 2 * hemW, bh = 2 * hemW, bl = (fh + bh) * r;
    const xSR = -bl / 2 + (bh / 2) * r, xSL = bl / 2 - (bh / 2) * r;
    pieces.push(piece('hemband', 'Saumbund', [
      nd('T0', -bl / 2, 0), nd('T_SR', xSR, 0), nd('T_CF', 0, 0), nd('T_SL', xSL, 0), nd('T1', bl / 2, 0), nd('B1', bl / 2, H), nd('B0', -bl / 2, H),
    ], { role: 'rib', sa: 7, placement: { zone: 'hem', wrap: 1, drop: L } }));
    if (o.split) {
      for (const s of ['L', 'R'] as const) seams.push(join(`bandF_${s}`, ['front', s, 'HEM', 'CF_HEM'], ['hemband', undefined, `T_S${s}`, 'T_CF'], pieces, { kind: 'rib' }));
    } else seams.push(join('bandF', ['front', undefined, 'HEM_L', 'HEM_R'], ['hemband', undefined, 'T_SL', 'T_SR'], pieces, { kind: 'rib' }));
    seams.push(join('bandB_R', ['back', undefined, 'HEM_R', 'CB_HEM'], ['hemband', undefined, 'T_SR', 'T0'], pieces, { kind: 'rib' }));
    seams.push(join('bandB_L', ['back', undefined, 'HEM_L', 'CB_HEM'], ['hemband', undefined, 'T_SL', 'T1'], pieces, { kind: 'rib' }));
    seams.push(join('band_end', ['hemband', undefined, 'T1', 'B1'], ['hemband', undefined, 'T0', 'B0'], pieces));
    pom[2].value = L + H;
  }
  return { pieces, seams, pom };
}

const BASE: ParamDef[] = [
  pd('easeChest', 'Mehrweite Brust', 100, 0, 420, 'Weite'),
  pd('hemFlare', 'Saumausstellung je Seite', 0, -40, 320, 'Weite'),
  pd('waistShaping', 'Taillierung je Seite', 0, 0, 60, 'Weite'),
  pd('lengthAdj', 'Länge ±', 0, -260, 520, 'Länge'),
  pd('shoulderDrop', 'Schulterüberschnitt', 0, -90, 160, 'Schulter & Arm'),
  pd('armholeAdj', 'Armlochtiefe ±', 0, -30, 140, 'Schulter & Arm'),
  pd('neckWidth', 'Halsausschnitt Breite ±', 15, -20, 90, 'Ausschnitt'),
  pd('neckDepth', 'Halsausschnitt Tiefe ±', 0, -40, 180, 'Ausschnitt'),
];
const SLEEVE: ParamDef[] = [
  pd('sleeveAdj', 'Ärmellänge ±', 0, -150, 150, 'Schulter & Arm'),
  pd('sleeveEase', 'Mehrweite Oberarm', 70, 10, 260, 'Schulter & Arm'),
];
const NECKBAND = pd('neckbandHeight', 'Halsbündchen Höhe', 18, 0, 70, 'Ausschnitt');
const RIB: ParamDef[] = [pd('cuffHeight', 'Ärmelbündchen Höhe', 60, 0, 110, 'Bündchen'), pd('bandHeight', 'Saumbund Höhe', 60, 0, 130, 'Bündchen')];
const HOOD = pd('hoodAdj', 'Kapuze Höhe ±', 0, -60, 110, 'Kapuze');
const zero = { cuffHeight: 0, bandHeight: 0, hoodAdj: 0, neckbandHeight: 0, sleeveAdj: 0, sleeveEase: 70 };

function top(id: string, name: string, o: TopOpts, params: ParamDef[], sils: Silhouette[], mat: string): GarmentTemplate {
  return {
    id, category: id, family: 'top', name, kind: 'cloth', silhouettes: sils, params, defaultMaterial: mat, ribMaterial: 'rib',
    gradeKeys: { x: 'chest', y: 'height' },
    build: (m, p) => draftTop(m, { ...zero, ...p }, o),
  };
}
const S = (id: string, name: string, description: string, params: Record<string, number>): Silhouette => ({ id, name, description, params });

export const TOP_TEMPLATES: GarmentTemplate[] = [
  top('tshirt', 'T-Shirt', { sleeve: 'short' }, [...BASE, ...SLEEVE, NECKBAND], [
    S('classic', 'Classic Regular', 'Gerade, gesetzte Schulter, Rundhals', {}),
    S('slim', 'Slim', 'Körpernah, leicht tailliert', { easeChest: 50, lengthAdj: 10, shoulderDrop: -5, sleeveAdj: -10, sleeveEase: 40, hemFlare: -10, waistShaping: 15 }),
    S('boxy', 'Boxy Cropped', 'Kastig, kurz, leicht überschnitten', { easeChest: 220, lengthAdj: -110, shoulderDrop: 50, sleeveAdj: 15, sleeveEase: 110 }),
    S('oversized', 'Oversized Drop-Shoulder', 'Weit, tief überschnittene Schulter', { easeChest: 300, lengthAdj: 60, shoulderDrop: 95, sleeveAdj: 45, sleeveEase: 140, neckWidth: 10, neckDepth: -10, neckbandHeight: 22 }),
  ], 'jersey180'),
  top('longsleeve', 'Longsleeve', { sleeve: 'long', rib: false }, [...BASE, ...SLEEVE, NECKBAND, RIB[0]], [
    S('regular', 'Regular', 'Gerade, gesetzter Ärmel', { easeChest: 90, cuffHeight: 0 }),
    S('oversized', 'Oversized', 'Weit mit Drop-Shoulder und Bündchen', { easeChest: 260, shoulderDrop: 85, sleeveEase: 130, lengthAdj: 40, cuffHeight: 50 }),
  ], 'jersey180'),
  top('sweatshirt', 'Sweatshirt', { sleeve: 'long', rib: true }, [...BASE, ...SLEEVE, NECKBAND, ...RIB], [
    S('regular', 'Regular', 'Klassisch mit Rippbündchen', { easeChest: 140, sleeveEase: 90, neckbandHeight: 22, cuffHeight: 60, bandHeight: 60 }),
    S('oversized', 'Oversized Drop-Shoulder', 'Weit, überschnitten, breite Bündchen', { easeChest: 280, shoulderDrop: 90, sleeveEase: 140, lengthAdj: 20, neckbandHeight: 25, cuffHeight: 70, bandHeight: 70 }),
  ], 'frenchterry320'),
  top('hoodie', 'Hoodie', { sleeve: 'long', rib: true, hood: true, pocket: true }, [...BASE, ...SLEEVE, ...RIB, HOOD], [
    S('regular', 'Regular', 'Kapuze, Kängurutasche, Bündchen', { easeChest: 150, sleeveEase: 90, cuffHeight: 60, bandHeight: 60, neckDepth: 20 }),
    S('oversized', 'Oversized Drop-Shoulder', 'Weit, tief überschnitten', { easeChest: 300, shoulderDrop: 100, sleeveEase: 150, lengthAdj: 30, cuffHeight: 70, bandHeight: 70, neckDepth: 20, hoodAdj: 20 }),
    S('cropped', 'Cropped Boxy', 'Kurz und kastig', { easeChest: 240, lengthAdj: -120, shoulderDrop: 60, sleeveEase: 120, cuffHeight: 60, bandHeight: 50, neckDepth: 20 }),
  ], 'frenchterry320'),
  top('tank', 'Tanktop', { sleeve: 'none' }, [...BASE, NECKBAND], [
    S('regular', 'Regular', 'Schmale Träger', { easeChest: 60, shoulderDrop: -60, armholeAdj: 30, neckDepth: 30, neckbandHeight: 12 }),
    S('muscle', 'Muscle', 'Tiefe Armlöcher, breite Schulter', { easeChest: 100, shoulderDrop: -35, armholeAdj: 80, neckbandHeight: 14 }),
  ], 'jersey180'),
  top('jacket', 'Jacke', { sleeve: 'long', split: true, woven: true }, [...BASE, ...SLEEVE, NECKBAND, ...RIB], [
    S('bomber', 'Bomber', 'Blouson mit Rippbündchen und Rippkragen', { easeChest: 180, lengthAdj: -40, sleeveEase: 110, neckbandHeight: 45, cuffHeight: 70, bandHeight: 70, neckDepth: 10 }),
    S('boxy', 'Boxy Jacket', 'Kastige, kragenlose Couture-Jacke, Kante an Kante', { easeChest: 140, lengthAdj: -110, shoulderDrop: 10, sleeveEase: 80, neckbandHeight: 0, cuffHeight: 0, bandHeight: 0, neckDepth: 25, neckWidth: 25 }),
  ], 'boucle'),
  top('dress', 'Kleid', { sleeve: 'none' }, [...BASE, NECKBAND], [
    S('shift', 'Shift', 'Gerade, ärmellos, knielang', { easeChest: 80, lengthAdj: 330, shoulderDrop: -20, armholeAdj: 15, neckbandHeight: 10, waistShaping: 10 }),
    S('aline', 'A-Linie', 'Ausgestellt ab Brust', { easeChest: 80, lengthAdj: 330, hemFlare: 130, shoulderDrop: -20, armholeAdj: 15, neckbandHeight: 10 }),
  ], 'crepe'),
];

// T-Shirt-Kleid needs sleeves: separate template variant under the dress category
TOP_TEMPLATES.push({
  ...top('dress_tee', 'T-Shirt-Kleid', { sleeve: 'short' }, [...BASE, ...SLEEVE, NECKBAND], [
    S('tee', 'T-Shirt-Kleid', 'Lässig, kurzarm, knielang', { easeChest: 140, lengthAdj: 300, shoulderDrop: 30, sleeveEase: 90 }),
  ], 'jersey180'),
  category: 'dress',
});
