import type { Measurements } from './measurements';

export function proportionalScale(base: Measurements, now: Measurements, keys: { x: keyof Measurements; y: keyof Measurements }) {
  return { sx: now[keys.x] / base[keys.x], sy: now[keys.y] / base[keys.y] };
}
