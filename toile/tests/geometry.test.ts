import { describe, it, expect } from 'vitest';
import { flattenPath, edgePolyline, polylineLength, polygonArea, resamplePolyline, pointAtLength, pointInPolygon, bbox, widthAtY, type PathNode } from '../src/core/geometry/path';
import { offsetPolygon } from '../src/core/geometry/offset';
import { meshPolygon } from '../src/core/geometry/mesh';
import type { Vec2 } from '../src/core/geometry/vec';

const square: PathNode[] = [
  { id: 'a', x: 0, y: 0 }, { id: 'b', x: 100, y: 0 }, { id: 'c', x: 100, y: 100 }, { id: 'd', x: 0, y: 100 },
];
const closedLen = (pts: Vec2[]) => polylineLength([...pts, pts[0]]);

describe('path', () => {
  it('square has perimeter 400 and area 10000', () => {
    const f = flattenPath(square);
    expect(closedLen(f.pts)).toBeCloseTo(400, 6);
    expect(Math.abs(polygonArea(f.pts))).toBeCloseTo(10000, 6);
    expect(f.nodeIdx).toEqual([0, 1, 2, 3]);
  });
  it('cubic quarter circle length within 0.2%', () => {
    const r = 100, k = 0.5523 * r;
    const nodes: PathNode[] = [
      { id: 'p', x: r, y: 0, hout: { x: r, y: k } },
      { id: 'q', x: 0, y: r, hin: { x: k, y: r } },
      { id: 'o', x: 0, y: 0 },
    ];
    const e = edgePolyline(nodes, 'p', 'q');
    expect(Math.abs(polylineLength(e) - (Math.PI * r) / 2) / ((Math.PI * r) / 2)).toBeLessThan(0.002);
  });
  it('edgePolyline wraps across node 0', () => {
    const e = edgePolyline(square, 'd', 'b');
    expect(e[0]).toEqual({ x: 0, y: 100 });
    expect(e[e.length - 1]).toEqual({ x: 100, y: 0 });
    expect(polylineLength(e)).toBeCloseTo(200, 6);
  });
  it('resample and pointAtLength', () => {
    const line = [{ x: 0, y: 0 }, { x: 100, y: 0 }];
    const r = resamplePolyline(line, 5);
    expect(r.map((p) => p.x)).toEqual([0, 25, 50, 75, 100]);
    expect(pointAtLength(line, 30).x).toBeCloseTo(30);
  });
  it('pointInPolygon, bbox, widthAtY', () => {
    const p = flattenPath(square).pts;
    expect(pointInPolygon({ x: 50, y: 50 }, p)).toBe(true);
    expect(pointInPolygon({ x: 150, y: 50 }, p)).toBe(false);
    expect(bbox(p)).toEqual({ minX: 0, minY: 0, maxX: 100, maxY: 100 });
    expect(widthAtY(p, 40)).toEqual({ minX: 0, maxX: 100 });
    expect(widthAtY(p, 140)).toBeNull();
  });
});

describe('offset', () => {
  it('grows square by 10 on each side for both windings', () => {
    const p = flattenPath(square).pts;
    for (const poly of [p, [...p].reverse()]) {
      const o = offsetPolygon(poly, [10, 10, 10, 10]);
      const b = bbox(o);
      expect(b.minX).toBeCloseTo(-10); expect(b.minY).toBeCloseTo(-10);
      expect(b.maxX).toBeCloseTo(110); expect(b.maxY).toBeCloseTo(110);
    }
  });
});

describe('mesh', () => {
  it('meshes a rectangle cleanly', () => {
    const rect = flattenPath([{ id: 'a', x: 0, y: 0 }, { id: 'b', x: 300, y: 0 }, { id: 'c', x: 300, y: 400 }, { id: 'd', x: 0, y: 400 }]).pts;
    const boundary = resamplePolyline([...rect, rect[0]], 71).slice(0, 70);
    const m = meshPolygon(boundary, 20);
    expect(m.boundaryCount).toBe(70);
    for (let i = 0; i < 70; i++) expect(m.pts[i]).toEqual(boundary[i]);
    expect(m.pts.length).toBeGreaterThan(250);
    for (let t = 0; t < m.tris.length; t += 3) {
      const [a, b, c] = [m.pts[m.tris[t]], m.pts[m.tris[t + 1]], m.pts[m.tris[t + 2]]];
      const cen = { x: (a.x + b.x + c.x) / 3, y: (a.y + b.y + c.y) / 3 };
      expect(pointInPolygon(cen, boundary)).toBe(true);
      expect(Math.abs((b.x - a.x) * (c.y - a.y) - (c.x - a.x) * (b.y - a.y)) / 2).toBeGreaterThan(1e-6);
    }
  });
});
