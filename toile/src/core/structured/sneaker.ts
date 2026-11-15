import type { Measurements } from '../sizing/measurements';
import type { Vec2 } from '../geometry/vec';
import { pointInPolygon } from '../geometry/path';
import { buildLast, type LastModel } from '../templates/sneakerLast';
import { sneakerPanels } from '../templates/accessories';
import type { MeshData } from './belt';

/** Builds upper (atlas uv in flat coords), tongue, sole meshes and lace path; all in mm, shoe-local (x lateral, y up, z forward). */
export function sneakerGeometry(m: Measurements, p: Record<string, number>) {
  const L: LastModel = buildLast(m, p);
  const panels = sneakerPanels(L, p);
  const soleH = L.soleH, lift = soleH - 12;
  const { NS, NT } = L;
  const normals = new Float32Array(NS * NT * 3);
  // approximate outward normals by finite differences on the grid
  for (let i = 0; i < NS; i++) for (let j = 0; j < NT; j++) {
    const a = L.P(Math.min(NS - 1, i + 1), j), b = L.P(Math.max(0, i - 1), j), c = L.P(i, Math.min(NT - 1, j + 1)), d = L.P(i, Math.max(0, j - 1));
    const du = [a[0] - b[0], a[1] - b[1], a[2] - b[2]], dv = [c[0] - d[0], c[1] - d[1], c[2] - d[2]];
    let nx = du[1] * dv[2] - du[2] * dv[1], ny = du[2] * dv[0] - du[0] * dv[2], nz = du[0] * dv[1] - du[1] * dv[0];
    const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
    const P0 = L.P(i, j); if (nx * P0[0] + ny * (P0[1] - 20) < 0) { nx = -nx; ny = -ny; nz = -nz; }
    normals.set([nx, ny, nz], (i * NT + j) * 3);
  }
  const region = (keep: (c: Vec2) => boolean, offset: number): MeshData & { flat: Float32Array } => {
    const P: number[] = [], F: number[] = [], I: number[] = [];
    const map = new Int32Array(NS * NT).fill(-1);
    const vid = (i: number, j: number) => {
      const k = i * NT + j;
      if (map[k] < 0) { const q = L.P(i, j), f = L.F(i, j), n = normals.subarray(k * 3, k * 3 + 3); map[k] = P.length / 3; P.push(q[0] + n[0] * offset, q[1] + lift + n[1] * offset, q[2] + n[2] * offset); F.push(f.x, f.y); }
      return map[k];
    };
    for (let i = 0; i < NS - 1; i++) for (let j = 0; j < NT - 1; j++) {
      const f = [L.F(i, j), L.F(i + 1, j), L.F(i + 1, j + 1), L.F(i, j + 1)];
      const c1 = { x: (f[0].x + f[1].x + f[2].x) / 3, y: (f[0].y + f[1].y + f[2].y) / 3 }, c2 = { x: (f[0].x + f[2].x + f[3].x) / 3, y: (f[0].y + f[2].y + f[3].y) / 3 };
      if (keep(c1)) I.push(vid(i, j), vid(i + 1, j), vid(i + 1, j + 1));
      if (keep(c2)) I.push(vid(i, j), vid(i + 1, j + 1), vid(i, j + 1));
    }
    return { positions: Float32Array.from(P), uvs: new Float32Array(P.length / 3 * 2), indices: Uint32Array.from(I), flat: Float32Array.from(F) };
  };
  const upper = region((c) => !pointInPolygon(c, L.opening), 0);
  const tongue = region((c) => pointInPolygon(c, panels.tongue), -1.5);
  // sole: extrude outline
  const out = L.soleOutline.map((q) => ({ x: q.x, z: q.y }));
  const SP: number[] = [], SI: number[] = [], SF: number[] = [];
  const n = out.length;
  const cx = out.reduce((a, q) => a + q.x, 0) / n, cz = out.reduce((a, q) => a + q.z, 0) / n;
  for (const [y, inset] of [[0, 0], [2, 0], [soleH, 2]] as const) for (const q of out) {
    const dx = q.x - cx, dz = q.z - cz, l = Math.hypot(dx, dz) || 1;
    SP.push(q.x - (dx / l) * inset, y, q.z - (dz / l) * inset); SF.push(q.x, q.z);
  }
  SP.push(cx, 0, cz); SF.push(cx, cz); SP.push(cx, soleH, cz); SF.push(cx, cz);
  const cBot = n * 3, cTop = n * 3 + 1;
  for (let i = 0; i < n; i++) {
    const a = i, b = (i + 1) % n;
    SI.push(cBot, b, a);
    SI.push(a, b, n + b, a, n + b, n + a);
    SI.push(n + a, n + b, 2 * n + b, n + a, 2 * n + b, 2 * n + a);
    SI.push(cTop, 2 * n + a, 2 * n + b);
  }
  const sole = { positions: Float32Array.from(SP), uvs: new Float32Array(SP.length / 3 * 2), indices: Uint32Array.from(SI), flat: Float32Array.from(SF) };
  // laces: criss-cross between eyelets
  const nE = Math.round(p.eyelets ?? 5);
  const eyes: { lat: number[]; med: number[] }[] = [];
  for (let k = 0; k < nE; k++) {
    const s = L.sC + 0.03 + ((L.sT - L.sC - 0.07) * k) / Math.max(1, nE - 1);
    const t = (L.openT(s) ?? 0.55) + 0.035;
    const pl = L.surface(s, t), pm = L.surface(s, 1 - t);
    eyes.push({ lat: [pl[0], pl[1] + lift + 3, pl[2]], med: [pm[0], pm[1] + lift + 3, pm[2]] });
  }
  const lace: number[][] = [];
  for (let k = nE - 1; k > 0; k--) { lace.push(eyes[k].lat, eyes[k - 1].med); }
  const lace2: number[][] = [];
  for (let k = nE - 1; k > 0; k--) { lace2.push(eyes[k].med, eyes[k - 1].lat); }
  return { last: L, panels, upper, tongue, sole, laces: [lace, lace2, [eyes[0].lat, eyes[0].med]], eyes, lift };
}
