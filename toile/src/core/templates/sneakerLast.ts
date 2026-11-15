import type { Measurements } from '../sizing/measurements';
import type { Vec2 } from '../geometry/vec';

export interface LastModel {
  FL: number; FW: number; NS: number; NT: number; sC: number; sT: number; soleH: number;
  /** 3D point (mm, x lateral+, y up from feather line, z forward) of grid node */
  P(i: number, j: number): [number, number, number];
  /** flattened coordinate of grid node (u along length, v signed arc from top centre; medial negative) */
  F(i: number, j: number): Vec2;
  surface(s: number, t: number): [number, number, number];
  flat(s: number, t: number): Vec2;
  /** t on the lateral (t>0.5) side where the opening edge sits at s, or null outside the opening */
  openT(s: number): number | null;
  /** t where height above feather line equals h at s on the lateral side */
  tAtHeight(s: number, h: number): number;
  domain: Vec2[]; opening: Vec2[]; soleOutline: Vec2[];
  halfWidth(s: number): { cx: number; wm: number; wl: number };
}

const smooth = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
function interp(keys: [number, number][], s: number) {
  if (s <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) if (s <= keys[i][0]) {
    const [s0, v0] = keys[i - 1], [s1, v1] = keys[i];
    const t = (s - s0) / (s1 - s0), e = t * t * (3 - 2 * t);
    return v0 + (v1 - v0) * e;
  }
  return keys[keys.length - 1][1];
}

