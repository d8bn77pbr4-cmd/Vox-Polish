import type { Measurements, Profile } from '../sizing/measurements';

export type V3 = [number, number, number];
export interface Ring { y: number; cx: number; cz: number; rx: number; rz: number }
export interface Cap { a: V3; b: V3; ra: number; rb: number; name: string }
export interface ZoneFrame { A: V3; d: V3; f: V3; kind: 'cyl' | 'sphere'; R?: number; C?: V3 }
export interface Body {
  rings: Ring[]; caps: Cap[]; head: { c: V3; r: number }; zones: Record<string, ZoneFrame>;
  height: number; floorY: 0; waistY: number; hpsY: number; hipY: number; crotchY: number; neckR: number;
  feet: { L: { heel: V3; toe: V3 }; R: { heel: V3; toe: V3 } };
  /** packed ring data for fast lookup: y, cx, cz, rx, rz per ring */
  rp: Float64Array;
}

/** Semi-axis a of an ellipse with perimeter P and axis ratio k = b/a (Ramanujan). */
export function ellipseA(P: number, k: number) {
  const h = ((1 - k) / (1 + k)) ** 2;
  return P / (Math.PI * (1 + k) * (1 + (3 * h) / (10 + Math.sqrt(4 - 3 * h))));
}
const norm = (v: V3): V3 => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };

