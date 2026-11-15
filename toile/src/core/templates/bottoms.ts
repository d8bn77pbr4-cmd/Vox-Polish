import type { Measurements } from '../sizing/measurements';
import type { GarmentTemplate, PatternPiece, Seam, Pom, TemplateOutput, ParamDef, Silhouette, InternalLine } from '../pattern/types';
import { type PathNode, widthAtY, flattenPath } from '../geometry/path';
import { edgeLength } from '../pattern/piece';
import { nd, P, join, piece, pd } from './helpers';

type Params = Record<string, number>;

function bisect(f: (x: number) => number, target: number, lo: number, hi: number): number {
  let flo = f(lo) - target;
  for (let i = 0; i < 50; i++) {
    const mid = (lo + hi) / 2, fm = f(mid) - target;
    if (Math.abs(fm) < 0.02) return mid;
    if ((fm < 0) === (flo < 0)) { lo = mid; flo = fm; } else hi = mid;
  }
  return (lo + hi) / 2;
}

function waistband(pieces: PatternPiece[], seams: Seam[], segs: { edge: [string, 'L' | 'R' | undefined, string, string]; len: number; name: string }[], h: number, angle: number, endsAt: string, drop: number, reduce = 0) {
  // segs listed in band order from x = -bl/2 to +bl/2; node between segs
  const total = segs.reduce((a, s) => a + s.len, 0) - reduce;
  const k = total / (total + reduce);
  const nodes: PathNode[] = [nd('T0', -total / 2, 0), nd('T1', total / 2, 0)];
  const bottom: PathNode[] = [];
  let x = -total / 2;
  const ids = ['B_' + endsAt + '0'];
  for (let i = 0; i < segs.length - 1; i++) { x += segs[i].len * k; ids.push('B_' + segs[i].name); }
  ids.push('B_' + endsAt + '1');
  x = -total / 2;
  const xs = [x];
  for (let i = 0; i < segs.length; i++) { x += segs[i].len * k; xs.push(x); }
  for (let i = ids.length - 1; i >= 0; i--) bottom.push(nd(ids[i], xs[i], h));
  pieces.push(piece('waistband', 'Bund', [...nodes, ...bottom], { sa: 10, placement: { zone: 'waist', wrap: 1, angle, drop: drop - h } }));
  segs.forEach((s, i) => seams.push(join(`wb_${i}`, s.edge, ['waistband', undefined, ids[i], ids[i + 1]], pieces, reduce > 0 ? { kind: 'gather' } : {})));
  seams.push(join('wb_end', ['waistband', undefined, 'T1', ids[ids.length - 1]], ['waistband', undefined, 'T0', ids[0]], pieces));
}

export interface TrouserOpts { shorts?: boolean; jeans?: boolean }

