import type { Vec2 } from '../geometry/vec';
import { flattenPath, edgePolyline, polylineLength, bbox } from '../geometry/path';
import { offsetPolygon } from '../geometry/offset';
import type { PatternPiece } from './types';

export function piecePolygon(piece: PatternPiece, tol = 0.3): Vec2[] {
  return flattenPath(piece.nodes, tol).pts;
}
export function edgeLength(piece: PatternPiece, from: string, to: string): number {
  return polylineLength(edgePolyline(piece.nodes, from, to));
}
export function saOutline(piece: PatternPiece): Vec2[] {
  const f = flattenPath(piece.nodes, 0.5);
  const dist: number[] = [];
  let seg = -1;
  for (let i = 0; i < f.pts.length; i++) {
    if (f.nodeIdx.includes(i)) seg = f.nodeIdx.indexOf(i);
    const id = piece.nodes[seg].id;
    dist.push(piece.saEdges?.[id] ?? piece.sa);
  }
  return offsetPolygon(f.pts, dist);
}
export function pieceAnchor(piece: PatternPiece): Vec2 {
  const b = bbox(piecePolygon(piece));
  return { x: (b.minX + b.maxX) / 2, y: b.minY };
}
const mx = (v?: Vec2 | null) => (v ? { x: -v.x, y: v.y } : v);
export function mirrorPiece(piece: PatternPiece): PatternPiece {
  return {
    ...piece,
    nodes: piece.nodes.map((n) => ({ ...n, x: -n.x, hin: mx(n.hin), hout: mx(n.hout) })),
    internal: piece.internal.map((l) => ({ ...l, pts: l.pts.map((p) => ({ x: -p.x, y: p.y })) })),
    grain: -piece.grain,
  };
}
export function scalePiece(piece: PatternPiece, sx: number, sy: number): PatternPiece {
  const a = pieceAnchor(piece);
  const s = (v: Vec2) => ({ x: a.x + (v.x - a.x) * sx, y: a.y + (v.y - a.y) * sy });
  return {
    ...piece,
    nodes: piece.nodes.map((n) => ({ ...n, ...s(n), hin: n.hin ? s(n.hin) : n.hin, hout: n.hout ? s(n.hout) : n.hout })),
    internal: piece.internal.map((l) => ({ ...l, pts: l.pts.map(s) })),
  };
}
