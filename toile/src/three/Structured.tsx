import { useMemo } from 'react';
import * as THREE from 'three';
import type { Garment, Project } from '../core/model';
import type { Body } from '../core/sim/body';
import { resolveGarment, surfaceFor } from '../core/resolve';
import { measurementsFor } from '../core/sizing/charts';
import { getTemplate, defaultParams } from '../core/templates/registry';
import { beltGeometry, type MeshData } from '../core/structured/belt';
import { sneakerGeometry } from '../core/structured/sneaker';
import { surfaceFrame, frameFor, toUV, surfaceOutline } from '../render2d/frame';
import { instanceTexture, atlasTexture, drawSurface, weaveTexture } from './textures';
import { surfaceRenderFor } from '../render2d/instanceSurface';
import { pieceAnchor } from '../core/pattern/piece';
import { bbox } from '../core/geometry/path';
import { materialOf } from '../core/sim/build';

const toGeo = (m: MeshData, scale = 1) => {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(scale === 1 ? m.positions : m.positions.map((v) => v * scale), 3));
  g.setAttribute('uv', new THREE.BufferAttribute(m.uvs, 2));
  g.setIndex(new THREE.BufferAttribute(m.indices, 1));
  g.computeVertexNormals();
  return g;
};
const physical = (map: THREE.Texture | null, rough: number, opts: Partial<THREE.MeshPhysicalMaterialParameters> = {}) =>
  new THREE.MeshPhysicalMaterial({ map, roughness: rough, side: THREE.DoubleSide, ...opts });

export function Belt3D({ project, g, body, texTick }: { project: Project; g: Garment; body: Body; texTick: number }) {
  const res = resolveGarment(g);
  const inst = res.instances.find((i) => i.pieceId === 'strap')!;
  const p = { ...defaultParams(getTemplate(g.templateId)), ...g.params } as { width: number; position: number; extra: number };
  const f = surfaceFrame(inst.piece), a = pieceAnchor(inst.piece);
  const strapLen = res.pom.find((x) => x.id === 'length')?.value ?? 900;
  const built = useMemo(() => beltGeometry(body, p, 0.006 + g.layer * 0.006, strapLen, (x, y) => toUV(f, x - a.x, y - a.y)), [body, JSON.stringify(p), g.layer, strapLen]);
  const geo = useMemo(() => toGeo(built.mesh), [built]);
  const tex = instanceTexture(project, g, inst);
  const m = materialOf(project, g, inst.key);
  const mat = useMemo(() => physical(tex, m.roughness, { sheen: m.sheen }), [tex, m.roughness, m.sheen, texTick]);
  const metal = useMemo(() => new THREE.MeshStandardMaterial({ color: '#cfcfd3', metalness: 1, roughness: 0.25 }), []);
  const w = p.width / 1000;
  return (
    <group>
      <mesh geometry={geo} material={mat} castShadow />
      <group position={[0, built.y, built.frontR + 0.004]}>
        {[[0, w * 0.62, w * 1.1, 0.004], [0, -w * 0.62, w * 1.1, 0.004], [-w * 0.55, 0, 0.004, w * 1.25], [w * 0.55, 0, 0.004, w * 1.25]].map(([x, y, bw, bh], i) => (
          <mesh key={i} position={[x, y, 0]} material={metal} castShadow><boxGeometry args={[bw, bh, 0.006]} /></mesh>
        ))}
        <mesh position={[0, 0, 0.003]} rotation-z={Math.PI / 2} material={metal}><cylinderGeometry args={[0.0015, 0.0015, w * 1.15, 8]} /></mesh>
      </group>
    </group>
  );
}

