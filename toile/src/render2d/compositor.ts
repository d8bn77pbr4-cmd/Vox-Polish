import type { Layer, Material, PatternSpec, RasterFrame } from '../core/model';
import type { InternalLine } from '../core/pattern/types';
import type { Vec2 } from '../core/geometry/vec';
import { drawPatternTile } from '../core/textile/patterns';
import { getBitmap } from './assets';
import { getRaster } from './raster';

export interface SurfaceRender {
  outline: Vec2[]; frame: RasterFrame; layers: Layer[]; materials: Material[];
  grain: number; mirrorPlacement: boolean; showStitches: boolean; stitches: InternalLine[];
  /** optional: draw into an existing context that is already transformed to mm surface space */
  noClear?: boolean; edgeShade?: boolean;
}

const tileCache = new Map<string, HTMLCanvasElement>();
function tileFor(spec: PatternSpec, pxPerMm: number): HTMLCanvasElement | null {
  const motif = spec.type === 'motif' ? getBitmap(spec.motifAssetId) : undefined;
  if (spec.type === 'motif' && !motif) return null;
  const key = JSON.stringify(spec) + '|' + pxPerMm.toFixed(3);
  let c = tileCache.get(key);
  if (c) return c;
  const probe = document.createElement('canvas');
  probe.width = probe.height = 1;
  // measure first
  const sz = drawPatternTile(probe.getContext('2d')!, spec, pxPerMm, motif);
  c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(sz.w)); c.height = Math.max(1, Math.round(sz.h));
  drawPatternTile(c.getContext('2d')!, spec, pxPerMm, motif);
  if (tileCache.size > 80) tileCache.delete(tileCache.keys().next().value!);
  tileCache.set(key, c);
  return c;
}
export const BLEND: Record<string, GlobalCompositeOperation> = {
  normal: 'source-over', multiply: 'multiply', screen: 'screen', overlay: 'overlay', 'soft-light': 'soft-light', darken: 'darken', lighten: 'lighten', color: 'color', luminosity: 'luminosity',
};

function fillPattern(ctx: CanvasRenderingContext2D, img: CanvasImageSource, scaleMmPerPx: number, angleDeg: number, f: RasterFrame) {
  const pat = ctx.createPattern(img, 'repeat');
  if (!pat) return;
  const m = new DOMMatrix().rotate(angleDeg).scale(scaleMmPerPx, scaleMmPerPx);
  pat.setTransform(m);
  ctx.fillStyle = pat;
  ctx.fillRect(f.x0 - 50, f.y0 - 50, f.w / f.pxPerMm + 100, f.h / f.pxPerMm + 100);
}

/** Draws all layers of one surface. ctx transform must map mm surface coords to pixels. */
export function drawSurface(ctx: CanvasRenderingContext2D, r: SurfaceRender) {
  const f = r.frame;
  ctx.save();
  ctx.beginPath();
  r.outline.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
  ctx.closePath();
  ctx.clip();
  const mx = r.mirrorPlacement ? -1 : 1;
  for (const l of r.layers) {
    if (!l.visible) continue;
    ctx.save();
    ctx.globalAlpha = l.opacity;
    ctx.globalCompositeOperation = BLEND[l.blend] ?? 'source-over';
    switch (l.kind) {
      case 'base': {
        const m = r.materials.find((x) => x.id === l.materialId);
        ctx.fillStyle = m?.color ?? '#cccccc';
        ctx.fillRect(f.x0, f.y0, f.w / f.pxPerMm, f.h / f.pxPerMm);
        const bmp = m?.textureAssetId ? getBitmap(m.textureAssetId) : undefined;
        if (bmp && m) fillPattern(ctx, bmp, m.repeat / bmp.width, r.grain, f);
        break;
      }
      case 'fill': ctx.fillStyle = l.color; ctx.fillRect(f.x0, f.y0, f.w / f.pxPerMm, f.h / f.pxPerMm); break;
      case 'pattern': {
        const tile = tileFor(l.pattern, f.pxPerMm);
        if (tile) fillPattern(ctx, tile, 1 / f.pxPerMm, l.pattern.angle + r.grain, f);
        break;
      }
      case 'image': {
        const bmp = getBitmap(l.assetId);
        if (!bmp) break;
        const h = (l.w * bmp.height) / bmp.width;
        ctx.translate(l.x * mx, l.y);
        ctx.rotate(((l.rot * mx) * Math.PI) / 180);
        const a = l.adjust;
        if (a.hue || a.sat || a.bright || a.contrast) ctx.filter = `hue-rotate(${a.hue}deg) saturate(${100 + a.sat}%) brightness(${100 + a.bright}%) contrast(${100 + a.contrast}%)`;
        ctx.drawImage(bmp, -l.w / 2, -h / 2, l.w, h);
        break;
      }
      case 'paint': {
        const c = getRaster(l);
        if (r.mirrorPlacement) ctx.scale(-1, 1);
        ctx.drawImage(c, l.frame.x0, l.frame.y0, l.frame.w / l.frame.pxPerMm, l.frame.h / l.frame.pxPerMm);
        break;
      }
      case 'text': {
        ctx.translate(l.x * mx, l.y);
        ctx.rotate(((l.rot * mx) * Math.PI) / 180);
        ctx.fillStyle = l.color;
        ctx.font = `600 ${l.size}px ${l.font}`;
        if ('letterSpacing' in ctx) (ctx as unknown as { letterSpacing: string }).letterSpacing = `${l.tracking}px`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(l.text, 0, 0);
        break;
      }
    }
    ctx.restore();
  }
  if (r.edgeShade !== false) {
    ctx.save();
    ctx.globalCompositeOperation = 'multiply';
    ctx.strokeStyle = 'rgba(0,0,0,0.16)'; ctx.lineWidth = 6;
    ctx.beginPath(); r.outline.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y))); ctx.closePath(); ctx.stroke();
    ctx.restore();
  }
  if (r.showStitches) {
    ctx.save();
    ctx.lineCap = 'round'; ctx.setLineDash([2.6, 1.6]); ctx.lineWidth = 0.55;
    for (const s of r.stitches) {
      if (s.kind !== 'stitch' && s.kind !== 'pocket' && s.kind !== 'yoke') continue;
      const pts = s.pts.map((p) => ({ x: p.x, y: p.y }));
      ctx.strokeStyle = 'rgba(0,0,0,0.38)';
      ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y))); if (s.closed) ctx.closePath(); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.18)';
      ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(p.x + 0.4, p.y + 0.4) : ctx.moveTo(p.x + 0.4, p.y + 0.4))); if (s.closed) ctx.closePath(); ctx.stroke();
    }
    ctx.restore();
  }
  ctx.restore();
}

/** Renders a surface into a canvas sized to its frame. */
export function renderSurface(canvas: HTMLCanvasElement, r: SurfaceRender) {
  const f = r.frame;
  if (canvas.width !== f.w) canvas.width = f.w;
  if (canvas.height !== f.h) canvas.height = f.h;
  const ctx = canvas.getContext('2d')!;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, f.w, f.h);
  ctx.setTransform(f.pxPerMm, 0, 0, f.pxPerMm, -f.x0 * f.pxPerMm, -f.y0 * f.pxPerMm);
  drawSurface(ctx, r);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}
