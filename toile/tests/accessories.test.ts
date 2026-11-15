import { describe, it, expect } from 'vitest';
import { TEMPLATES, defaultParams, getTemplate } from '../src/core/templates/registry';
import { measurementsFor, defaultAvatar } from '../src/core/sizing/charts';
import { edgeLength, piecePolygon } from '../src/core/pattern/piece';
import { seamReport } from '../src/core/pattern/checks';
import { buildLast } from '../src/core/templates/sneakerLast';
import { distToPolygon, pointInPolygon } from '../src/core/geometry/path';
import { SIZES, checkStructure } from './tops.test';

const acc = TEMPLATES.filter((t) => t.family === 'accessory');

describe('accessory templates', () => {
  it('has beanie, scarf, belt, sneaker', () => {
    expect(acc.map((t) => t.category).sort()).toEqual(['beanie', 'belt', 'scarf', 'sneaker']);
  });
  for (const t of acc) for (const sil of t.silhouettes) for (const size of SIZES) {
    it(`${t.id}/${sil.id}/${'label' in size ? size.label : ''} structure`, () => {
      const m = measurementsFor(size);
      checkStructure(t.build(m, { ...defaultParams(t), ...sil.params }));
    });
  }
  it('beanie gores sum to head + ease, adjacent gore seams equal', () => {
    const t = getTemplate('beanie'); const m = defaultAvatar('women');
    for (const sil of t.silhouettes) {
      const p = { ...defaultParams(t), ...sil.params };
      const out = t.build(m, p);
      const gores = out.pieces.filter((x) => x.id.startsWith('gore'));
      expect(gores).toHaveLength(6);
      const sum = gores.reduce((a, g) => a + edgeLength(g, 'BR', 'BL'), 0);
      expect(Math.abs(sum - (m.head + p.easeHead))).toBeLessThanOrEqual(2);
      for (const r of seamReport(out.pieces, out.seams)) if (r.seamId.startsWith('gore')) expect(Math.abs(r.la - r.lb)).toBeLessThanOrEqual(1);
    }
  });
  it('belt strap length = waist + extra', () => {
    const t = getTemplate('belt'); const m = defaultAvatar('men');
    const p: Record<string, number> = { ...defaultParams(t), position: 0 };
    const strap = t.build(m, p).pieces.find((x) => x.id === 'strap')!;
    const xs = strap.nodes.map((n) => n.x);
    expect(Math.abs(Math.max(...xs) - Math.min(...xs) - (m.waist + p.extra))).toBeLessThanOrEqual(1);
  });
  it('sneaker panels lie on the flattened last', () => {
    const t = getTemplate('sneaker'); const m = defaultAvatar('women'); const p = defaultParams(t);
    const last = buildLast(m, p);
    const out = t.build(m, p);
    for (const id of ['vamp', 'quarterLat', 'quarterMed', 'tongue', 'heel']) {
      const pc = out.pieces.find((x) => x.id === id)!;
      for (const pt of piecePolygon(pc)) {
        expect(pointInPolygon(pt, last.domain) || distToPolygon(pt, last.domain) <= 1, `${id} ${pt.x},${pt.y}`).toBe(true);
      }
    }
  });
  it('flattening keeps neighbour distances within 8 %', () => {
    const last = buildLast(defaultAvatar('men'), defaultParams(getTemplate('sneaker')));
    const { NS, NT } = last;
    let checked = 0;
    for (let i = 1; i < NS; i++) for (let j = 0; j < NT; j += 4) {
      const a = last.P(i - 1, j), b = last.P(i, j);
      const d3 = Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
      if (d3 < 0.5) continue;
      const fa = last.F(i - 1, j), fb = last.F(i, j);
      const d2 = Math.hypot(fa.x - fb.x, fa.y - fb.y);
      expect(Math.abs(d2 - d3) / d3).toBeLessThan(0.08);
      checked++;
    }
    expect(checked).toBeGreaterThan(500);
  });
});
