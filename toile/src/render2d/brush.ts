import type { BrushSettings } from '../state/store';

export interface BrushDef { id: string; name: string; hardness: number; spacing: number; pressureSize: number; pressureOpacity: number; texture?: 'chalk'; erase?: boolean; size: number }
export const BRUSHES: BrushDef[] = [
  { id: 'fineliner', name: 'Fineliner', hardness: 1, spacing: 0.08, pressureSize: 0.2, pressureOpacity: 0, size: 3 },
  { id: 'ink', name: 'Tusche', hardness: 0.85, spacing: 0.1, pressureSize: 0.9, pressureOpacity: 0.1, size: 10 },
  { id: 'marker', name: 'Marker', hardness: 0.7, spacing: 0.12, pressureSize: 0.2, pressureOpacity: 0.4, size: 24 },
  { id: 'airbrush', name: 'Airbrush', hardness: 0, spacing: 0.08, pressureSize: 0.3, pressureOpacity: 0.9, size: 60 },
  { id: 'chalk', name: 'Kreide / Kohle', hardness: 0.6, spacing: 0.15, pressureSize: 0.5, pressureOpacity: 0.6, texture: 'chalk', size: 20 },
  { id: 'eraser', name: 'Radierer', hardness: 0.8, spacing: 0.1, pressureSize: 0.5, pressureOpacity: 0, erase: true, size: 30 },
];
export const brushDef = (id: string) => BRUSHES.find((b) => b.id === id) ?? BRUSHES[1];

export interface StrokePoint { x: number; y: number; pressure: number }
type Ctx = CanvasRenderingContext2D;

const stampCache = new Map<string, HTMLCanvasElement>();
function stamp(r: number, hardness: number, color: string, chalk: boolean): HTMLCanvasElement {
  const d = Math.max(2, Math.ceil(r * 2));
  const key = `${d}|${hardness.toFixed(2)}|${color}|${chalk}`;
  let c = stampCache.get(key);
  if (c) return c;
  c = document.createElement('canvas'); c.width = c.height = d;
  const g = c.getContext('2d')!;
  const grd = g.createRadialGradient(d / 2, d / 2, 0, d / 2, d / 2, d / 2);
  grd.addColorStop(0, color); grd.addColorStop(Math.min(0.99, Math.max(0, hardness)), color); grd.addColorStop(1, color + '00');
  g.fillStyle = grd; g.fillRect(0, 0, d, d);
  if (chalk) {
    const img = g.getImageData(0, 0, d, d);
    for (let i = 3; i < img.data.length; i += 4) img.data[i] *= Math.random() < 0.45 ? 0 : 0.6 + Math.random() * 0.4;
    g.putImageData(img, 0, 0);
  }
  if (stampCache.size > 64) stampCache.delete(stampCache.keys().next().value!);
  stampCache.set(key, c);
  return c;
}
const hex6 = (c: string) => (/^#[0-9a-f]{6}$/i.test(c) ? c : '#000000');

/** One brush stroke. Points are in canvas pixels. */
export class Stroke {
  private last: StrokePoint | null = null;
  private smooth: StrokePoint | null = null;
  private carry = 0;
  private minX = Infinity; private minY = Infinity; private maxX = -Infinity; private maxY = -Infinity;
  private def: BrushDef;
  constructor(private ctx: Ctx | null, private s: BrushSettings, private color: string, private o: { dab?: (x: number, y: number, r: number, a: number) => void; erase?: boolean } = {}) {
    this.def = brushDef(s.brush);
  }
  private dab(p: StrokePoint) {
    const pr = Math.max(0.05, p.pressure || 1);
    const r = Math.max(0.5, (this.s.size / 2) * (1 - this.def.pressureSize + this.def.pressureSize * pr));
    const a = this.s.opacity * this.s.flow * (1 - this.def.pressureOpacity + this.def.pressureOpacity * pr);
    this.minX = Math.min(this.minX, p.x - r); this.minY = Math.min(this.minY, p.y - r);
    this.maxX = Math.max(this.maxX, p.x + r); this.maxY = Math.max(this.maxY, p.y + r);
    if (this.o.dab) { this.o.dab(p.x, p.y, r, a); return; }
    const ctx = this.ctx!;
    ctx.save();
    ctx.globalAlpha = Math.min(1, a);
    ctx.globalCompositeOperation = this.def.erase || this.o.erase ? 'destination-out' : 'source-over';
    const st = stamp(r, this.s.hardness ?? this.def.hardness, hex6(this.color), this.def.texture === 'chalk');
    ctx.drawImage(st, p.x - st.width / 2, p.y - st.height / 2);
    ctx.restore();
  }
  add(raw: StrokePoint) {
    const k = 1 - Math.min(0.95, this.s.smoothing) * 0.85;
    const p = this.smooth ? { x: this.smooth.x + (raw.x - this.smooth.x) * k, y: this.smooth.y + (raw.y - this.smooth.y) * k, pressure: raw.pressure } : raw;
    this.smooth = p;
    if (!this.last) { this.dab(p); this.last = p; return; }
    const step = Math.max(1, this.s.size * this.s.spacing);
    const dx = p.x - this.last.x, dy = p.y - this.last.y, d = Math.hypot(dx, dy);
    let t = step - this.carry;
    while (t <= d) {
      const f = t / d;
      this.dab({ x: this.last.x + dx * f, y: this.last.y + dy * f, pressure: this.last.pressure + (p.pressure - this.last.pressure) * f });
      t += step;
    }
    this.carry = d - (t - step);
    this.last = p;
  }
  end(): { x: number; y: number; w: number; h: number } {
    if (this.minX === Infinity) return { x: 0, y: 0, w: 0, h: 0 };
    const x = Math.floor(this.minX) - 1, y = Math.floor(this.minY) - 1;
    return { x, y, w: Math.ceil(this.maxX) + 2 - x, h: Math.ceil(this.maxY) + 2 - y };
  }
}
