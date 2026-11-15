import { describe, it, expect } from 'vitest';
import { TEMPLATES, defaultParams } from '../src/core/templates/registry';
import { measurementsFor } from '../src/core/sizing/charts';
import { edgeLength } from '../src/core/pattern/piece';
import { seamReport } from '../src/core/pattern/checks';
import { SIZES, checkStructure } from './tops.test';

const bottoms = TEMPLATES.filter((t) => t.family === 'bottom');

describe('bottom templates', () => {
  it('has trousers, shorts, skirt', () => {
    expect([...new Set(bottoms.map((t) => t.category))].sort()).toEqual(['shorts', 'skirt', 'trousers']);
  });
  for (const t of bottoms) for (const sil of t.silhouettes) for (const size of SIZES) {
    it(`${t.id}/${sil.id}/${'label' in size ? size.label : ''}`, () => {
      const m = measurementsFor(size);
      const p = { ...defaultParams(t), ...sil.params };
      const out = t.build(m, p);
      checkStructure(out);
      const pom = Object.fromEntries(out.pom.map((x) => [x.id, x.value]));
      const by = new Map(out.pieces.map((x) => [x.id, x]));
      const rep = seamReport(out.pieces, out.seams);
      const wb = by.get('waistband')!;
      const waistSeams = rep.filter((r) => /^wb_\d/.test(r.seamId));
      const bandLen = edgeLength(wb, 'T0', 'T1');
      const pleats = (p.pleat ?? 0) * 4;
      expect(Math.abs(bandLen - (waistSeams.reduce((a, r) => a + r.la, 0) - pleats))).toBeLessThanOrEqual(2);
      if (t.category === 'skirt') {
        for (const r of rep) if (r.seamId.startsWith('side')) expect(Math.abs(r.la - r.lb)).toBeLessThanOrEqual(1);
        if (sil.id === 'aline' || sil.id === 'circle') expect(pom.hem).toBeGreaterThanOrEqual(pom.hip);
        if (sil.id === 'circle') expect(Math.abs(pom.waist * 2 - (m.waist + p.easeWaist))).toBeLessThanOrEqual(3);
      } else {
        for (const r of rep) if (/^(inseam|outseam)/.test(r.seamId)) expect(Math.abs(r.la - r.lb), r.seamId).toBeLessThanOrEqual(1);
        expect(Math.abs(pom.hip - (m.hip + p.easeHip) / 2)).toBeLessThanOrEqual(3);
        const f = by.get('front')!, b = by.get('back')!;
        const node = (pc: typeof f, id: string) => pc.nodes.find((n) => n.id === id)!;
        const fce = Math.abs(node(f, 'CF_HIP').x - node(f, 'CROTCH').x);
        const bce = Math.abs(node(b, 'CROTCH').x - node(b, 'CB_HIP').x);
        expect(bce).toBeGreaterThan(fce);
      }
    });
  }
});
