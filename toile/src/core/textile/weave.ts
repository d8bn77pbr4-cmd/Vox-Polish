import type { Weave } from '../model';
import { rng } from './patterns';

function heightField(weave: Weave, n: number): Float32Array {
  const h = new Float32Array(n * n), r = rng(11);
  const noise = (scale: number) => { // value noise, tileable
    const g = Math.max(2, Math.round(n / scale)), v = new Float32Array(g * g).map(() => r());
    return (x: number, y: number) => {
      const fx = (x / n) * g, fy = (y / n) * g, x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0;
      const at = (i: number, j: number) => v[((j % g) + g) % g * g + (((i % g) + g) % g)];
      const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
      return (at(x0, y0) * (1 - sx) + at(x0 + 1, y0) * sx) * (1 - sy) + (at(x0, y0 + 1) * (1 - sx) + at(x0 + 1, y0 + 1) * sx) * sy;
    };
  };
  const n1 = noise(8), n2 = noise(24), n3 = noise(4);
  const T = Math.PI * 2;
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const u = x / n, v = y / n;
    let z = 0;
    switch (weave) {
      case 'jersey': case 'knit': { const k = weave === 'knit' ? 8 : 16; const cx = (u * k) % 1; z = 0.5 + 0.5 * Math.sin(T * (v * k * 2 + Math.abs(cx - 0.5) * 2)); break; }
      case 'twill': z = 0.5 + 0.5 * Math.sin(T * (u + v) * 24) + 0.15 * n1(x, y); break;
      case 'plain': case 'canvas': { const k = weave === 'canvas' ? 16 : 32; z = 0.5 + 0.25 * Math.sin(T * u * k) * Math.sign(Math.sin(T * v * k / 2)) + 0.25 * Math.sin(T * v * k) * Math.sign(Math.sin(T * u * k / 2)); break; }
      case 'rib': z = Math.pow(Math.sin(Math.PI * ((u * 12) % 1)), 2); break;
      case 'satin': z = 0.5 + 0.1 * Math.sin(T * (u * 4 + v * 32)); break;
      case 'leather': z = 0.6 * n1(x, y) + 0.3 * n3(x, y) + 0.1 * n2(x, y); break;
      case 'velvet': z = 0.5 + 0.3 * n3(x, y); break;
      case 'boucle': z = Math.abs(Math.sin(T * n1(x, y) * 3)) * 0.7 + 0.3 * n3(x, y); break;
      case 'rubber': z = 0.5 + 0.05 * n3(x, y); break;
    }
    h[y * n + x] = z;
  }
  return h;
}

/** Tileable tangent-space normal map for a weave. */
export function weaveNormalCanvas(weave: Weave, size = 256): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(size, size), h = heightField(weave, size);
  const at = (x: number, y: number) => h[((y + size) % size) * size + ((x + size) % size)];
  const strength = weave === 'satin' || weave === 'rubber' ? 1 : 2.4;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const dx = (at(x + 1, y) - at(x - 1, y)) * strength, dy = (at(x, y + 1) - at(x, y - 1)) * strength;
    const l = Math.hypot(dx, dy, 1), o = (y * size + x) * 4;
    img.data[o] = ((-dx / l) * 0.5 + 0.5) * 255; img.data[o + 1] = ((dy / l) * 0.5 + 0.5) * 255; img.data[o + 2] = ((1 / l) * 0.5 + 0.5) * 255; img.data[o + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}
