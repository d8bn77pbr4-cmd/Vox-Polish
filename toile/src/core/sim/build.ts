import type { Project, Material, Garment } from '../model';
import type { Resolved, Instance } from '../resolve';
import { surfaceFor } from '../resolve';
import type { Vec2 } from '../geometry/vec';
import { segmentPoints, resamplePolyline, polylineLength } from '../geometry/path';
import { meshPolygon } from '../geometry/mesh';
import { pieceAnchor } from '../pattern/piece';
import { getTemplate } from '../templates/registry';
import { MATERIAL_PRESETS } from '../textile/materials';
import { placeInstance } from './placement';
import type { Body } from './body';
import type { ClothSetup } from './cloth';

export const QUALITY = { draft: 25, standard: 18, fine: 12 } as const;
export type Quality = keyof typeof QUALITY;
export interface SimPart {
  garmentId: string; key: string; start: number; count: number; tris: Uint32Array; uv: Float32Array; local: Vec2[];
  boundaryCount: number; nodeBoundary: Map<string, number>; anchor: Vec2;
}

const frameUV = (inst: Instance) => {
  // same frame as render2d/frame.surfaceFrame (kept dependency-free here)
  const a = pieceAnchor(inst.piece);
  return a;
};

export function materialOf(project: Project, g: Garment, key: string): Material {
  const base = surfaceFor(g, key).layers.find((l) => l.kind === 'base');
  const id = base && base.kind === 'base' ? base.materialId : getTemplate(g.templateId).defaultMaterial;
  return project.materials.find((m) => m.id === id) ?? MATERIAL_PRESETS.find((m) => m.id === id) ?? MATERIAL_PRESETS[0];
}