export function buildBody(mm: Measurements, profile: Profile): Body {
  const m = (k: keyof Measurements) => mm[k] / 1000;
  const H = m('height'), s = H / 1.7;
  const crotchY = m('inseam'), waistY = crotchY + m('rise');
  const hipY = Math.max(crotchY + 0.06, waistY - 0.12 * H);
  const hpsY = waistY + m('backLength');
  const chestY = hpsY - (profile === 'women' ? 0.14 : 0.13) * H;
  const armpitY = hpsY - 0.108 * H, shoulderY = hpsY - 0.035 * s;
  const neckR = m('neck') / (2 * Math.PI);
  const ring = (y: number, C: number, k: number, cz = 0): Ring => { const rx = ellipseA(C, k); return { y, cx: 0, cz, rx, rz: rx * k }; };
  const hip = ring(hipY, m('hip'), 0.74, -0.012);
  const rings: Ring[] = [
    { y: crotchY - 0.012, cx: 0, cz: -0.01, rx: hip.rx * 0.97, rz: hip.rz * 0.9 },
    hip,
    ring((hipY + waistY) / 2, (m('hip') + m('waist')) / 2, 0.76, -0.006),
    ring(waistY, m('waist'), 0.78, 0),
    ring(waistY + (chestY - waistY) * 0.5, m('waist') + (m('chest') - m('waist')) * 0.55, 0.74, 0.004),
    ring(chestY, m('chest'), profile === 'women' ? 0.76 : 0.7, profile === 'women' ? 0.012 : 0.004),
    ring(armpitY, m('chest') * 0.95, 0.66, 0),
    { y: shoulderY - 0.01, cx: 0, cz: -0.008, rx: m('shoulder') / 2 - 0.045 * s, rz: 0.075 * s },
    { y: hpsY + 0.004, cx: 0, cz: -0.006, rx: neckR * 1.25, rz: neckR * 1.2 },
  ];
  const rp = new Float64Array(rings.length * 5);
  rings.forEach((r, i) => rp.set([r.y, r.cx, r.cz, r.rx, r.rz], i * 5));
  const bicR = m('bicep') / (2 * Math.PI), wristR = m('wrist') / (2 * Math.PI) * 1.12;
  const alpha = (42 * Math.PI) / 180;
  const caps: Cap[] = [];
  const headR = (m('head') / (2 * Math.PI)) * 1.03;
  const headC: V3 = [0, H - headR * 1.08, 0.008];
  caps.push({ a: [0, hpsY - 0.03, -0.006], b: [0, headC[1] - headR * 0.6, 0.0], ra: neckR, rb: neckR * 0.95, name: 'neck' });
  const zones: Record<string, ZoneFrame> = {};
  const feet = {} as Body['feet'];
  for (const sd of [1, -1] as const) {
    const S = sd > 0 ? 'L' : 'R';
    const J: V3 = [sd * (m('shoulder') / 2 - 0.045 * s), shoulderY - 0.03 * s, -0.01];
    caps.push({ a: [sd * neckR * 0.7, shoulderY + 0.004, -0.01], b: [J[0], J[1] + 0.012, J[2]], ra: bicR * 0.95, rb: bicR * 1.05, name: 'shoulder' + S });
    const dir: V3 = [sd * Math.sin(alpha), -Math.cos(alpha), 0];
    const up = m('armLength') * 0.46, fo = m('armLength') * 0.44;
    const E: V3 = [J[0] + dir[0] * up, J[1] + dir[1] * up, J[2]];
    const W: V3 = [E[0] + dir[0] * fo, E[1] + dir[1] * fo, E[2] + 0.01];
    caps.push({ a: J, b: E, ra: bicR * 1.02, rb: bicR * 0.8, name: 'upperArm' + S });
    caps.push({ a: E, b: W, ra: bicR * 0.8, rb: wristR, name: 'forearm' + S });
    caps.push({ a: W, b: [W[0] + dir[0] * 0.07, W[1] + dir[1] * 0.07, W[2] + 0.005], ra: wristR * 1.2, rb: wristR * 0.9, name: 'hand' + S });
    zones['arm' + S] = { A: J, d: dir, f: [sd * Math.cos(alpha), Math.sin(alpha), 0], kind: 'cyl' };
    // legs
    const Hj: V3 = [sd * hip.rx * 0.47, crotchY + 0.02, -0.008];
    const ankle: V3 = [sd * (hip.rx * 0.47 + 0.02 * s), 0.085 * s, -0.01];
    const kneeY = 0.285 * H;
    const t = (Hj[1] - kneeY) / (Hj[1] - ankle[1]);
    const K: V3 = [Hj[0] + (ankle[0] - Hj[0]) * t, kneeY, -0.004];
    const thighR = m('thigh') / (2 * Math.PI), kneeR = m('knee') / (2 * Math.PI);
    caps.push({ a: Hj, b: K, ra: thighR * 0.98, rb: kneeR, name: 'thigh' + S });
    caps.push({ a: K, b: ankle, ra: kneeR * 0.98, rb: 0.037 * s, name: 'calf' + S });
    const heel: V3 = [ankle[0], 0.035, -0.035 * s], toe: V3 = [ankle[0] + sd * 0.012, 0.03, m('footLength') - 0.05 * s];
    caps.push({ a: heel, b: toe, ra: 0.035 * s, rb: 0.03 * s, name: 'foot' + S });
    feet[S] = { heel: [ankle[0], 0, -0.06 * s], toe: [ankle[0] + sd * 0.012, 0, m('footLength') - 0.06 * s] };
    const legDir = norm([ankle[0] - Hj[0], ankle[1] - Hj[1], ankle[2] - Hj[2]]);
    zones['legFront' + S] = { A: [Hj[0], waistY, Hj[2]], d: legDir, f: [0, 0, 1], kind: 'cyl' };
    zones['legBack' + S] = { A: [Hj[0], waistY, Hj[2]], d: legDir, f: [0, 0, -1], kind: 'cyl' };
  }
  const down: V3 = [0, -1, 0];
  zones.torsoFront = { A: [0, hpsY, 0], d: down, f: [0, 0, 1], kind: 'cyl' };
  zones.torsoBack = { A: [0, hpsY, 0], d: down, f: [0, 0, -1], kind: 'cyl' };
  zones.hem = zones.torsoFront;
  zones.neck = { A: [0, hpsY + 0.01, 0], d: down, f: [0, 0, 1], kind: 'cyl' };
  zones.waist = { A: [0, waistY, 0], d: down, f: [0, 0, 1], kind: 'cyl' };
  zones.head = { A: [0, headC[1] + headR, headC[2]], d: down, f: [0, 0, 1], kind: 'sphere', R: headR, C: headC };
  zones.scarf = { A: [0, hpsY, 0], d: down, f: [0, 0, 1], kind: 'cyl' };
  return { rings, caps, head: { c: headC, r: headR }, zones, height: H, floorY: 0, waistY, hpsY, hipY, crotchY, neckR, feet, rp };
}

