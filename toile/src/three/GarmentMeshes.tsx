import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import type { Garment, Project, Trim } from '../core/model';
import type { SimPart } from '../core/sim/build';
import { materialOf } from '../core/sim/build';
import { resolveGarment } from '../core/resolve';
import { surfaceFrame } from '../render2d/frame';
import { trimsFor } from '../render2d/instanceSurface';
import { instanceTexture, weaveTexture } from './textures';
import type { SimRunner } from './simRunner';
import { trimColor } from '../ui/TrimGlyph';

export interface PaintHandlers { down(e: ThreeEvent<PointerEvent>, gid: string, key: string): void; move(e: ThreeEvent<PointerEvent>, gid: string, key: string): void; up(): void }

const strainColor = (s: number, out: Float32Array, k: number) => {
  // blue (loose) → green (neutral) → yellow → red (≥ 8 % stretch)
  const t = Math.max(-1, Math.min(1, (s - 1) / 0.08));
  let r, g, b;
  if (t < 0) { r = 0.2 + 0.1 * (1 + t); g = 0.55 + 0.25 * (1 + t); b = 0.95 - 0.55 * (1 + t); }
  else if (t < 0.5) { r = 0.3 + 1.3 * t; g = 0.8; b = 0.4 - 0.5 * t; }
  else { r = 0.95; g = 0.8 - 1.4 * (t - 0.5); b = 0.15; }
  out[k] = r; out[k + 1] = g; out[k + 2] = b;
};

function ClothPart({ runner, part, project, g, fitMap, texTick, paint }: { runner: SimRunner; part: SimPart; project: Project; g: Garment; fitMap: boolean; texTick: number; paint: PaintHandlers | null }) {
  const inst = resolveGarment(g).instances.find((i) => i.key === part.key)!;
  const geo = useMemo(() => {
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(part.count * 3), 3));
    geom.setAttribute('uv', new THREE.BufferAttribute(part.uv, 2));
    geom.setAttribute('color', new THREE.BufferAttribute(new Float32Array(part.count * 3).fill(1), 3));
    geom.setIndex(new THREE.BufferAttribute(part.tris, 1));
    return geom;
  }, [part]);
  const mat = useMemo(() => new THREE.MeshPhysicalMaterial({ side: THREE.DoubleSide, roughness: 0.85, sheenRoughness: 0.6 }), []);
  useEffect(() => () => { geo.dispose(); }, [geo]);
  useEffect(() => {
    if (!inst) return;
    const m = materialOf(project, g, part.key), f = surfaceFrame(inst.piece);
    mat.map = instanceTexture(project, g, inst);
    if (!mat.normalMap || mat.userData.weave !== m.weave) { mat.normalMap?.dispose(); mat.normalMap = weaveTexture(m.weave, f.w / f.pxPerMm, f.h / f.pxPerMm); mat.userData.weave = m.weave; }
    mat.normalScale.set(0.55, 0.55);
    mat.roughness = m.roughness; mat.sheen = m.sheen; mat.sheenColor = new THREE.Color('#ffffff').lerp(new THREE.Color(m.color), 0.4);
    mat.metalness = 0; mat.vertexColors = fitMap;
    if (fitMap) mat.map = null;
    mat.needsUpdate = true;
  }, [inst, project, g, fitMap, texTick]);
  const last = useRef(-1);
  const lastFit = useRef(false);
  useFrame(() => {
    const c = runner.cloth;
    if (!c || (last.current === runner.frame && lastFit.current === fitMap)) return;
    last.current = runner.frame; lastFit.current = fitMap;
    const a = geo.attributes.position.array as Float32Array;
    a.set(c.pos.subarray(part.start * 3, (part.start + part.count) * 3));
    geo.attributes.position.needsUpdate = true;
    geo.computeVertexNormals(); geo.computeBoundingSphere();
    if (fitMap) {
      const s = c.strain(), col = geo.attributes.color.array as Float32Array;
      for (let i = 0; i < part.count; i++) strainColor(s[part.start + i], col, i * 3);
      geo.attributes.color.needsUpdate = true;
    }
  });
  return (
    <mesh geometry={geo} material={mat} castShadow receiveShadow userData={{ gid: g.id, key: part.key }}
      onPointerDown={paint ? (e) => paint.down(e, g.id, part.key) : undefined}
      onPointerMove={paint ? (e) => paint.move(e, g.id, part.key) : undefined}
      onPointerUp={paint ? () => paint.up() : undefined} />
  );
}

/** Barycentric anchor of a 2D point inside a part's mesh. */
function anchorIn(part: SimPart, x: number, y: number) {
  let best: { t: number; w: [number, number, number]; d: number } | null = null;
  const L = part.local, T = part.tris;
  for (let t = 0; t < T.length; t += 3) {
    const a = L[T[t]], b = L[T[t + 1]], c = L[T[t + 2]];
    const det = (b.y - c.y) * (a.x - c.x) + (c.x - b.x) * (a.y - c.y);
    if (Math.abs(det) < 1e-9) continue;
    const w0 = ((b.y - c.y) * (x - c.x) + (c.x - b.x) * (y - c.y)) / det, w1 = ((c.y - a.y) * (x - c.x) + (a.x - c.x) * (y - c.y)) / det, w2 = 1 - w0 - w1;
    const d = Math.max(0, -w0, -w1, -w2);
    if (!best || d < best.d) best = { t, w: [w0, w1, w2], d };
    if (d === 0) break;
  }
  return best;
}

