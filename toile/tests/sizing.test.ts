import { describe, it, expect } from 'vitest';
import { measurementsFor, defaultAvatar, SIZE_SYSTEMS, intLabel } from '../src/core/sizing/charts';
import { proportionalScale } from '../src/core/sizing/grading';
import { MEASUREMENT_KEYS } from '../src/core/sizing/measurements';

describe('size charts', () => {
  it('womenEU 38 chest is 880', () => {
    expect(measurementsFor({ system: 'womenEU', label: '38' }).chest).toBe(880);
  });
  it('women chest steps 40 mm up to 40, then 50 mm', () => {
    const labels = SIZE_SYSTEMS.womenEU.labels;
    for (let i = 1; i < labels.length; i++) {
      const d = measurementsFor({ system: 'womenEU', label: labels[i] }).chest - measurementsFor({ system: 'womenEU', label: labels[i - 1] }).chest;
      expect(d).toBe(Number(labels[i]) <= 40 ? 40 : 50);
    }
  });
  it('menEU 50 → 52 adds 40 mm chest', () => {
    expect(measurementsFor({ system: 'menEU', label: '52' }).chest - measurementsFor({ system: 'menEU', label: '50' }).chest).toBe(40);
  });
  it('all values finite and non-decreasing with size', () => {
    for (const sys of ['womenEU', 'menEU'] as const) {
      const ls = SIZE_SYSTEMS[sys].labels;
      for (let i = 0; i < ls.length; i++) {
        const m = measurementsFor({ system: sys, label: ls[i] });
        for (const k of MEASUREMENT_KEYS) {
          expect(Number.isFinite(m[k])).toBe(true);
          if (i > 0) expect(m[k]).toBeGreaterThanOrEqual(measurementsFor({ system: sys, label: ls[i - 1] })[k]);
        }
      }
    }
  });
  it('custom size returns its own measurements, INT labels map', () => {
    const m = defaultAvatar('men');
    expect(measurementsFor({ system: 'custom', m })).toEqual(m);
    expect(intLabel('womenEU', '38')).toBe('M');
    expect(intLabel('menEU', '50')).toBe('L');
  });
});

describe('grading', () => {
  it('identity is 1/1, chest ratio drives x', () => {
    const a = defaultAvatar('women');
    expect(proportionalScale(a, a, { x: 'chest', y: 'height' })).toEqual({ sx: 1, sy: 1 });
    const b = { ...a, chest: a.chest * 1.1 };
    expect(proportionalScale(a, b, { x: 'chest', y: 'height' }).sx).toBeCloseTo(1.1);
  });
});
