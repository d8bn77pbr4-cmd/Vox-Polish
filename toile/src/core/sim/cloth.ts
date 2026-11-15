import type { Body } from './body';
import { bodyDistance } from './body';

export interface Constraints { i: Uint32Array; j: Uint32Array; rest: Float32Array; comp: Float32Array }
export interface ClothSetup {
  pos: Float32Array; invMass: Float32Array;
  stretch: Constraints; bend: Constraints;
  seams: { i: Uint32Array; j: Uint32Array; d0: Float32Array };
  gap: Float32Array;
}
export interface ClothOptions { substeps: number; sewTime: number; maxTime: number; friction: number; thickness: number }

export class Cloth {
  pos: Float32Array; prev: Float32Array; vel: Float32Array;
  time = 0; settled = false; private calm = 0; meanSpeed = 0;
  private o: ClothOptions;
  private n = new Float32Array(3);
  constructor(public setup: ClothSetup, public body: Body, opts: Partial<ClothOptions> = {}) {
    this.o = { substeps: 10, sewTime: 1.2, maxTime: 12, friction: 0.35, thickness: 0.003, ...opts };
    this.pos = setup.pos.slice(); this.prev = setup.pos.slice(); this.vel = new Float32Array(setup.pos.length);
    // resolve initial penetration
    for (let k = 0; k < 4; k++) this.collide();
    this.prev.set(this.pos);
  }
  private solve(c: Constraints, scaleRest = 1) {
    const p = this.pos, w = this.setup.invMass;
    for (let k = 0; k < c.i.length; k++) {
      const a = c.i[k] * 3, b = c.j[k] * 3;
      const wa = w[c.i[k]], wb = w[c.j[k]], ws = wa + wb;
      if (ws === 0) continue;
      const dx = p[b] - p[a], dy = p[b + 1] - p[a + 1], dz = p[b + 2] - p[a + 2];
      const L = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (L < 1e-9) continue;
      const C = L - c.rest[k] * scaleRest;
      const lam = C / (ws * (1 + c.comp[k]) * L);
      p[a] += dx * lam * wa; p[a + 1] += dy * lam * wa; p[a + 2] += dz * lam * wa;
      p[b] -= dx * lam * wb; p[b + 1] -= dy * lam * wb; p[b + 2] -= dz * lam * wb;
    }
  }
  private sew(f: number) {
    const p = this.pos, w = this.setup.invMass, s = this.setup.seams;
    for (let k = 0; k < s.i.length; k++) {
      const a = s.i[k] * 3, b = s.j[k] * 3, wa = w[s.i[k]], wb = w[s.j[k]], ws = wa + wb;
      if (ws === 0) continue;
      const dx = p[b] - p[a], dy = p[b + 1] - p[a + 1], dz = p[b + 2] - p[a + 2];
      const L = Math.sqrt(dx * dx + dy * dy + dz * dz);
      const target = s.d0[k] * f;
      if (L <= target || L < 1e-9) continue;
      const lam = (L - target) / (ws * L);
      p[a] += dx * lam * wa; p[a + 1] += dy * lam * wa; p[a + 2] += dz * lam * wa;
      p[b] -= dx * lam * wb; p[b + 1] -= dy * lam * wb; p[b + 2] -= dz * lam * wb;
    }
  }
  private collide() {
    const p = this.pos, q = this.prev, g = this.setup.gap, n = this.n, fr = this.o.friction, th = this.o.thickness;
    for (let i = 0, k = 0; k < p.length; i++, k += 3) {
      if (p[k + 1] < 0.002) { p[k + 1] = 0.002; q[k] += (p[k] - q[k]) * 0.8; q[k + 2] += (p[k + 2] - q[k + 2]) * 0.8; }
      const d = bodyDistance(this.body, p[k], p[k + 1], p[k + 2], n) - g[i] - th;
      if (d < 0) {
        p[k] -= n[0] * d; p[k + 1] -= n[1] * d; p[k + 2] -= n[2] * d;
        // friction: damp tangential motion of this substep
        const mx = p[k] - q[k], my = p[k + 1] - q[k + 1], mz = p[k + 2] - q[k + 2];
        const mn = mx * n[0] + my * n[1] + mz * n[2];
        q[k] += (mx - mn * n[0]) * fr; q[k + 1] += (my - mn * n[1]) * fr; q[k + 2] += (mz - mn * n[2]) * fr;
      }
      if (p[k + 1] < 0.002) p[k + 1] = 0.002;
    }
  }
  step(frameDt = 1 / 60) {
    if (this.settled) return;
    const o = this.o, h = frameDt / o.substeps, p = this.pos, q = this.prev, v = this.vel, w = this.setup.invMass;
    for (let s = 0; s < o.substeps; s++) {
      const sewing = this.time < o.sewTime;
      const gy = (sewing ? 0.15 : 1) * 9.81;
      const sewF = Math.max(0, 1 - this.time / o.sewTime);
      for (let i = 0, k = 0; k < p.length; i++, k += 3) {
        q[k] = p[k]; q[k + 1] = p[k + 1]; q[k + 2] = p[k + 2];
        if (w[i] === 0) continue;
        v[k + 1] -= gy * h;
        p[k] += v[k] * h; p[k + 1] += v[k + 1] * h; p[k + 2] += v[k + 2] * h;
      }
      this.sew(sewF);
      this.solve(this.setup.stretch);
      this.sew(sewF);
      this.solve(this.setup.bend);
      this.solve(this.setup.stretch);
      this.sew(sewF);
      this.collide();
      this.sew(sewF);
      const damp = sewing ? 0.985 : 0.998;
      for (let k = 0; k < p.length; k++) v[k] = ((p[k] - q[k]) / h) * damp;
      this.time += h;
    }
    let sp = 0;
    for (let k = 0; k < v.length; k += 3) sp += Math.hypot(v[k], v[k + 1], v[k + 2]);
    sp /= v.length / 3 || 1;
    this.meanSpeed = sp;
    if (this.time > o.sewTime + 0.8 && sp < 0.012) this.calm += frameDt; else this.calm = 0;
    if (this.calm > 0.5 || this.time >= o.maxTime) {
      this.settled = true;
      // final tightening of seams for a clean result
      for (let k = 0; k < 20; k++) { this.sew(0); this.solve(this.setup.stretch); this.sew(0); this.collide(); }
      for (let k = 0; k < 30; k++) this.sew(0);
      this.collide();
      this.vel.fill(0);
    }
  }
  /** mean stretch ratio per particle (1 = rest length) */
  strain(): Float32Array {
    const c = this.setup.stretch, p = this.pos, n = p.length / 3;
    const sum = new Float32Array(n), cnt = new Float32Array(n);
    for (let k = 0; k < c.i.length; k++) {
      const a = c.i[k] * 3, b = c.j[k] * 3;
      const L = Math.hypot(p[b] - p[a], p[b + 1] - p[a + 1], p[b + 2] - p[a + 2]) / c.rest[k];
      sum[c.i[k]] += L; cnt[c.i[k]]++; sum[c.j[k]] += L; cnt[c.j[k]]++;
    }
    for (let i = 0; i < n; i++) sum[i] = cnt[i] ? sum[i] / cnt[i] : 1;
    return sum;
  }
  maxSeamGap(): number {
    const s = this.setup.seams, p = this.pos;
    let m = 0;
    for (let k = 0; k < s.i.length; k++) { const a = s.i[k] * 3, b = s.j[k] * 3; m = Math.max(m, Math.hypot(p[b] - p[a], p[b + 1] - p[a + 1], p[b + 2] - p[a + 2])); }
    return m;
  }
}