/** Implicit torso function (normalised radius − 1); +Infinity outside the torso's height range. */
function torsoF(rp: Float64Array, x: number, y: number, z: number): number {
  const n = rp.length / 5;
  if (y < rp[0] || y > rp[(n - 1) * 5]) return Infinity;
  let i = 0;
  while (i < n - 2 && y > rp[(i + 1) * 5]) i++;
  const y0 = rp[i * 5], y1 = rp[(i + 1) * 5], t = (y - y0) / (y1 - y0);
  const i0 = Math.max(0, i - 1), i3 = Math.min(n - 1, i + 2);
  const cr = (k: number) => {
    const p0 = rp[i0 * 5 + k], p1 = rp[i * 5 + k], p2 = rp[(i + 1) * 5 + k], p3 = rp[i3 * 5 + k];
    const t2 = t * t, t3 = t2 * t;
    const v = 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
    return Math.min(Math.max(v, Math.min(p1, p2) * 0.9), Math.max(p1, p2) * 1.06);
  };
  const cx = cr(1), cz = cr(2), rx = cr(3), rz = cr(4);
  const qx = (x - cx) / rx, qz = (z - cz) / rz;
  return Math.sqrt(qx * qx + qz * qz) - 1;
}

/** Signed distance (m) to the avatar; writes the outward normal into n. */
export function bodyDistance(b: Body, x: number, y: number, z: number, n: Float32Array | number[]): number {
  let best = Infinity;
  // torso
  const F = torsoF(b.rp, x, y, z);
  if (F < 0.8) {
    const e = 0.003;
    const fx1 = torsoF(b.rp, x + e, y, z), fx0 = torsoF(b.rp, x - e, y, z);
    const fz1 = torsoF(b.rp, x, y, z + e), fz0 = torsoF(b.rp, x, y, z - e);
    let fy1 = torsoF(b.rp, x, y + e, z), fy0 = torsoF(b.rp, x, y - e, z);
    if (!Number.isFinite(fy1)) fy1 = F; if (!Number.isFinite(fy0)) fy0 = F;
    const gx = (fx1 - fx0) / (2 * e), gy = (fy1 - fy0) / (2 * e), gz = (fz1 - fz0) / (2 * e);
    const gl = Math.hypot(gx, gy, gz) || 1;
    best = F / gl; n[0] = gx / gl; n[1] = gy / gl; n[2] = gz / gl;
  }
  for (const c of b.caps) {
    const abx = c.b[0] - c.a[0], aby = c.b[1] - c.a[1], abz = c.b[2] - c.a[2];
    const l2 = abx * abx + aby * aby + abz * abz;
    let t = ((x - c.a[0]) * abx + (y - c.a[1]) * aby + (z - c.a[2]) * abz) / l2;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const px = x - (c.a[0] + abx * t), py = y - (c.a[1] + aby * t), pz = z - (c.a[2] + abz * t);
    const dl = Math.hypot(px, py, pz);
    const d = dl - (c.ra + (c.rb - c.ra) * t);
    if (d < best) { best = d; const k = 1 / (dl || 1); n[0] = px * k; n[1] = py * k; n[2] = pz * k; }
  }
  const hx = x - b.head.c[0], hy = y - b.head.c[1], hz = z - b.head.c[2], hl = Math.hypot(hx, hy, hz);
  const hd = hl - b.head.r;
  if (hd < best) { best = hd; const k = 1 / (hl || 1); n[0] = hx * k; n[1] = hy * k; n[2] = hz * k; }
  return best;
}
