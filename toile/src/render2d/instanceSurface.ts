import type { Garment, Project, Trim } from '../core/model';
import type { Instance } from '../core/resolve';
import { surfaceFor, linkedFrom } from '../core/resolve';
import { pieceAnchor } from '../core/pattern/piece';
import { surfaceFrame, surfaceOutline } from './frame';
import type { SurfaceRender } from './compositor';

export function surfaceRenderFor(project: Project, g: Garment, inst: Instance, showStitches = true): SurfaceRender {
  const a = pieceAnchor(inst.piece);
  return {
    outline: surfaceOutline(inst.piece), frame: surfaceFrame(inst.piece), layers: surfaceFor(g, inst.key).layers,
    materials: project.materials, grain: inst.piece.grain, mirrorPlacement: !!linkedFrom(g, inst.key), showStitches,
    stitches: inst.piece.internal.map((l) => ({ ...l, pts: l.pts.map((p) => ({ x: p.x - a.x, y: p.y - a.y })) })),
  };
}
/** Trims shown on an instance (linked R side shows L's trims mirrored). */
export function trimsFor(g: Garment, key: string): (Trim & { mirrored: boolean })[] {
  const src = linkedFrom(g, key);
  if (src) return g.trims.filter((t) => t.key === src).map((t) => ({ ...t, x: -t.x, rot: -t.rot, mirrored: true }));
  return g.trims.filter((t) => t.key === key).map((t) => ({ ...t, mirrored: false }));
}
