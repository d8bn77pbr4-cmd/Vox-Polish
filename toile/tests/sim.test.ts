import { describe, it, expect } from 'vitest';
import { newProject, newGarment } from '../src/core/model';
import { MATERIAL_PRESETS } from '../src/core/textile/materials';
import { resolveGarment } from '../src/core/resolve';
import { buildBody, bodyDistance } from '../src/core/sim/body';
import { buildLook } from '../src/core/sim/build';
import { Cloth } from '../src/core/sim/cloth';

function run(templateId: string, sil: string) {
  const pr = newProject('S', 'women', MATERIAL_PRESETS);
  const g = newGarment(templateId, sil, pr);
  pr.garments.push(g);
  const body = buildBody(pr.avatar, pr.profile);
  const look = buildLook(pr, new Map([[g.id, resolveGarment(g)]]), body, 'draft');
  const c = new Cloth(look.setup, body);
  let frames = 0;
  while (!c.settled && frames < 60 * 14) { c.step(1 / 60); frames++; }
  return { c, body, look };
}

describe('body', () => {
  it('is inside at the torso centre and outside far away', () => {
    const pr = newProject('S', 'women', []);
    const b = buildBody(pr.avatar, 'women');
    const n = new Float32Array(3);
    expect(bodyDistance(b, 0, 1.2, 0, n)).toBeLessThan(0);
    expect(bodyDistance(b, 0, 1.2, 0.6, n)).toBeGreaterThan(0.3);
    expect(n[2]).toBeGreaterThan(0.5);
  });
});

for (const [tid, sil] of [['tshirt', 'classic'], ['trousers', 'straight'], ['beanie', 'beanie']] as const) {
  describe(`cloth: ${tid}`, () => {
    it('settles with closed seams on the avatar', () => {
      const { c, body } = run(tid, sil);
      expect(c.settled).toBe(true);
      expect(c.time).toBeLessThanOrEqual(12.01);
      expect(c.maxSeamGap()).toBeLessThan(0.003);
      const n = new Float32Array(3);
      for (let i = 0; i < c.pos.length; i += 3) {
        expect(Number.isFinite(c.pos[i]) && Number.isFinite(c.pos[i + 1]) && Number.isFinite(c.pos[i + 2])).toBe(true);
        expect(c.pos[i + 1]).toBeGreaterThan(0);
        expect(bodyDistance(body, c.pos[i], c.pos[i + 1], c.pos[i + 2], n)).toBeLessThan(0.25);
      }
      expect(c.strain().length).toBe(c.pos.length / 3);
    }, 180000);
  });
}
