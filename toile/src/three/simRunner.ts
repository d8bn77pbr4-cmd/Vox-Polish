import type { Project } from '../core/model';
import { resolveGarment, type Resolved } from '../core/resolve';
import { buildLook, type Quality, type SimPart } from '../core/sim/build';
import { Cloth } from '../core/sim/cloth';
import type { Body } from '../core/sim/body';
import { surfaceFrame, toUV } from '../render2d/frame';
import { getTemplate } from '../core/templates/registry';

export function simSignature(project: Project, quality: Quality): string {
  const gs = project.garments.filter((g) => g.visible && getTemplate(g.templateId).kind === 'cloth').map((g) => {
    const mats = Object.values(g.surfaces).map((s) => { const b = s.layers.find((l) => l.kind === 'base'); return b && b.kind === 'base' ? b.materialId : ''; });
    const phys = project.materials.filter((m) => mats.includes(m.id)).map((m) => [m.id, m.gsm, m.stretch, m.bend]);
    return [g.id, g.templateId, g.params, g.size, g.overrides, g.custom, g.customSeams, g.layer, g.baseMeasurements, mats, phys];
  });
  return JSON.stringify([project.avatar, project.profile, quality, gs]);
}

export class SimRunner {
  cloth: Cloth | null = null;
  parts: SimPart[] = [];
  resolved = new Map<string, Resolved>();
  frame = 0; lookId = 0; sig = ''; forceN = 0;
  rebuild(project: Project, body: Body, quality: Quality) {
    this.resolved = new Map(project.garments.map((g) => [g.id, resolveGarment(g)]));
    const look = buildLook(project, this.resolved, body, quality, (inst, x, y) => toUV(surfaceFrame(inst.piece), x, y));
    this.parts = look.parts;
    this.cloth = look.setup.pos.length ? new Cloth(look.setup, body) : null;
    this.lookId++; this.frame++;
  }
  advance(budgetMs = 12) {
    const c = this.cloth;
    if (!c || c.settled) return false;
    const t0 = performance.now();
    do { c.step(1 / 60); } while (!c.settled && performance.now() - t0 < budgetMs);
    this.frame++;
    return true;
  }
  get progress() { const c = this.cloth; return c ? (c.settled ? 1 : Math.min(0.99, c.time / 4)) : 1; }
}