export function buildLast(m: Measurements, p: Record<string, number>): LastModel {
  const FL = m.footLength + (p.toeAllowance ?? 15), FW = m.footWidth + (p.widthAdj ?? 0);
  const k = FL / 250;
  const NS = 121, NT = 81;
  const sC = 0.33, sT = 0.62;
  const H = (s: number) => interp([[0, 92], [0.22, 90], [0.4, 78], [0.55, 62], [0.7, 44], [0.86, 33], [1, 20]], s) * k;
  const prof = (s: number) => {
    if (s < 0.13) return 0.64 * Math.sqrt(Math.max(0, 1 - ((0.13 - s) / 0.13) ** 2));
    if (s < 0.45) return 0.64 + (0.8 - 0.64) * smooth(0.13, 0.45, s);
    if (s < 0.7) return 0.8 + 0.2 * smooth(0.45, 0.7, s);
    return Math.pow(Math.max(0, 1 - ((s - 0.7) / 0.3) ** 2.2), 0.5);
  };
  const halfWidth = (s: number) => {
    const w = (FW / 2) * prof(s), a = smooth(0.4, 0.8, s);
    return { cx: -0.035 * FW * smooth(0.6, 1, s), wm: w * (1 - 0.05 * a), wl: w * (1 + 0.05 * a) };
  };
  const surface = (s: number, t: number): [number, number, number] => {
    const { cx, wm, wl } = halfWidth(s);
    const phi = Math.PI * (1 - t), c = Math.cos(phi), sn = Math.max(0, Math.sin(phi));
    const x = cx + (c < 0 ? -wm : wl) * Math.pow(Math.abs(c), 0.85);
    const y = H(s) * Math.pow(sn, 0.75);
    return [x, y, s * FL];
  };
  const Pg = new Float64Array(NS * NT * 3), Fg = new Float64Array(NS * NT * 2);
  for (let i = 0; i < NS; i++) for (let j = 0; j < NT; j++) {
    const q = surface(i / (NS - 1), j / (NT - 1)), o = (i * NT + j) * 3;
    Pg[o] = q[0]; Pg[o + 1] = q[1]; Pg[o + 2] = q[2];
  }
  const P = (i: number, j: number): [number, number, number] => { const o = (i * NT + j) * 3; return [Pg[o], Pg[o + 1], Pg[o + 2]]; };
  const d3 = (a: number[], b: number[]) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  const jc = (NT - 1) / 2;
  // v: signed arc length from top centre within each cross-section
  for (let i = 0; i < NS; i++) {
    Fg[(i * NT + jc) * 2 + 1] = 0;
    for (let j = jc + 1; j < NT; j++) Fg[(i * NT + j) * 2 + 1] = Fg[(i * NT + j - 1) * 2 + 1] + d3(P(i, j), P(i, j - 1));
    for (let j = jc - 1; j >= 0; j--) Fg[(i * NT + j) * 2 + 1] = Fg[(i * NT + j + 1) * 2 + 1] - d3(P(i, j), P(i, j + 1));
  }
  // u: arc length along s at fixed t, corrected for the v-offset so that 2D neighbour distance matches 3D
  for (let j = 0; j < NT; j++) {
    Fg[j * 2] = 0;
    for (let i = 1; i < NS; i++) {
      const dd = d3(P(i, j), P(i - 1, j));
      const dv = Fg[(i * NT + j) * 2 + 1] - Fg[((i - 1) * NT + j) * 2 + 1];
      Fg[(i * NT + j) * 2] = Fg[((i - 1) * NT + j) * 2] + Math.sqrt(Math.max(0, dd * dd - dv * dv));
    }
  }
  const F = (i: number, j: number): Vec2 => ({ x: Fg[(i * NT + j) * 2], y: Fg[(i * NT + j) * 2 + 1] });
  const flat = (s: number, t: number): Vec2 => {
    const fi = Math.min(NS - 1.000001, Math.max(0, s * (NS - 1))), fj = Math.min(NT - 1.000001, Math.max(0, t * (NT - 1)));
    const i = Math.floor(fi), j = Math.floor(fj), a = fi - i, b = fj - j;
    const f00 = F(i, j), f10 = F(i + 1, j), f01 = F(i, j + 1), f11 = F(i + 1, j + 1);
    return { x: (1 - a) * (1 - b) * f00.x + a * (1 - b) * f10.x + (1 - a) * b * f01.x + a * b * f11.x, y: (1 - a) * (1 - b) * f00.y + a * (1 - b) * f10.y + (1 - a) * b * f01.y + a * b * f11.y };
  };
  const tAtHeight = (s: number, h: number) => {
    let lo = 0.5, hi = 1;
    if (surface(s, 0.5)[1] <= h) return 0.5;
    for (let n = 0; n < 40; n++) { const mid = (lo + hi) / 2; if (surface(s, mid)[1] > h) lo = mid; else hi = mid; }
    return (lo + hi) / 2;
  };
  const tAtV = (s: number, v: number) => {
    let lo = 0.5, hi = 1;
    for (let n = 0; n < 40; n++) { const mid = (lo + hi) / 2; if (flat(s, mid).y < v) lo = mid; else hi = mid; }
    return (lo + hi) / 2;
  };
  const collar = (s: number) => interp([[0, 64], [0.2, 52], [sC, H(sC) - 4]], s) * k + (p.collarAdj ?? 0);
  const gap = 12 * k;
  const openT = (s: number): number | null => {
    if (s > sT) return null;
    if (s <= sC) return tAtHeight(s, collar(s));
    const g = gap * (1 - smooth(sT - 0.05, sT, s)) + 0.5;
    return tAtV(s, g);
  };
  const domain: Vec2[] = [];
  for (let i = 0; i < NS; i++) domain.push(F(i, 0));
  for (let j = 1; j < NT; j++) domain.push(F(NS - 1, j));
  for (let i = NS - 2; i >= 0; i--) domain.push(F(i, NT - 1));
  for (let j = NT - 2; j > 0; j--) domain.push(F(0, j));
  const opening: Vec2[] = [];
  const SO = 60;
  for (let n = 0; n <= SO; n++) { const s = (sT * n) / SO; opening.push(flat(s, openT(s)!)); }
  for (let n = SO; n >= 0; n--) { const s = (sT * n) / SO; opening.push(flat(s, 1 - openT(s)!)); }
  const soleOutline: Vec2[] = [];
  for (let n = 0; n <= 40; n++) { const s = n / 40, hw = halfWidth(s); soleOutline.push({ x: hw.cx + hw.wl + 5, y: s * FL + (n === 40 ? 5 : 0) }); }
  for (let n = 40; n >= 0; n--) { const s = n / 40, hw = halfWidth(s); soleOutline.push({ x: hw.cx - hw.wm - 5, y: s * FL - (n === 0 ? 5 : 0) }); }
  return { FL, FW, NS, NT, sC, sT, soleH: p.soleHeight ?? 28, P, F, surface, flat, openT, tAtHeight, domain, opening, soleOutline, halfWidth };
}
