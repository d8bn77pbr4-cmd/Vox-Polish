import { describe, it, expect } from 'vitest';
import { surfaceFrame, toUV } from '../src/render2d/frame';
import { Stroke } from '../src/render2d/brush';
import { getTemplate, defaultParams } from '../src/core/templates/registry';
import { defaultAvatar } from '../src/core/sizing/charts';

describe('render2d', () => {
  it('surface frame respects texture limits', () => {
    const t = getTemplate('tshirt');
    const front = t.build(defaultAvatar('men'), defaultParams(t)).pieces[0];
    const f = surfaceFrame(front);
    expect(f.w).toBeLessThanOrEqual(2048); expect(f.h).toBeLessThanOrEqual(2048);
    expect(f.pxPerMm).toBeLessThanOrEqual(4);
    expect(toUV(f, f.x0, f.y0)).toEqual([0, 1]);
    const [u, v] = toUV(f, f.x0 + f.w / f.pxPerMm, f.y0 + f.h / f.pxPerMm);
    expect(u).toBeCloseTo(1); expect(v).toBeCloseTo(0);
  });
  it('places dabs at the configured spacing', () => {
    let n = 0;
    const s = new Stroke(null, { brush: 'ink', size: 10, opacity: 1, hardness: 1, flow: 1, spacing: 0.25, smoothing: 0 }, '#000', { dab: () => { n++; } });
    s.add({ x: 0, y: 0, pressure: 1 });
    for (let x = 5; x <= 100; x += 5) s.add({ x, y: 0, pressure: 1 });
    const r = s.end();
    expect(Math.abs(n - 40)).toBeLessThanOrEqual(1);
    expect(r.w).toBeGreaterThanOrEqual(100);
  });
});
