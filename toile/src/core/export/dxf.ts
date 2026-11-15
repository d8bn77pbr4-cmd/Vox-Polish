import type { ExportSet } from './layout';

/** AutoCAD R12 ASCII DXF in mm (y flipped to DXF convention). */
export function patternDXF(set: ExportSet): string {
  const L: string[] = [];
  const add = (...a: (string | number)[]) => { for (const x of a) L.push(String(x)); };
  add(0, 'SECTION', 2, 'HEADER', 9, '$ACADVER', 1, 'AC1009', 9, '$INSUNITS', 70, 4, 0, 'ENDSEC');
  add(0, 'SECTION', 2, 'TABLES', 0, 'TABLE', 2, 'LAYER', 70, 5);
  for (const [n, c] of [['CUT', 1], ['SEW', 3], ['GRAIN', 5], ['NOTCH', 2], ['TEXT', 7]] as const) add(0, 'LAYER', 2, n, 70, 0, 62, c, 6, 'CONTINUOUS');
  add(0, 'ENDTAB', 0, 'ENDSEC', 0, 'SECTION', 2, 'ENTITIES');
  const f = (v: number) => v.toFixed(3);
  const poly = (layer: string, pts: { x: number; y: number }[], dx: number, dy: number, closed: boolean) => {
    add(0, 'POLYLINE', 8, layer, 66, 1, 70, closed ? 1 : 0);
    for (const q of pts) add(0, 'VERTEX', 8, layer, 10, f(q.x + dx), 20, f(-(q.y + dy)), 30, '0.0');
    add(0, 'SEQEND', 8, layer);
  };
  const line = (layer: string, x1: number, y1: number, x2: number, y2: number) => add(0, 'LINE', 8, layer, 10, f(x1), 20, f(-y1), 30, '0.0', 11, f(x2), 21, f(-y2), 31, '0.0');
  for (const p of set.pieces) {
    for (const s of p.sizes) {
      poly('CUT', s.cut, p.ox + s.dx, p.oy + s.dy, true);
      if (set.seamAllowance) poly('SEW', s.seam, p.ox + s.dx, p.oy + s.dy, true);
    }
    for (const n of p.notches) line('NOTCH', n.a.x + p.ox, n.a.y + p.oy, n.b.x + p.ox, n.b.y + p.oy);
    for (const l of p.internal) poly('SEW', l.pts, p.ox, p.oy, !!l.closed);
    const cx = (p.b.minX + p.b.maxX) / 2 + p.ox, cy = (p.b.minY + p.b.maxY) / 2 + p.oy, gl = (p.b.maxY - p.b.minY) * 0.3, ga = (p.grain * Math.PI) / 180;
    line('GRAIN', cx - Math.sin(ga) * gl, cy - Math.cos(ga) * gl, cx + Math.sin(ga) * gl, cy + Math.cos(ga) * gl);
    add(0, 'TEXT', 8, 'TEXT', 10, f(cx + 4), 20, f(-(cy - gl * 0.4)), 30, '0.0', 40, 8, 1, `${p.name} ${p.cut} Gr ${set.sizes.join('/')}`.replace(/[^\x20-\x7EäöüÄÖÜß×]/g, ''));
  }
  add(0, 'ENDSEC', 0, 'EOF');
  return L.join('\n') + '\n';
}
