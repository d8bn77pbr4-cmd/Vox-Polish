import type { Measurements, Profile } from './measurements';
import { MEASUREMENT_KEYS } from './measurements';

export type SizeSystem = 'womenEU' | 'menEU';
export type SizeSpec = { system: SizeSystem; label: string } | { system: 'custom'; m: Measurements };

interface Chart { name: string; labels: string[]; base: string; m: Measurements; step: Measurements; stepLarge: Measurements; largeFrom: number; int: string[] }

const W_BASE: Measurements = { height: 1680, chest: 880, waist: 720, hip: 970, neck: 350, shoulder: 380, backLength: 410, armLength: 600, bicep: 280, wrist: 160, inseam: 790, rise: 270, thigh: 560, knee: 370, head: 560, footLength: 245, footWidth: 92 };
const W_STEP: Measurements = { height: 0, chest: 40, waist: 40, hip: 40, neck: 10, shoulder: 10, backLength: 3, armLength: 2, bicep: 15, wrist: 4, inseam: 0, rise: 5, thigh: 25, knee: 10, head: 3, footLength: 5, footWidth: 2 };
const W_LARGE: Measurements = { ...W_STEP, chest: 50, waist: 50, hip: 50, shoulder: 12, bicep: 20, thigh: 30, knee: 12 };
const M_BASE: Measurements = { height: 1800, chest: 1000, waist: 880, hip: 1020, neck: 400, shoulder: 460, backLength: 450, armLength: 640, bicep: 320, wrist: 175, inseam: 830, rise: 280, thigh: 600, knee: 400, head: 575, footLength: 270, footWidth: 100 };
const M_STEP: Measurements = { height: 20, chest: 40, waist: 40, hip: 30, neck: 10, shoulder: 12, backLength: 4, armLength: 5, bicep: 15, wrist: 4, inseam: 5, rise: 5, thigh: 25, knee: 10, head: 3, footLength: 5, footWidth: 2 };

export const SIZE_SYSTEMS: Record<SizeSystem, Chart> = {
  womenEU: { name: 'Damen EU', labels: ['32', '34', '36', '38', '40', '42', '44', '46', '48'], base: '38', m: W_BASE, step: W_STEP, stepLarge: W_LARGE, largeFrom: 42, int: ['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL', '4XL'] },
  menEU: { name: 'Herren EU', labels: ['44', '46', '48', '50', '52', '54', '56', '58'], base: '50', m: M_BASE, step: M_STEP, stepLarge: M_STEP, largeFrom: 999, int: ['XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL', '4XL'] },
};

function chartMeasurements(c: Chart, label: string): Measurements {
  const bi = c.labels.indexOf(c.base), ti = c.labels.indexOf(label);
  if (ti < 0) throw new Error(`unknown size ${label}`);
  const m = { ...c.m };
  const dir = ti > bi ? 1 : -1;
  for (let i = bi; i !== ti; i += dir) {
    // step between labels[i] and labels[i+dir]; the larger label decides small/large step
    const upper = Number(c.labels[dir > 0 ? i + 1 : i]);
    const st = upper >= c.largeFrom ? c.stepLarge : c.step;
    for (const k of MEASUREMENT_KEYS) m[k] += dir * st[k];
  }
  return m;
}

export function measurementsFor(spec: SizeSpec): Measurements {
  if (spec.system === 'custom') return { ...spec.m };
  return chartMeasurements(SIZE_SYSTEMS[spec.system], spec.label);
}

export function defaultAvatar(profile: Profile): Measurements {
  return profile === 'women' ? { ...W_BASE } : { ...M_BASE };
}
export function defaultSize(profile: Profile): SizeSpec {
  return profile === 'women' ? { system: 'womenEU', label: '38' } : { system: 'menEU', label: '50' };
}
export function intLabel(system: SizeSystem, label: string): string {
  const c = SIZE_SYSTEMS[system];
  return c.int[c.labels.indexOf(label)] ?? '';
}
export function sizeName(spec: SizeSpec): string {
  if (spec.system === 'custom') return 'Maß';
  return `${spec.label} (${intLabel(spec.system, spec.label)})`;
}
