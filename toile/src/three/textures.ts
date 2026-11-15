import * as THREE from 'three';
import type { Garment, Project, Weave } from '../core/model';
import type { Instance } from '../core/resolve';
import { surfaceFor } from '../core/resolve';
import { renderSurface, drawSurface } from '../render2d/compositor';
import { surfaceRenderFor } from '../render2d/instanceSurface';
import { assetVersion } from '../render2d/assets';
import { rasterVersion } from '../render2d/raster';
import { weaveNormalCanvas } from '../core/textile/weave';
import type { RasterFrame } from '../core/model';

interface Entry { canvas: HTMLCanvasElement; tex: THREE.CanvasTexture; sig: string }
const cache = new Map<string, Entry>();
function entry(key: string): Entry {
  let e = cache.get(key);
  if (!e) {
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 4;
    const tex = new THREE.CanvasTexture(canvas); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
    e = { canvas, tex, sig: '' }; cache.set(key, e);
  }
  return e;
}
const sigOf = (project: Project, g: Garment, key: string, extra: unknown) => {
  const layers = surfaceFor(g, key).layers;
  const mats = layers.map((l) => (l.kind === 'base' ? project.materials.find((m) => m.id === l.materialId) : null));
  return JSON.stringify([layers, mats, extra, g.linkSides]) + '|' + assetVersion() + '|' + rasterVersion();
};

export function instanceTexture(project: Project, g: Garment, inst: Instance): THREE.CanvasTexture {
  const e = entry(g.id + '|' + inst.key);
  const sig = sigOf(project, g, inst.key, inst.piece.nodes);
  if (sig !== e.sig) {
    const sr = surfaceRenderFor(project, g, inst, true);
    renderSurface(e.canvas, sr);
    e.tex.image = e.canvas; e.tex.needsUpdate = true; e.sig = sig;
  }
  return e.tex;
}

/** Composes several panels (all in one shared flat frame) into one atlas texture. */
export function atlasTexture(key: string, frame: RasterFrame, sig: string, draw: (ctx: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const e = entry(key);
  const s = sig + '|' + assetVersion() + '|' + rasterVersion();
  if (s !== e.sig) {
    e.canvas.width = frame.w; e.canvas.height = frame.h;
    const ctx = e.canvas.getContext('2d')!;
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, frame.w, frame.h);
    ctx.setTransform(frame.pxPerMm, 0, 0, frame.pxPerMm, -frame.x0 * frame.pxPerMm, -frame.y0 * frame.pxPerMm);
    draw(ctx);
    e.tex.image = e.canvas; e.tex.needsUpdate = true; e.sig = s;
  }
  return e.tex;
}
export { drawSurface };

const WEAVE_MM: Record<Weave, number> = { jersey: 14, knit: 22, rib: 24, twill: 18, plain: 10, canvas: 14, satin: 30, velvet: 20, leather: 70, boucle: 40, rubber: 40 };
const weaveBase = new Map<Weave, THREE.CanvasTexture>();
export function weaveTexture(weave: Weave, widthMm: number, heightMm: number): THREE.Texture {
  let t = weaveBase.get(weave);
  if (!t) { t = new THREE.CanvasTexture(weaveNormalCanvas(weave, 256)); t.wrapS = t.wrapT = THREE.RepeatWrapping; weaveBase.set(weave, t); }
  const c = t.clone();
  c.wrapS = c.wrapT = THREE.RepeatWrapping;
  c.repeat.set(widthMm / WEAVE_MM[weave], heightMm / WEAVE_MM[weave]);
  c.needsUpdate = true;
  return c;
}
