import type { Vec2 } from '../geometry/vec';
import { widthAtY } from '../geometry/path';
import { piecePolygon, pieceAnchor } from '../pattern/piece';
import type { Instance } from '../resolve';
import type { Body, V3, ZoneFrame } from './body';

const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

export function zoneFor(body: Body, zone: string, side: 'C' | 'L' | 'R'): ZoneFrame | null {
  if (zone === 'arm' || zone === 'legFront' || zone === 'legBack') return body.zones[zone + (side === 'R' ? 'R' : 'L')];
  return body.zones[zone] ?? null;
}

/** Wraps instance-local 2D points (mm) around the avatar; returns 3D positions in metres. */
export function placeInstance(pts: Vec2[], inst: Instance, body: Body, gap: number): Float32Array {
  const pc = inst.piece, pl = pc.placement;
  const out = new Float32Array(pts.length * 3);
  const Z = zoneFor(body, pl.zone, inst.side);
  if (!Z) return out;
  const poly = piecePolygon(pc, 1), anchor = pieceAnchor(pc);
  const sign = inst.side === 'R' ? -1 : 1;
  const ang = (((pl.angle ?? 0) * sign) * Math.PI) / 180;
  const wrap = pl.wrap ?? 0.5, drop = (pl.drop ?? 0) / 1000, radd = (pl.radiusAdd ?? 0) / 1000;
  const d = Z.d, f0 = Z.f, s0 = cross(f0, d);
  const f: V3 = [f0[0] * Math.cos(ang) + s0[0] * Math.sin(ang), f0[1] * Math.cos(ang) + s0[1] * Math.sin(ang), f0[2] * Math.cos(ang) + s0[2] * Math.sin(ang)];
  const s = cross(f, d);
  const rowCache = new Map<number, { xc: number; w: number }>();
  const row = (y: number) => {
    const k = Math.round(y);
    let r = rowCache.get(k);
    if (!r) { const e = widthAtY(poly, k) ?? widthAtY(poly, y) ?? { minX: -1, maxX: 1 }; r = { xc: (e.minX + e.maxX) / 2, w: Math.max(2, e.maxX - e.minX) }; rowCache.set(k, r); }
    return r;
  };
  const mode = pl.mode ?? (pl.zone === 'head' ? 'sphere' : 'cyl');
  const put = (i: number, p: V3) => { out[i * 3] = p[0]; out[i * 3 + 1] = p[1]; out[i * 3 + 2] = p[2]; };
  for (let i = 0; i < pts.length; i++) {
    const { x, y } = pts[i];
    if (pl.zone === 'scarf') {
      // middle of the scarf loops around the neck, the ends hang down in front
      const L = Math.max(...poly.map((q) => q.y)), c = L / 2;
      const Rr = body.neckR + 0.05 + gap, ringLen = 2 * Math.PI * Rr * 0.92;
      const u = y - c, a = (u / 1000) / Rr;
      const hgt = body.hpsY + 0.015 - ((x - Math.min(...poly.map((q) => q.x))) / 1000) * 0.35;
      if (Math.abs(u / 1000) <= ringLen / 2) put(i, [Math.sin(a) * Rr, hgt, -Math.cos(a) * Rr]);
      else {
        const sg = Math.sign(u), rest = Math.abs(u / 1000) - ringLen / 2, a1 = sg * (ringLen / 2) / Rr;
        put(i, [Math.sin(a1) * Rr + sg * 0.03, hgt - rest, -Math.cos(a1) * Rr + 0.02]);
      }
      continue;
    }
    if (mode === 'radial') {
      const dx = x - anchor.x, dy = y - anchor.y, rad = Math.hypot(dx, dy) / 1000;
      const rw = Math.min(...poly.map((q) => Math.hypot(q.x - anchor.x, q.y - anchor.y))) / 1000;
      const th = Math.atan2(dx, dy) * 2 * wrap + ang * 0;
      const along = (rad - rw) * 0.75, r = rw + gap + radd + (rad - rw) * 0.55;
      const dir: V3 = [f[0] * Math.cos(th) + s[0] * Math.sin(th), f[1] * Math.cos(th) + s[1] * Math.sin(th), f[2] * Math.cos(th) + s[2] * Math.sin(th)];
      put(i, [Z.A[0] + d[0] * along + dir[0] * r, Z.A[1] + d[1] * along + dir[1] * r, Z.A[2] + d[2] * along + dir[2] * r]);
      continue;
    }
    const rw = row(y);
    const th = ((x - rw.xc) / rw.w) * 2 * Math.PI * wrap;
    const dir: V3 = [f[0] * Math.cos(th) + s[0] * Math.sin(th), f[1] * Math.cos(th) + s[1] * Math.sin(th), f[2] * Math.cos(th) + s[2] * Math.sin(th)];
    const along = (y - anchor.y) / 1000 + drop;
    if (mode === 'sphere' && Z.C && Z.R) {
      const R0 = Z.R + gap + radd, phi = Math.min(Math.PI * 0.92, along / R0);
      const up: V3 = [-d[0], -d[1], -d[2]], rr = R0 * Math.sin(phi);
      put(i, [Z.C[0] + up[0] * R0 * Math.cos(phi) + dir[0] * rr, Z.C[1] + up[1] * R0 * Math.cos(phi) + dir[1] * rr, Z.C[2] + up[2] * R0 * Math.cos(phi) + dir[2] * rr]);
      continue;
    }
    const r = rw.w / 1000 / (2 * Math.PI * wrap) + gap + radd;
    const A = mode === 'cyl' && pl.zone === 'head' && Z.C ? [Z.C[0], (Z.C[1] + (Z.R ?? 0.09)) + 0.03, Z.C[2]] as V3 : Z.A;
    put(i, [A[0] + d[0] * along + dir[0] * r, A[1] + d[1] * along + dir[1] * r, A[2] + d[2] * along + dir[2] * r]);
  }
  return out;
}
