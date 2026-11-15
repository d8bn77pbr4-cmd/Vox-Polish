import { describe, it, expect } from 'vitest';
import { TEMPLATES, defaultParams } from '../src/core/templates/registry';
import { measurementsFor, type SizeSpec } from '../src/core/sizing/charts';
import { piecePolygon, edgeLength } from '../src/core/pattern/piece';
import { seamReport } from '../src/core/pattern/checks';
import type { PatternPiece, TemplateOutput } from '../src/core/pattern/types';
import type { Vec2 } from '../src/core/geometry/vec';

export const SIZES: SizeSpec[] = [
  { system: 'womenEU', label: '32' }, { system: 'womenEU', label: '38' }, { system: 'womenEU', label: '48' },
  { system: 'menEU', label: '44' }, { system: 'menEU', label: '58' },
];

function segsIntersect(a: Vec2, b: Vec2, c: Vec2, d: Vec2) {
  const o = (p: Vec2, q: Vec2, r: Vec2) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  return o(a, b, c) * o(a, b, d) < 0 && o(c, d, a) * o(c, d, b) < 0;
}
export function selfIntersects(poly: Vec2[]) {
  const n = poly.length;
  for (let i = 0; i < n; i++) for (let j = i + 2; j < n; j++) {
    if (i === 0 && j === n - 1) continue;
    if (segsIntersect(poly[i], poly[(i + 1) % n], poly[j], poly[(j + 1) % n])) return true;
  }
  return false;
}
export function checkStructure(out: TemplateOutput) {
  const byId = new Map<string, PatternPiece>(out.pieces.map((p) => [p.id, p]));
  for (const p of out.pieces) {
    for (const nd of p.nodes) { expect(Number.isFinite(nd.x) && Number.isFinite(nd.y)).toBe(true); }
    expect(selfIntersects(piecePolygon(p)), `${p.id} self-intersects`).toBe(false);
  }
  for (const s of out.seams) for (const e of [s.a, s.b]) {
    const p = byId.get(e.piece);
    expect(p, `seam ${s.id} piece ${e.piece}`).toBeTruthy();
    expect(p!.nodes.some((n) => n.id === e.from), `${s.id} ${e.from}`).toBe(true);
    expect(p!.nodes.some((n) => n.id === e.to), `${s.id} ${e.to}`).toBe(true);
    if (p!.cut.count === 2) expect(e.side === 'L' || e.side === 'R').toBe(true);
  }
  for (const pm of out.pom) expect(Number.isFinite(pm.value)).toBe(true);
}

const tops = TEMPLATES.filter((t) => t.family === 'top');

describe('top templates', () => {
  it('has all top categories', () => {
    expect([...new Set(tops.map((t) => t.category))].sort()).toEqual(['dress', 'hoodie', 'jacket', 'longsleeve', 'sweatshirt', 'tank', 'tshirt']);
  });
  for (const t of tops) for (const sil of t.silhouettes) for (const size of SIZES) {
    it(`${t.id}/${sil.id}/${'label' in size ? size.label : ''}`, () => {
      const m = measurementsFor(size);
      const p = { ...defaultParams(t), ...sil.params };
      const out = t.build(m, p);
      checkStructure(out);
      const pom = Object.fromEntries(out.pom.map((x) => [x.id, x.value]));
      expect(Math.abs(pom.chest - (m.chest + p.easeChest) / 2)).toBeLessThanOrEqual(2);
      const byId = new Map(out.pieces.map((x) => [x.id, x]));
      const rep = seamReport(out.pieces, out.seams);
      for (const r of rep) {
        if (/^(side|shoulder|underarm)/.test(r.seamId)) expect(Math.abs(r.la - r.lb), r.seamId).toBeLessThanOrEqual(1);
        if (/^armhole/.test(r.seamId)) expect(Math.abs(r.diff - r.expected), r.seamId).toBeLessThanOrEqual(3);
      }
      if (byId.has('sleeve')) {
        const s = byId.get('sleeve')!;
        const cap = edgeLength(s, 'CAP_F', 'CAP_TOP') + edgeLength(s, 'CAP_TOP', 'CAP_B');
        const arm = rep.filter((r) => r.seamId.startsWith('armhole') && r.seamId.endsWith('_L')).reduce((a, r) => a + r.la, 0);
        expect(cap - arm).toBeGreaterThanOrEqual(0);
        expect(cap - arm).toBeLessThanOrEqual(15);
      }
    });
  }
});
