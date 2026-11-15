import { useMemo } from 'react';
import * as THREE from 'three';
import type { Body, Cap } from '../core/sim/body';

function torsoGeometry(b: Body) {
  const r = b.rings, n = r.length, SEG = 56, ROWS = 70;
  const y0 = r[0].y, y1 = r[n - 1].y;
  const interp = (y: number, k: 'cx' | 'cz' | 'rx' | 'rz') => {
    let i = 0; while (i < n - 2 && y > r[i + 1].y) i++;
    const t = (y - r[i].y) / (r[i + 1].y - r[i].y), i0 = Math.max(0, i - 1), i3 = Math.min(n - 1, i + 2);
    const p0 = r[i0][k], p1 = r[i][k], p2 = r[i + 1][k], p3 = r[i3][k], t2 = t * t, t3 = t2 * t;
    const v = 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
    return Math.min(Math.max(v, Math.min(p1, p2) * 0.9), Math.max(p1, p2) * 1.06);
  };
  const pos: number[] = [], idx: number[] = [];
  for (let j = 0; j <= ROWS; j++) {
    const y = y0 + ((y1 - y0) * j) / ROWS;
    const cx = interp(y, 'cx'), cz = interp(y, 'cz'), rx = interp(y, 'rx'), rz = interp(y, 'rz');
    for (let i = 0; i <= SEG; i++) { const a = (i / SEG) * Math.PI * 2; pos.push(cx + Math.sin(a) * rx * 0.985, y, cz + Math.cos(a) * rz * 0.985); }
  }
  for (let j = 0; j < ROWS; j++) for (let i = 0; i < SEG; i++) { const a = j * (SEG + 1) + i, c = a + SEG + 1; idx.push(a, c, a + 1, a + 1, c, c + 1); }
  // bottom cap
  const cIdx = pos.length / 3; pos.push(interp(y0, 'cx'), y0 - 0.01, interp(y0, 'cz'));
  for (let i = 0; i < SEG; i++) idx.push(cIdx, i + 1, i);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
  return g;
}
function capGeometry(c: Cap) {
  const len = Math.hypot(c.b[0] - c.a[0], c.b[1] - c.a[1], c.b[2] - c.a[2]);
  const pts: THREE.Vector2[] = [];
  for (let i = 0; i <= 10; i++) { const t = -Math.PI / 2 + (i / 10) * (Math.PI / 2); pts.push(new THREE.Vector2(Math.cos(t) * c.ra * 0.985, Math.sin(t) * c.ra)); }
  for (let i = 0; i <= 10; i++) { const t = (i / 10) * (Math.PI / 2); pts.push(new THREE.Vector2(Math.cos(t) * c.rb * 0.985, len + Math.sin(t) * c.rb)); }
  const g = new THREE.LatheGeometry(pts, 32);
  const dir = new THREE.Vector3(c.b[0] - c.a[0], c.b[1] - c.a[1], c.b[2] - c.a[2]).normalize();
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir));
  g.translate(c.a[0], c.a[1], c.a[2]);
  return g;
}

export function Avatar({ body, hideFeet }: { body: Body; hideFeet?: boolean }) {
  const geos = useMemo(() => [torsoGeometry(body), ...body.caps.filter((c) => !(hideFeet && c.name.startsWith('foot'))).map(capGeometry)], [body, hideFeet]);
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#e7e1d6', roughness: 0.82, metalness: 0 }), []);
  return (
    <group>
      {geos.map((g, i) => <mesh key={i} geometry={g} material={mat} castShadow receiveShadow />)}
      <mesh position={body.head.c} material={mat} castShadow><sphereGeometry args={[body.head.r * 0.985, 40, 28]} /></mesh>
    </group>
  );
}