export function buildLook(project: Project, resolvedById: Map<string, Resolved>, body: Body, quality: Quality, uvOf?: (inst: Instance, x: number, y: number) => [number, number]) {
  const spacing = QUALITY[quality];
  const P: number[] = [], W: number[] = [], G: number[] = [];
  const si: number[] = [], sj: number[] = [], sr: number[] = [], sc: number[] = [];
  const bi: number[] = [], bj: number[] = [], br: number[] = [], bc: number[] = [];
  const mi: number[] = [], mj: number[] = [], md: number[] = [];
  const parts: SimPart[] = [];
  for (const g of project.garments) {
    if (!g.visible || getTemplate(g.templateId).kind !== 'cloth') continue;
    const res = resolvedById.get(g.id);
    if (!res) continue;
    const gap = 0.004 + g.layer * 0.006;
    const byKey = new Map<string, SimPart>();
    for (const inst of res.instances) {
      if (inst.piece.placement.zone === 'none') continue;
      const nodes = inst.piece.nodes;
      const boundary: Vec2[] = [];
      const nodeBoundary = new Map<string, number>();
      for (let i = 0; i < nodes.length; i++) {
        nodeBoundary.set(nodes[i].id, boundary.length);
        const seg = [{ x: nodes[i].x, y: nodes[i].y }, ...segmentPoints(nodes, i, 0.5)];
        const n = Math.max(1, Math.round(polylineLength(seg) / spacing));
        const rs = resamplePolyline(seg, n + 1);
        for (let k = 0; k < n; k++) boundary.push(rs[k]);
      }
      const mesh = meshPolygon(boundary, spacing);
      const pos = placeInstance(mesh.pts, inst, body, gap);
      const start = P.length / 3;
      const mat = materialOf(project, g, inst.key);
      const areaPer = (spacing / 1000) ** 2 * 0.87;
      const invM = 1 / Math.max(1e-6, (mat.gsm / 1000) * areaPer);
      const anchor = frameUV(inst);
      const uv = new Float32Array(mesh.pts.length * 2);
      mesh.pts.forEach((q, k) => {
        P.push(pos[k * 3], pos[k * 3 + 1], pos[k * 3 + 2]); W.push(invM); G.push(gap);
        const t = uvOf ? uvOf(inst, q.x - anchor.x, q.y - anchor.y) : [0, 0];
        uv[k * 2] = t[0]; uv[k * 2 + 1] = t[1];
      });
      // constraints
      const gr = (inst.piece.grain * Math.PI) / 180, gx = Math.sin(gr), gy = Math.cos(gr);
      const edges = new Map<number, number[]>();
      const N = mesh.pts.length;
      const addEdge = (a: number, b: number, opp: number) => {
        const k = a < b ? a * N + b : b * N + a;
        const e = edges.get(k); if (e) e.push(opp); else edges.set(k, [opp]);
      };
      for (let t = 0; t < mesh.tris.length; t += 3) {
        const a = mesh.tris[t], b = mesh.tris[t + 1], c = mesh.tris[t + 2];
        addEdge(a, b, c); addEdge(b, c, a); addEdge(c, a, b);
      }
      const bendComp = 0.5 + 40 * (1 - mat.bend) ** 2;
      for (const [k, opp] of edges) {
        const a = Math.floor(k / N), b = k % N;
        const pa = mesh.pts[a], pb = mesh.pts[b];
        const dx = pb.x - pa.x, dy = pb.y - pa.y, L = Math.hypot(dx, dy);
        const deg = (Math.acos(Math.min(1, Math.abs((dx * gx + dy * gy) / (L || 1)))) * 180) / Math.PI;
        const s = deg <= 45 ? mat.stretch.warp + (mat.stretch.bias - mat.stretch.warp) * (deg / 45) : mat.stretch.bias + (mat.stretch.weft - mat.stretch.bias) * ((deg - 45) / 45);
        si.push(start + a); sj.push(start + b); sr.push(L / 1000); sc.push(0.02 + 6 * s * s);
        if (opp.length === 2) {
          const o1 = mesh.pts[opp[0]], o2 = mesh.pts[opp[1]];
          bi.push(start + opp[0]); bj.push(start + opp[1]); br.push(Math.hypot(o2.x - o1.x, o2.y - o1.y) / 1000); bc.push(bendComp);
        }
      }
      const part: SimPart = { garmentId: g.id, key: inst.key, start, count: N, tris: mesh.tris, uv, local: mesh.pts, boundaryCount: mesh.boundaryCount, nodeBoundary, anchor };
      parts.push(part); byKey.set(inst.key, part);
    }
    // seams
    const edgeList = (part: SimPart, from: string, to: string) => {
      const a = part.nodeBoundary.get(from), b = part.nodeBoundary.get(to);
      if (a === undefined || b === undefined) return null;
      const idx: number[] = [];
      let k = a;
      for (let guard = 0; guard <= part.boundaryCount; guard++) { idx.push(k); if (k === b) break; k = (k + 1) % part.boundaryCount; }
      const ts = [0];
      for (let q = 1; q < idx.length; q++) { const p0 = part.local[idx[q - 1]], p1 = part.local[idx[q]]; ts.push(ts[q - 1] + Math.hypot(p1.x - p0.x, p1.y - p0.y)); }
      const L = ts[ts.length - 1] || 1;
      return { idx: idx.map((x) => part.start + x), t: ts.map((x) => x / L) };
    };
    for (const s of res.seams) {
      const pa = byKey.get(`${s.a.piece}:${s.a.side ?? 'C'}`), pb = byKey.get(`${s.b.piece}:${s.b.side ?? 'C'}`);
      if (!pa || !pb) continue;
      const A = edgeList(pa, s.a.from, s.a.to), B0 = edgeList(pb, s.b.from, s.b.to);
      if (!A || !B0) continue;
      const B = s.flip ? { idx: [...B0.idx].reverse(), t: [...B0.t].reverse().map((x) => 1 - x) } : B0;
      const pairs = new Set<string>();
      const nearest = (ts: number[], t: number) => { let bI = 0, bd = Infinity; for (let q = 0; q < ts.length; q++) { const d = Math.abs(ts[q] - t); if (d < bd) { bd = d; bI = q; } } return bI; };
      for (let q = 0; q < A.idx.length; q++) pairs.add(`${A.idx[q]}|${B.idx[nearest(B.t, A.t[q])]}`);
      for (let q = 0; q < B.idx.length; q++) pairs.add(`${A.idx[nearest(A.t, B.t[q])]}|${B.idx[q]}`);
      for (const pr of pairs) {
        const [i, j] = pr.split('|').map(Number);
        if (i === j) continue;
        mi.push(i); mj.push(j);
        md.push(Math.hypot(P[j * 3] - P[i * 3], P[j * 3 + 1] - P[i * 3 + 1], P[j * 3 + 2] - P[i * 3 + 2]));
      }
    }
  }
  const setup: ClothSetup = {
    pos: Float32Array.from(P), invMass: Float32Array.from(W), gap: Float32Array.from(G),
    stretch: { i: Uint32Array.from(si), j: Uint32Array.from(sj), rest: Float32Array.from(sr), comp: Float32Array.from(sc) },
    bend: { i: Uint32Array.from(bi), j: Uint32Array.from(bj), rest: Float32Array.from(br), comp: Float32Array.from(bc) },
    seams: { i: Uint32Array.from(mi), j: Uint32Array.from(mj), d0: Float32Array.from(md) },
  };
  return { setup, parts };
}
