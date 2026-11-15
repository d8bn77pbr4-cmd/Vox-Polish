import type { PathNode } from '../geometry/path';
import type { Vec2 } from '../geometry/vec';
import type { PatternPiece, Seam, ParamDef } from '../pattern/types';
import { edgeLength } from '../pattern/piece';

export const P = (x: number, y: number): Vec2 => ({ x, y });
export function nd(id: string, x: number, y: number, hin?: Vec2 | null, hout?: Vec2 | null): PathNode {
  return { id, x, y, hin: hin ?? null, hout: hout ?? null };
}
export const mir = (v: Vec2): Vec2 => ({ x: -v.x, y: v.y });

type End = [piece: string, side: 'L' | 'R' | undefined, from: string, to: string];

/** Seam from physical correspondence a.from↔b.from, a.to↔b.to; each edge takes the arc with fewer intermediate nodes. */
export function join(id: string, a: End, b: End, pieces: PatternPiece[], extra: Partial<Seam> = {}): Seam {
  const ref = (e: End) => {
    const p = pieces.find((x) => x.id === e[0]);
    if (!p) throw new Error(`${id}: no piece ${e[0]}`);
    const i = p.nodes.findIndex((n) => n.id === e[2]), j = p.nodes.findIndex((n) => n.id === e[3]);
    if (i < 0 || j < 0) throw new Error(`${id}: node missing in ${e[0]}: ${e[2]}/${e[3]}`);
    const n = p.nodes.length, fw = (j - i + n) % n, bw = n - fw;
    if (fw === bw) throw new Error(`${id}: ambiguous arc`);
    const rev = bw < fw;
    return { r: { piece: e[0], side: e[1], from: rev ? e[3] : e[2], to: rev ? e[2] : e[3] }, rev, p };
  };
  const A = ref(a), B = ref(b);
  const seam: Seam = { id, a: A.r, b: B.r, flip: A.rev !== B.rev, ...extra };
  if (extra.kind === 'rib' || extra.kind === 'gather') {
    seam.ease = edgeLength(B.p, B.r.from, B.r.to) - edgeLength(A.p, A.r.from, A.r.to);
  }
  return seam;
}

export function piece(id: string, name: string, nodes: PathNode[], o: Partial<PatternPiece> & Pick<PatternPiece, 'placement'>): PatternPiece {
  return { id, name, nodes, grain: 0, internal: [], notches: [], sa: 10, cut: { count: 1 }, ...o };
}
export const pd = (key: string, label: string, def: number, min: number, max: number, group: string, step = 5, unit: ParamDef['unit'] = 'mm'): ParamDef =>
  ({ key, label, default: def, min, max, step, unit, group });

/** Scales a cubic-length function's parameter so that len(x) hits target. */
export function solveLen(f: (x: number) => number, target: number, x0: number): number {
  let x = x0;
  for (let i = 0; i < 12; i++) {
    const l = f(x);
    if (Math.abs(l - target) < 0.05) break;
    x *= target / l;
  }
  return x;
}