export function draftTrousers(m: Measurements, p: Params, o: TrouserOpts): TemplateOutput {
  const H = m.hip + p.easeHip;
  const rise = p.riseAdj;
  const waistEff = m.waist + p.easeWaist + (m.hip - m.waist) * Math.max(0, -rise) / 200;
  const cd = m.rise + 15 + rise + p.crotchAdj;
  const hd = Math.max(60, Math.min(cd - 50, 0.12 * m.height + rise));
  const inseam = o.shorts ? p.inseamLen : m.inseam - 15 + p.lengthAdj;
  const Lout = cd + inseam;
  const ky = o.shorts ? cd + inseam * 0.6 : cd + inseam * 0.5 - 50;
  const pleat = p.pleat ?? 0;
  const fh = H / 4 - 10 + pleat, fce = H / 16, fw = waistEff / 4 - 10 + pleat;
  const bh = H / 4 + 10, bce = H / 9, bw = waistEff / 4 + 10;
  let kneeT: number, hemT: number;
  if (o.shorts) { hemT = m.thigh * (1 - inseam / 900) + p.legEase; kneeT = hemT; }
  else { kneeT = m.knee + p.kneeEase; hemT = m.knee * 0.95 + p.hemAdj; }
  const kF = kneeT / 4 - 5, kB = kneeT / 4 + 5, hF = hemT / 4 - 5, hB = hemT / 4 + 5;
  // ---- front (left leg as drafted; CF at x<0, side at x>0) ----
  const fxL = -(fh + fce) / 2, fxR = (fh + fce) / 2, fxCF = fxL + fce;
  const fSW = fxCF + 10 + fw;
  const frontNodes: PathNode[] = [
    nd('CF_WAIST', fxCF + 10, 10),
    nd('SIDE_WAIST', fSW, 0, null, P(fSW + (fxR - fSW) * 0.35, hd * 0.45)),
    nd('SIDE_HIP', fxR, hd, P(fxR, hd * 0.65), P(fxR, hd + (ky - hd) * 0.35)),
    nd('SIDE_KNEE', kF, ky, P(kF + (fxR - kF) * 0.15, ky - (ky - hd) * 0.3)),
    nd('SIDE_HEM', hF, Lout),
    nd('IN_HEM', -hF, Lout),
    nd('IN_KNEE', -kF, ky, null, P(-kF, ky - (ky - cd) * 0.4)),
    nd('CROTCH', fxL, cd, P(fxL + fce * 0.15, cd + 50), P(fxL + fce * 0.5, cd)),
    nd('CF_HIP', fxCF, hd, P(fxCF, cd - (cd - hd) * 0.35)),
  ];
  const fInseam = edgeLength({ nodes: frontNodes } as PatternPiece, 'IN_HEM', 'CROTCH');
  const fOut = edgeLength({ nodes: frontNodes } as PatternPiece, 'SIDE_WAIST', 'SIDE_HEM');
  // ---- back (left leg; side at x<0, CB at x>0) ----
  const bxS = -(bh + bce) / 2, bxC = (bh + bce) / 2, bxCB = bxS + bh;
  const cbW = bxCB - 30;
  const backNodes = (cdB: number, swy: number): PathNode[] => {
    const bSW = cbW - bw;
    return [
      nd('SIDE_WAIST', bSW, swy, null, null),
      nd('CB_WAIST', cbW, -35),
      nd('CB_HIP', bxCB, hd, null, P(bxCB + 5, hd + (cdB - hd) * 0.55)),
      nd('CROTCH', bxC, cdB, P(bxC - bce * 0.55, cdB), P(bxC - bce * 0.2, cdB + 50)),
      nd('IN_KNEE', kB, ky, P(kB, ky - (ky - cdB) * 0.4)),
      nd('IN_HEM', hB, Lout),
      nd('SIDE_HEM', -hB, Lout, null, null),
      nd('SIDE_KNEE', -kB, ky, null, P(-kB - (bxS + kB) * -0.15, ky - (ky - hd) * 0.3)),
      nd('SIDE_HIP', bxS, hd, P(bxS, hd + (ky - hd) * 0.35), P(bxS, hd * 0.65)),
    ].map((n) => (n.id === 'SIDE_WAIST' ? { ...n, hin: P(bSW + (bxS - bSW) * 0.35, swy + (hd - swy) * 0.45) } : n));
  };
  const cdB = bisect((c) => edgeLength({ nodes: backNodes(c, 0) } as PatternPiece, 'CROTCH', 'IN_HEM'), fInseam, cd - 40, cd + 60);
  const swy = bisect((y) => edgeLength({ nodes: backNodes(cdB, y) } as PatternPiece, 'SIDE_HEM', 'SIDE_WAIST'), fOut, -60, 60);
  const bNodes = backNodes(cdB, swy);
  const jeansF: InternalLine[] = o.jeans ? [
    { id: 'pocket', kind: 'pocket', pts: [P(fxCF + 10 + fw * 0.45, 4), P(fxCF + 10 + fw * 0.62, hd * 0.32), P((widthAtY(flattenPath(frontNodes).pts, hd * 0.5)?.maxX ?? fxR) - 1, hd * 0.5)] },
    { id: 'fly', kind: 'stitch', pts: [P(fxCF + 10 + 35, 10), P(fxCF + 35, hd - 10), P(fxCF + 5, hd + 30)] },
  ] : [];
  const tailored: InternalLine[] = pleat > 0 ? [
    { id: 'pleat1', kind: 'pleat', pts: [P(0, 0), P(0, 120)] }, { id: 'pleat2', kind: 'pleat', pts: [P(pleat, 0), P(pleat, 120)] },
    { id: 'crease', kind: 'guide', pts: [P(0, 130), P(0, Lout)] },
  ] : [];
  const hemStitch = (x0: number, x1: number): InternalLine[] => [{ id: 'hemstitch', kind: 'stitch', pts: [P(x0 + 3, Lout - 20), P(x1 - 3, Lout - 20)] }];
  const pieces: PatternPiece[] = [
    piece('front', 'Vorderhose', frontNodes, { cut: { count: 2 }, placement: { zone: 'legFront', wrap: 0.5, drop: -rise }, saEdges: { SIDE_HEM: 30 },
      internal: [...jeansF, ...tailored, ...hemStitch(-hF, hF)] }),
    piece('back', 'Hinterhose', bNodes, { cut: { count: 2 }, placement: { zone: 'legBack', wrap: 0.5, drop: -rise - 35 }, saEdges: { IN_HEM: 30 },
      internal: [
        ...(o.jeans ? [
          { id: 'yoke', kind: 'yoke' as const, pts: [P(bNodes[0].x + 4, swy + 70), P(cbW + 8, 35)] },
          { id: 'pocket', kind: 'pocket' as const, closed: true, pts: [P(bxCB - bh * 0.62, 95), P(bxCB - bh * 0.15, 85), P(bxCB - bh * 0.17, 235), P(bxCB - bh * 0.4, 265), P(bxCB - bh * 0.62, 245)] },
        ] : []),
        ...hemStitch(-hB, hB),
      ] }),
  ];
  const seams: Seam[] = [];
  for (const s of ['L', 'R'] as const) {
    seams.push(join(`inseam_${s}`, ['front', s, 'IN_HEM', 'CROTCH'], ['back', s, 'IN_HEM', 'CROTCH'], pieces));
    seams.push(join(`outseam_${s}`, ['front', s, 'SIDE_WAIST', 'SIDE_HEM'], ['back', s, 'SIDE_WAIST', 'SIDE_HEM'], pieces));
  }
  seams.push(join('cf', ['front', 'L', 'CF_WAIST', 'CROTCH'], ['front', 'R', 'CF_WAIST', 'CROTCH'], pieces));
  seams.push(join('cb', ['back', 'L', 'CB_WAIST', 'CROTCH'], ['back', 'R', 'CB_WAIST', 'CROTCH'], pieces));
  const fW = edgeLength(pieces[0], 'CF_WAIST', 'SIDE_WAIST'), bW = edgeLength(pieces[1], 'SIDE_WAIST', 'CB_WAIST');
  // band runs CF(left end) → left side → CB → right side → CF (angle 180 puts the ends at the front)
  waistband(pieces, seams, [
    { edge: ['front', 'L', 'CF_WAIST', 'SIDE_WAIST'], len: fW, name: 'SIDE_L' },
    { edge: ['back', 'L', 'SIDE_WAIST', 'CB_WAIST'], len: bW, name: 'CB' },
    { edge: ['back', 'R', 'CB_WAIST', 'SIDE_WAIST'], len: bW, name: 'SIDE_R' },
    { edge: ['front', 'R', 'SIDE_WAIST', 'CF_WAIST'], len: fW, name: 'CF_R' },
  ], p.waistbandHeight, 180, 'CF', -rise, pleat * 4);
  const pom: Pom[] = [
    { id: 'waist', label: 'Bundweite (halb)', value: edgeLength(pieces[2], 'T0', 'T1') / 2 },
    { id: 'hip', label: 'Hüftweite (halb)', value: H / 2 },
    { id: 'frontRise', label: 'Leibhöhe vorne', value: edgeLength(pieces[0], 'CROTCH', 'CF_WAIST') + p.waistbandHeight },
    { id: 'backRise', label: 'Leibhöhe hinten', value: edgeLength(pieces[1], 'CB_WAIST', 'CROTCH') + p.waistbandHeight },
    { id: 'inseam', label: 'Schrittlänge', value: fInseam },
    { id: 'outseam', label: 'Seitenlänge', value: fOut + p.waistbandHeight },
    { id: 'knee', label: 'Kniebreite (halb)', value: kneeT / 2 },
    { id: 'legOpening', label: 'Saumbreite (halb)', value: hemT / 2 },
  ];
  return { pieces, seams, pom };
}

