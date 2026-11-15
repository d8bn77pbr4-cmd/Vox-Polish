import type { PatternPiece, Seam } from './types';
import { edgeLength } from './piece';

export interface SeamCheck { seamId: string; la: number; lb: number; diff: number; expected: number; status: 'ok' | 'warn' | 'bad' }

export function seamReport(pieces: PatternPiece[], seams: Seam[]): SeamCheck[] {
  const byId = new Map(pieces.map((p) => [p.id, p]));
  const out: SeamCheck[] = [];
  for (const s of seams) {
    const pa = byId.get(s.a.piece), pb = byId.get(s.b.piece);
    if (!pa || !pb) continue;
    try {
      const la = edgeLength(pa, s.a.from, s.a.to), lb = edgeLength(pb, s.b.from, s.b.to);
      const diff = lb - la, expected = s.ease ?? 0, dev = Math.abs(diff - expected);
      out.push({ seamId: s.id, la, lb, diff, expected, status: dev <= 2 ? 'ok' : dev <= 6 ? 'warn' : 'bad' });
    } catch { /* missing nodes are reported by resolve */ }
  }
  return out;
}
