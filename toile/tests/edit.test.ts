import { describe, it, expect } from 'vitest';
import { insertNode, deleteNode, toggleCurve, moveNodes, nearestOnOutline, mirrorPartner, makeCustomPiece } from '../src/core/pattern/edit';
import { piecePolygon, edgeLength } from '../src/core/pattern/piece';
import { polygonArea } from '../src/core/geometry/path';
import { piece, nd, P } from '../src/core/templates/helpers';

const sq = () => piece('sq', 'Quadrat', [nd('a', 0, 0), nd('b', 100, 0, null, null), nd('c', 100, 100), nd('d', 0, 100)], { placement: { zone: 'none' } });

describe('pattern edit ops', () => {
  it('insertNode on a straight segment keeps the outline', () => {
    const p = insertNode(sq(), 0, 0.5);
    expect(p.nodes).toHaveLength(5);
    expect(p.nodes[1]).toMatchObject({ x: 50, y: 0 });
    expect(Math.abs(polygonArea(piecePolygon(p)))).toBeCloseTo(10000, 3);
  });
  it('insertNode on a cubic splits exactly (length preserved)', () => {
    const c = piece('c', 'C', [nd('a', 0, 0, null, P(40, -40)), nd('b', 100, 0, P(60, -40)), nd('c', 100, 100), nd('d', 0, 100)], { placement: { zone: 'none' } });
    const before = edgeLength(c, 'a', 'b');
    const s = insertNode(c, 0, 0.3);
    expect(edgeLength(s, 'a', s.nodes[1].id) + edgeLength(s, s.nodes[1].id, 'b')).toBeCloseTo(before, 1);
  });
  it('deleteNode keeps at least 3 nodes', () => {
    let p = deleteNode(sq(), 'a');
    expect(p.nodes.map((n) => n.id)).toEqual(['b', 'c', 'd']);
    p = deleteNode(p, 'b');
    expect(p.nodes).toHaveLength(3);
  });
  it('toggleCurve adds and removes handles', () => {
    const p = toggleCurve(sq(), 'b');
    expect(p.nodes[1].hin && p.nodes[1].hout).toBeTruthy();
    expect(toggleCurve(p, 'b').nodes[1].hin).toBeNull();
  });
  it('moveNodes moves handles along', () => {
    const p = moveNodes(toggleCurve(sq(), 'b'), ['b'], 10, 5);
    expect(p.nodes[1]).toMatchObject({ x: 110, y: 5 });
  });
  it('nearestOnOutline finds the segment', () => {
    const r = nearestOnOutline(sq(), { x: 30, y: -2 });
    expect(r.seg).toBe(0); expect(r.t).toBeCloseTo(0.3, 2); expect(r.dist).toBeCloseTo(2, 3);
  });
  it('mirrorPartner finds symmetric node', () => {
    const p = piece('m', 'M', [nd('l', -50, 0), nd('r', 50, 0), nd('b', 0, 80)], { placement: { zone: 'none' } });
    expect(mirrorPartner(p, 'l')).toBe('r');
    expect(mirrorPartner(p, 'b')).toBeNull();
  });
  it('makeCustomPiece builds a closed piece with unique node ids', () => {
    const c = makeCustomPiece([P(0, 0), P(50, 0), P(50, 40)], 'Tasche', 'torsoFront');
    expect(c.nodes).toHaveLength(3);
    expect(new Set(c.nodes.map((n) => n.id)).size).toBe(3);
    expect(c.placement.zone).toBe('torsoFront');
  });
});
