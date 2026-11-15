import type { Vec2 } from '../geometry/vec';
import type { PathNode } from '../geometry/path';
import { segmentPoints } from '../geometry/path';
import type { PatternPiece, Zone } from './types';
import { uid } from '../model';

const lerp = (a: Vec2, b: Vec2, t: number): Vec2 => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
const at = (n: PathNode): Vec2 => ({ x: n.x, y: n.y });

/** Splits segment seg (node seg → seg+1) at parameter t. Cubic segments are split exactly (de Casteljau). */
export function insertNode(p: PatternPiece, seg: number, t: number): PatternPiece {
  const nodes = p.nodes.map((n) => ({ ...n }));
  const a = nodes[seg], b = nodes[(seg + 1) % nodes.length];
  const id = uid('n');
  let nn: PathNode;
  if (!a.hout && !b.hin) nn = { id, ...lerp(at(a), at(b), t), hin: null, hout: null };
  else {
    const p0 = at(a), p1 = a.hout ?? p0, p2 = b.hin ?? at(b), p3 = at(b);
    const q0 = lerp(p0, p1, t), q1 = lerp(p1, p2, t), q2 = lerp(p2, p3, t);
    const r0 = lerp(q0, q1, t), r1 = lerp(q1, q2, t), s = lerp(r0, r1, t);
    a.hout = q0; b.hin = q2;
    nn = { id, x: s.x, y: s.y, hin: r0, hout: r1, smooth: true };
  }
  nodes.splice(seg + 1, 0, nn);
  return { ...p, nodes };
}
export function deleteNode(p: PatternPiece, id: string): PatternPiece {
  if (p.nodes.length <= 3) return p;
  return { ...p, nodes: p.nodes.filter((n) => n.id !== id) };
}
export function toggleCurve(p: PatternPiece, id: string): PatternPiece {
  const i = p.nodes.findIndex((n) => n.id === id);
  if (i < 0) return p;
  const nodes = p.nodes.map((n) => ({ ...n }));
  const n = nodes[i];
  if (n.hin || n.hout) { n.hin = null; n.hout = null; n.smooth = false; }
  else {
    const prev = nodes[(i - 1 + nodes.length) % nodes.length], next = nodes[(i + 1) % nodes.length];
    const dx = (next.x - prev.x) / 6, dy = (next.y - prev.y) / 6;
    n.hin = { x: n.x - dx, y: n.y - dy }; n.hout = { x: n.x + dx, y: n.y + dy }; n.smooth = true;
  }
  return { ...p, nodes };
}
export function moveNodes(p: PatternPiece, ids: string[], dx: number, dy: number): PatternPiece {
  const set = new Set(ids);
  const mv = (v?: Vec2 | null) => (v ? { x: v.x + dx, y: v.y + dy } : v);
  return { ...p, nodes: p.nodes.map((n) => (set.has(n.id) ? { ...n, x: n.x + dx, y: n.y + dy, hin: mv(n.hin), hout: mv(n.hout) } : n)) };
}
export function setHandle(p: PatternPiece, id: string, which: 'hin' | 'hout', pos: Vec2, keepSmooth: boolean): PatternPiece {
  return { ...p, nodes: p.nodes.map((n) => {
    if (n.id !== id) return n;
    const out = { ...n, [which]: pos };
    const other = which === 'hin' ? 'hout' : 'hin';
    const o = n[other];
    if (keepSmooth && n.smooth && o) {
      const l = Math.hypot(o.x - n.x, o.y - n.y), d = Math.hypot(pos.x - n.x, pos.y - n.y) || 1;
      out[other] = { x: n.x - ((pos.x - n.x) / d) * l, y: n.y - ((pos.y - n.y) / d) * l };
    }
    return out;
  }) };
}
export function setNodePos(p: PatternPiece, id: string, x: number, y: number): PatternPiece {
  const n = p.nodes.find((q) => q.id === id);
  return n ? moveNodes(p, [id], x - n.x, y - n.y) : p;
}
/** Nearest point on the outline: segment index, parameter t (by arc length), distance. */
export function nearestOnOutline(p: PatternPiece, q: Vec2): { seg: number; t: number; dist: number; pt: Vec2 } {
  let best = { seg: 0, t: 0, dist: Infinity, pt: q };
  for (let i = 0; i < p.nodes.length; i++) {
    const pts = [at(p.nodes[i]), ...segmentPoints(p.nodes, i, 0.3)];
    const lens = [0];
    for (let k = 1; k < pts.length; k++) lens.push(lens[k - 1] + Math.hypot(pts[k].x - pts[k - 1].x, pts[k].y - pts[k - 1].y));
    const L = lens[lens.length - 1] || 1;
    for (let k = 1; k < pts.length; k++) {
      const a = pts[k - 1], b = pts[k], dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy;
      const u = l2 ? Math.max(0, Math.min(1, ((q.x - a.x) * dx + (q.y - a.y) * dy) / l2)) : 0;
      const pt = { x: a.x + dx * u, y: a.y + dy * u }, d = Math.hypot(q.x - pt.x, q.y - pt.y);
      if (d < best.dist) {
        const sArc = lens[k - 1] + Math.sqrt(l2) * u;
        // map arc fraction to bezier t approximately (flattening is uniform in t)
        const tt = (k - 1 + u) / (pts.length - 1);
        best = { seg: i, t: p.nodes[i].hout || p.nodes[(i + 1) % p.nodes.length].hin ? tt : sArc / L, dist: d, pt };
      }
    }
  }
  return best;
}
export function mirrorPartner(p: PatternPiece, id: string): string | null {
  const n = p.nodes.find((q) => q.id === id);
  if (!n || Math.abs(n.x) < 0.5) return null;
  const m = p.nodes.find((q) => q.id !== id && Math.abs(q.x + n.x) < 0.5 && Math.abs(q.y - n.y) < 0.5);
  return m?.id ?? null;
}
export function makeCustomPiece(pts: Vec2[], name: string, zone: Zone): PatternPiece {
  const id = uid('c_');
  return {
    id, name, nodes: pts.map((q, i) => ({ id: `${id}_${i}`, x: q.x, y: q.y, hin: null, hout: null })),
    grain: 0, internal: [], notches: [], sa: 10, cut: { count: 1 },
    placement: { zone, wrap: zone === 'arm' ? 1 : zone === 'none' ? undefined : 0.5 },
  };
}