function ShoeSide({ project, g, side, body, texTick }: { project: Project; g: Garment; side: 'L' | 'R'; body: Body; texTick: number }) {
  const res = resolveGarment(g);
  const m = measurementsFor(g.size);
  const params = { ...defaultParams(getTemplate(g.templateId)), ...g.params };
  const geom = useMemo(() => sneakerGeometry(m, params), [JSON.stringify(m), JSON.stringify(params)]);
  const inst = (id: string) => res.instances.find((i) => i.key === `${id}:${side}`)!;
  // atlas frame over the whole flattened domain
  const db = bbox(geom.last.domain);
  const frame = useMemo(() => frameFor(db.minX, db.minY, db.maxX, db.maxY, 2048, 6, 4), [db.minX, db.minY, db.maxX, db.maxY]);
  const panelIds = ['quarterLat', 'quarterMed', 'vamp', 'heel'];
  const sig = JSON.stringify(panelIds.map((id) => [surfaceFor(g, inst(id).key).layers, inst(id).piece.nodes, g.linkSides])) + JSON.stringify(project.materials) + texTick;
  const atlas = atlasTexture(`${g.id}|upper|${side}`, frame, sig, (ctx) => {
    ctx.fillStyle = materialOf(project, g, inst('quarterLat').key).color;
    ctx.fillRect(frame.x0, frame.y0, frame.w / frame.pxPerMm, frame.h / frame.pxPerMm);
    for (const id of panelIds) {
      const it = inst(id), a = pieceAnchor(it.piece);
      const sr = surfaceRenderFor(project, g, it, true);
      const draws = it.piece.cut.fold ? [1, -1] : [1];
      for (const sy of draws) {
        ctx.save(); ctx.scale(1, sy); ctx.translate(a.x, a.y);
        drawSurface(ctx, { ...sr, outline: surfaceOutline(it.piece), edgeShade: true });
        ctx.setLineDash([2.2, 1.4]); ctx.lineWidth = 0.6; ctx.strokeStyle = 'rgba(0,0,0,0.45)';
        ctx.beginPath(); surfaceOutline(it.piece).forEach((q, i) => (i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y))); ctx.closePath(); ctx.stroke();
        ctx.restore();
      }
    }
  });
  const upperGeo = useMemo(() => {
    const u = geom.upper; const uvs = new Float32Array(u.flat.length);
    for (let i = 0; i < u.flat.length; i += 2) { const t = toUV(frame, u.flat[i], u.flat[i + 1]); uvs[i] = t[0]; uvs[i + 1] = t[1]; }
    return toGeo({ ...u, uvs }, 0.001);
  }, [geom, frame]);
  const tongueInst = inst('tongue'), ta = pieceAnchor(tongueInst.piece), tf = surfaceFrame(tongueInst.piece);
  const tongueGeo = useMemo(() => {
    const u = geom.tongue; const uvs = new Float32Array(u.flat.length);
    for (let i = 0; i < u.flat.length; i += 2) { const t = toUV(tf, u.flat[i] - ta.x, u.flat[i + 1] - ta.y); uvs[i] = t[0]; uvs[i + 1] = t[1]; }
    return toGeo({ ...u, uvs }, 0.001);
  }, [geom, tf.x0, tf.y0]);
  const soleInst = inst('sole'), sa = pieceAnchor(soleInst.piece), sf = surfaceFrame(soleInst.piece);
  const soleGeo = useMemo(() => {
    const u = geom.sole; const uvs = new Float32Array(u.flat.length);
    const cx = u.flat[u.flat.length - 2], cz = u.flat[u.flat.length - 1];
    for (let i = 0; i < u.flat.length; i += 2) {
      // sample a little inside the outline so the sidewall takes the sole colour, not the clipped edge
      const dx = u.flat[i] - cx, dz = u.flat[i + 1] - cz, l = Math.hypot(dx, dz) || 1, k = Math.max(0, l - 9) / l;
      const t = toUV(sf, cx + dx * k - sa.x, geom.last.FL - (cz + dz * k) - sa.y); uvs[i] = t[0]; uvs[i + 1] = t[1];
    }
    return toGeo({ ...u, uvs }, 0.001);
  }, [geom, sf.x0, sf.y0]);
  const upperMat = materialOf(project, g, inst('vamp').key);
  const mats = useMemo(() => ({
    upper: physical(atlas, upperMat.roughness, { sheen: upperMat.sheen, normalMap: weaveTexture(upperMat.weave, frame.w / frame.pxPerMm, frame.h / frame.pxPerMm), normalScale: new THREE.Vector2(0.4, 0.4) }),
    tongue: physical(instanceTexture(project, g, tongueInst), 0.8),
    sole: physical(instanceTexture(project, g, soleInst), 0.75),
  }), [atlas, texTick, upperMat.roughness, upperMat.weave, project.materials]);
  const laceColor = materialOf(project, g, inst('laces').key).color;
  const lacesGeo = useMemo(() => geom.laces.map((pts) => new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map((q) => new THREE.Vector3(q[0] / 1000, q[1] / 1000, q[2] / 1000)), false, 'catmullrom', 0.1), Math.max(8, pts.length * 8), 0.0022, 6, false)), [geom]);
  const ft = body.feet[side];
  const dir = new THREE.Vector3(ft.toe[0] - ft.heel[0], 0, ft.toe[2] - ft.heel[2]).normalize();
  const rotY = Math.atan2(dir.x, dir.z);
  return (
    <group position={[ft.heel[0], 0, ft.heel[2]]} rotation-y={rotY} scale={[side === 'R' ? -1 : 1, 1, 1]}>
      <mesh geometry={upperGeo} material={mats.upper} castShadow />
      <mesh geometry={tongueGeo} material={mats.tongue} castShadow />
      <mesh geometry={soleGeo} material={mats.sole} castShadow receiveShadow />
      {lacesGeo.map((lg, i) => <mesh key={i} geometry={lg} castShadow><meshStandardMaterial color={laceColor} roughness={0.9} /></mesh>)}
      {geom.eyes.flatMap((e, i) => [e.lat, e.med].map((q, k) => <mesh key={`${i}${k}`} position={[q[0] / 1000, q[1] / 1000 - 0.002, q[2] / 1000]}><sphereGeometry args={[0.0028, 10, 8]} /><meshStandardMaterial color="#bfbfc4" metalness={1} roughness={0.3} /></mesh>))}
    </group>
  );
}

export function Sneakers3D(props: { project: Project; g: Garment; body: Body; texTick: number }) {
  return <>{(['L', 'R'] as const).map((s) => <ShoeSide key={s} side={s} {...props} />)}</>;
}
