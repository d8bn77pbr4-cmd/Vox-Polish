import type { PatternPiece } from '../core/pattern/types';
import type { RasterFrame } from '../core/model';
import { piecePolygon, pieceAnchor } from '../core/pattern/piece';
import { bbox } from '../core/geometry/path';
import type { Vec2 } from '../core/geometry/vec';

/** Outline of a piece in surface coordinates (origin = piece anchor). */
export function surfaceOutline(piece: PatternPiece): Vec2[] {
  const a = pieceAnchor(piece);
  return piecePolygon(piece).map((p) => ({ x: p.x - a.x, y: p.y - a.y }));
}
export function frameFor(minX: number, minY: number, maxX: number, maxY: number, maxPx = 2048, maxPxPerMm = 4, margin = 10): RasterFrame {
  const x0 = minX - margin, y0 = minY - margin, wm = maxX - minX + 2 * margin, hm = maxY - minY + 2 * margin;
  const pxPerMm = Math.min(maxPxPerMm, maxPx / Math.max(wm, hm));
  return { x0, y0, pxPerMm, w: Math.max(1, Math.floor(wm * pxPerMm)), h: Math.max(1, Math.floor(hm * pxPerMm)) };
}
export function surfaceFrame(piece: PatternPiece, maxPx = 2048, maxPxPerMm = 4): RasterFrame {
  const b = bbox(surfaceOutline(piece));
  return frameFor(b.minX, b.minY, b.maxX, b.maxY, maxPx, maxPxPerMm);
}
export function toUV(f: RasterFrame, x: number, y: number): [number, number] {
  return [((x - f.x0) * f.pxPerMm) / f.w, 1 - ((y - f.y0) * f.pxPerMm) / f.h];
}