function TrimMesh({ t }: { t: Trim }) {
  const color = trimColor(t), metal = ['gold', 'silver', 'gunmetal'].includes(t.finish);
  const r = t.size / 2000;
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ color, metalness: metal ? 1 : 0.05, roughness: metal ? 0.28 : t.finish === 'pearl' ? 0.25 : 0.55 }), [color, metal, t.finish]);
  switch (t.type) {
    case 'button4': case 'button2': case 'snap':
      return <group><mesh material={mat} rotation-x={Math.PI / 2} position-z={0.0012}><cylinderGeometry args={[r, r * 0.96, 0.0024, 28]} /></mesh>
        {t.type !== 'snap' && (t.type === 'button4' ? [[-1, -1], [1, -1], [-1, 1], [1, 1]] : [[-1, 0], [1, 0]]).map(([x, y], i) => <mesh key={i} position={[x * r * 0.22, y * r * 0.22, 0.0025]}><circleGeometry args={[r * 0.1, 10]} /><meshBasicMaterial color="#111" /></mesh>)}</group>;
    case 'shank': case 'rivet': return <mesh material={mat} scale={[1, 1, 0.45]}><sphereGeometry args={[r, 24, 16, 0, Math.PI * 2, 0, Math.PI / 2]} /></mesh>;
    case 'eyelet': return <mesh material={mat}><torusGeometry args={[r * 0.75, r * 0.25, 10, 24]} /></mesh>;
    case 'label': case 'patch': return <mesh material={mat} position-z={0.0008}><boxGeometry args={[t.type === 'label' ? r * 2 : r * 2, t.type === 'label' ? r * 0.84 : r * 1.6, 0.0015]} /></mesh>;
    default: return null;
  }
}

function TrimsOnPart({ runner, part, g }: { runner: SimRunner; part: SimPart; g: Garment }) {
  const trims = trimsFor(g, part.key).filter((t) => t.type !== 'zipper' && t.type !== 'drawcord');
  const anchors = useMemo(() => trims.map((t) => anchorIn(part, t.x + part.anchor.x, t.y + part.anchor.y)), [trims.map((t) => t.id + t.x + t.y).join(), part]);
  const refs = useRef<(THREE.Group | null)[]>([]);
  const last = useRef(-1);
  useFrame(() => {
    const c = runner.cloth; if (!c || last.current === runner.frame) return;
    last.current = runner.frame;
    const p = c.pos, T = part.tris, s = part.start;
    anchors.forEach((an, i) => {
      const o = refs.current[i]; if (!an || !o) return;
      const ia = (s + T[an.t]) * 3, ib = (s + T[an.t + 1]) * 3, ic = (s + T[an.t + 2]) * 3;
      const [w0, w1, w2] = an.w;
      const pos = new THREE.Vector3(p[ia] * w0 + p[ib] * w1 + p[ic] * w2, p[ia + 1] * w0 + p[ib + 1] * w1 + p[ic + 1] * w2, p[ia + 2] * w0 + p[ib + 2] * w1 + p[ic + 2] * w2);
      const e1 = new THREE.Vector3(p[ib] - p[ia], p[ib + 1] - p[ia + 1], p[ib + 2] - p[ia + 2]), e2 = new THREE.Vector3(p[ic] - p[ia], p[ic + 1] - p[ia + 1], p[ic + 2] - p[ia + 2]);
      const n = e1.cross(e2).normalize();
      // orient outward: away from the body centre axis
      const out = new THREE.Vector3(pos.x, 0, pos.z); if (n.dot(out) < 0 && Math.abs(n.y) < 0.9) n.negate();
      o.position.copy(pos).addScaledVector(n, 0.0015);
      o.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), n);
    });
  });
  return <>{trims.map((t, i) => <group key={t.id} ref={(el) => { refs.current[i] = el; }}><TrimMesh t={t} /></group>)}</>;
}

export function ClothGarments({ runner, project, fitMap, texTick, paint }: { runner: SimRunner; project: Project; fitMap: boolean; texTick: number; paint: PaintHandlers | null }) {
  return (
    <group>
      {runner.parts.map((part) => {
        const g = project.garments.find((x) => x.id === part.garmentId);
        if (!g) return null;
        return <group key={runner.lookId + ':' + part.garmentId + ':' + part.key}>
          <ClothPart runner={runner} part={part} project={project} g={g} fitMap={fitMap} texTick={texTick} paint={paint} />
          <TrimsOnPart runner={runner} part={part} g={g} />
        </group>;
      })}
    </group>
  );
}