export function draftSkirt(m: Measurements, p: Params, kind: 'pencil' | 'aline' | 'circle' | 'bias'): TemplateOutput {
  const W = m.waist + p.easeWaist, H = m.hip + p.easeHip;
  const hd = 0.12 * m.height;
  const Lg = m.rise + m.inseam * 0.48 + p.lengthAdj;
  const pieces: PatternPiece[] = [];
  const seams: Seam[] = [];
  const k = 0.5523;
  if (kind === 'circle') {
    const r = W / (2 * Math.PI), R = r + Lg;
    const arcNodes = (side: 'F' | 'B'): PathNode[] => {
      const c = side === 'F' ? 'CF' : 'CB';
      const [l, rr] = side === 'F' ? ['R', 'L'] : ['L', 'R'];
      return [
        nd(`W_S${l}`, -r, -r, null, P(-r, -r + k * r)),
        nd(`W_${c}`, 0, 0, P(-k * r, 0), P(k * r, 0)),
        nd(`W_S${rr}`, r, -r, P(r, -r + k * r)),
        nd(`H_S${rr}`, R, -r, null, P(R, -r + k * R)),
        nd(`H_${c}`, 0, Lg, P(k * R, Lg), P(-k * R, Lg)),
        nd(`H_S${l}`, -R, -r, P(-R, -r + k * R)),
      ];
    };
    pieces.push(piece('front', 'Vorderteil', arcNodes('F'), { saEdges: { H_SL: 15 }, placement: { zone: 'waist', mode: 'radial', angle: 0, wrap: 0.5, radiusAdd: 0 } }));
    pieces.push(piece('back', 'Rückenteil', arcNodes('B'), { saEdges: { H_SR: 15 }, placement: { zone: 'waist', mode: 'radial', angle: 180, wrap: 0.5, radiusAdd: 0 } }));
  } else {
    const flare = kind === 'pencil' ? p.hemFlare : p.hemFlare;
    const fw = W / 4, fh = H / 4;
    const mk = (side: 'F' | 'B'): PathNode[] => {
      const c = side === 'F' ? 'CF' : 'CB';
      const [l, rr] = side === 'F' ? ['R', 'L'] : ['L', 'R'];
      const hemY = Lg;
      return [
        nd(`W_S${l}`, -fw, 0),
        nd(`W_${c}`, 0, 0),
        nd(`W_S${rr}`, fw, 0, null, P(fw + (fh - fw) * 0.3, hd * 0.45)),
        nd(`HIP_${rr}`, fh, hd, P(fh, hd * 0.65)),
        nd(`H_S${rr}`, fh + flare, hemY),
        nd(`H_${c}`, 0, hemY + (flare > 60 ? flare * 0.08 : 0), P((fh + flare) * 0.5, hemY + (flare > 60 ? flare * 0.06 : 0)), P(-(fh + flare) * 0.5, hemY + (flare > 60 ? flare * 0.06 : 0))),
        nd(`H_S${l}`, -(fh + flare), hemY),
        nd(`HIP_${l}`, -fh, hd, null, P(-fh, hd * 0.65)),
      ].map((n) => (n.id === `W_S${l}` ? { ...n, hin: P(-fw - (fh - fw) * 0.3, hd * 0.45) } : n));
    };
    const grain = kind === 'bias' ? 45 : 0;
    pieces.push(piece('front', 'Vorderteil', mk('F'), { grain, saEdges: { H_SL: 25, H_CF: 25 }, placement: { zone: 'waist', wrap: 0.5, angle: 0 },
      internal: [{ id: 'hemstitch', kind: 'stitch', pts: [P(-fh - flare + 4, Lg - 20), P(fh + flare - 4, Lg - 20)] }] }));
    pieces.push(piece('back', 'Rückenteil', mk('B'), { grain: -grain, saEdges: { H_SR: 25, H_CB: 25 }, placement: { zone: 'waist', wrap: 0.5, angle: 180 },
      internal: [{ id: 'hemstitch', kind: 'stitch', pts: [P(-fh - flare + 4, Lg - 20), P(fh + flare - 4, Lg - 20)] }] }));
  }
  for (const s of ['L', 'R'] as const) seams.push(join(`side_${s}`, ['front', undefined, `W_S${s}`, `H_S${s}`], ['back', undefined, `W_S${s}`, `H_S${s}`], pieces));
  const fW = edgeLength(pieces[0], 'W_SR', 'W_SL');
  const bL = edgeLength(pieces[1], 'W_SL', 'W_CB'), bR = edgeLength(pieces[1], 'W_CB', 'W_SR');
  // band ends at CB; angle 0: x>0 = wearer's left. Order from x=-bl/2: CB → right side → (front) → left side → CB
  waistband(pieces, seams, [
    { edge: ['back', undefined, 'W_CB', 'W_SR'], len: bR, name: 'SIDE_R' },
    { edge: ['front', undefined, 'W_SR', 'W_SL'], len: fW, name: 'SIDE_L' },
    { edge: ['back', undefined, 'W_SL', 'W_CB'], len: bL, name: '' },
  ], p.waistbandHeight, 0, 'CB', 0);
  const front = pieces[0];
  const hemLen = kind === 'circle' ? Math.PI * (W / (2 * Math.PI) + Lg) : edgeLength(front, 'H_SL', 'H_SR');
  const pom: Pom[] = [
    { id: 'waist', label: 'Bundweite (halb)', value: (fW + bL + bR) / 2 },
    { id: 'hip', label: 'Hüftweite (halb)', value: kind === 'circle' ? Math.max(H / 2, hemLen) : H / 2 },
    { id: 'hem', label: 'Saumweite (halb)', value: hemLen },
    { id: 'length', label: 'Länge', value: Lg + p.waistbandHeight },
  ];
  return { pieces, seams, pom };
}

