import { describe, it, expect } from 'vitest';
import { newProject, newGarment } from '../src/core/model';
import { resolveGarment, surfaceFor, linkedFrom } from '../src/core/resolve';
import { measurementsFor } from '../src/core/sizing/charts';
import { bbox } from '../src/core/geometry/path';
import { piecePolygon } from '../src/core/pattern/piece';

describe('resolve', () => {
  const pr = newProject('Test', 'women');
  it('hoodie instances include L/R sleeves and centre front', () => {
    const g = newGarment('hoodie', 'regular', pr);
    const keys = resolveGarment(g).instances.map((i) => i.key);
    expect(keys).toContain('sleeve:L'); expect(keys).toContain('sleeve:R'); expect(keys).toContain('front:C');
    expect(Object.keys(g.surfaces)).toEqual(expect.arrayContaining(keys));
    const r = resolveGarment(g).instances.find((i) => i.key === 'sleeve:R')!;
    const l = resolveGarment(g).instances.find((i) => i.key === 'sleeve:L')!;
    expect(r.piece.nodes[1].x).toBeCloseTo(-l.piece.nodes[1].x);
  });
  it('detached piece grades proportionally with chest', () => {
    const g = newGarment('tshirt', 'classic', pr);
    const res = resolveGarment(g);
    const front = res.pieces.find((p) => p.id === 'front')!;
    g.overrides = { front };
    g.baseMeasurements = res.m;
    const w38 = bbox(piecePolygon(resolveGarment(g).pieces.find((p) => p.id === 'front')!));
    g.size = { system: 'womenEU', label: '44' };
    const w44 = bbox(piecePolygon(resolveGarment(g).pieces.find((p) => p.id === 'front')!));
    const ratio = measurementsFor(g.size).chest / measurementsFor({ system: 'womenEU', label: '38' }).chest;
    expect((w44.maxX - w44.minX) / (w38.maxX - w38.minX)).toBeCloseTo(ratio, 3);
  });
  it('custom seam to a missing node becomes a warning', () => {
    const g = newGarment('tshirt', 'classic', pr);
    g.customSeams = [{ id: 'x', a: { piece: 'front', from: 'NOPE', to: 'UA_L' }, b: { piece: 'back', from: 'UA_L', to: 'HEM_L' } }];
    const r = resolveGarment(g);
    expect(r.warnings.length).toBe(1);
    expect(r.seams.find((s) => s.id === 'x')).toBeUndefined();
  });
  it('linked sides return the left surface for the right instance', () => {
    const g = newGarment('sneaker', 'court', pr);
    expect(g.linkSides).toBe(true);
    expect(surfaceFor(g, 'vamp:R')).toBe(g.surfaces['vamp:L']);
    expect(linkedFrom(g, 'vamp:R')).toBe('vamp:L');
    g.linkSides = false;
    expect(surfaceFor(g, 'vamp:R')).toBe(g.surfaces['vamp:R']);
  });
});