const TROUSER_P: ParamDef[] = [
  pd('easeHip', 'Mehrweite Hüfte', 40, 0, 300, 'Weite'), pd('easeWaist', 'Mehrweite Taille', 20, -20, 120, 'Weite'),
  pd('kneeEase', 'Mehrweite Knie', 70, 0, 400, 'Weite'), pd('hemAdj', 'Saumweite ±', 50, -120, 450, 'Weite'),
  pd('riseAdj', 'Bundhöhe (Low/Mid/High) ±', 0, -80, 60, 'Länge'), pd('crotchAdj', 'Schritttiefe ±', 0, -20, 150, 'Länge'),
  pd('lengthAdj', 'Länge ±', 0, -300, 100, 'Länge'), pd('pleat', 'Bundfalte', 0, 0, 40, 'Details'),
  pd('waistbandHeight', 'Bundhöhe', 40, 0, 90, 'Details'),
];
const SHORTS_P: ParamDef[] = [
  pd('easeHip', 'Mehrweite Hüfte', 60, 0, 300, 'Weite'), pd('easeWaist', 'Mehrweite Taille', 20, -20, 120, 'Weite'),
  pd('legEase', 'Mehrweite Bein', 120, 0, 400, 'Weite'), pd('riseAdj', 'Bundhöhe ±', 0, -80, 60, 'Länge'),
  pd('crotchAdj', 'Schritttiefe ±', 0, -20, 150, 'Länge'), pd('inseamLen', 'Schrittlänge', 150, 30, 400, 'Länge'),
  pd('waistbandHeight', 'Bundhöhe', 40, 0, 90, 'Details'),
];
const SKIRT_P: ParamDef[] = [
  pd('easeHip', 'Mehrweite Hüfte', 40, 0, 300, 'Weite'), pd('easeWaist', 'Mehrweite Taille', 10, -10, 80, 'Weite'),
  pd('hemFlare', 'Saumausstellung je Seite', 0, -60, 500, 'Weite'), pd('lengthAdj', 'Länge ±', 0, -300, 500, 'Länge'),
  pd('waistbandHeight', 'Bundhöhe', 35, 0, 90, 'Details'),
  { key: 'style', label: 'Schnittart', default: 0, min: 0, max: 3, step: 1, unit: 'n', group: 'Schnittart', options: ['Bleistift / gerade', 'A-Linie', 'Tellerrock', 'Schrägschnitt'] },
];
const S = (id: string, name: string, description: string, params: Record<string, number>): Silhouette => ({ id, name, description, params });
const tmpl = (id: string, category: string, name: string, params: ParamDef[], sils: Silhouette[], mat: string, build: GarmentTemplate['build']): GarmentTemplate =>
  ({ id, category, family: 'bottom', name, kind: 'cloth', silhouettes: sils, params, defaultMaterial: mat, gradeKeys: { x: 'hip', y: 'inseam' }, build });

export const BOTTOM_TEMPLATES: GarmentTemplate[] = [
  tmpl('trousers', 'trousers', 'Hose & Jeans', TROUSER_P, [
    S('straight', 'Straight Five-Pocket', 'Gerades Bein, Passe, Five-Pocket', {}),
    S('slim', 'Slim Tapered', 'Schmal zulaufend', { easeHip: 25, kneeEase: 40, hemAdj: -40 }),
    S('wide', 'Wide Leg (Marlene)', 'Hoher Bund, weites Bein', { easeHip: 60, kneeEase: 230, hemAdj: 260, riseAdj: 40, waistbandHeight: 50 }),
    S('baggy', 'Baggy', 'Sehr weit, tiefer Schritt', { easeHip: 170, easeWaist: 40, kneeEase: 210, hemAdj: 160, crotchAdj: 70, riseAdj: -20 }),
    S('flare', 'Bootcut / Flare', 'Schmales Knie, ausgestellter Saum', { easeHip: 30, kneeEase: 40, hemAdj: 120 }),
    S('tailored', 'Tailored mit Bundfalte', 'Bundfalte, Bügelfalte, gerades Bein', { easeHip: 60, kneeEase: 120, hemAdj: 40, pleat: 25, waistbandHeight: 38 }),
  ], 'denim14', (m, p) => draftTrousers(m, p, { jeans: true })),
  tmpl('shorts', 'shorts', 'Shorts', SHORTS_P, [
    S('regular', 'Regular', 'Kurz, gerade', {}),
    S('bermuda', 'Bermuda', 'Knielang, weit', { inseamLen: 280, legEase: 160 }),
  ], 'canvas', (m, p) => draftTrousers(m, p, { shorts: true })),
  tmpl('skirt', 'skirt', 'Rock', SKIRT_P, [
    S('pencil', 'Bleistift', 'Körpernah, knielang', { style: 0, easeHip: 30, hemFlare: -25 }),
    S('aline', 'A-Linie', 'Ausgestellt ab Hüfte', { style: 1, hemFlare: 130 }),
    S('circle', 'Tellerrock', 'Voller Kreis, fließend', { style: 2, lengthAdj: -60 }),
    S('bias', 'Schrägschnitt-Midi', 'Im schrägen Fadenlauf, fließend, midi', { style: 3, easeHip: 30, hemFlare: 90, lengthAdj: 180 }),
  ], 'crepe', (m, p) => draftSkirt(m, p, (['pencil', 'aline', 'circle', 'bias'] as const)[Math.round(p.style ?? 0)] ?? 'pencil')),
];
