import { describe, it, expect } from 'vitest';
import { newProject, newGarment } from '../src/core/model';
import { MATERIAL_PRESETS } from '../src/core/textile/materials';
import { patternSVG } from '../src/core/export/svg';
import { patternDXF } from '../src/core/export/dxf';
import { tileGrid } from '../src/core/export/pdf';
import { techPackData } from '../src/core/export/techpack';
import { exportSet } from '../src/core/export/layout';
import { resolveGarment } from '../src/core/resolve';

const setup = () => {
  const pr = newProject('Look', 'women', MATERIAL_PRESETS);
  const g = newGarment('hoodie', 'regular', pr); pr.garments.push(g);
  return { pr, g };
};

describe('exports', () => {
  it('SVG is 1:1 in mm with a 100 mm control square', () => {
    const { g } = setup();
    const svg = patternSVG(exportSet(g, { sizes: ['38'], seamAllowance: true }));
    expect(svg).toMatch(/width="[\d.]+mm"/);
    const m = /<rect id="control" x="([\d.-]+)" y="([\d.-]+)" width="([\d.]+)" height="([\d.]+)"/.exec(svg)!;
    expect(Number(m[3])).toBe(100); expect(Number(m[4])).toBe(100);
    const vb = /viewBox="([\d.-]+) ([\d.-]+) ([\d.]+) ([\d.]+)"/.exec(svg)!;
    const w = Number(/width="([\d.]+)mm"/.exec(svg)![1]);
    expect(Number(vb[3])).toBeCloseTo(w, 3);
  });
  it('DXF has one closed polyline per piece on layer CUT, in mm', () => {
    const { g } = setup();
    const set = exportSet(g, { sizes: ['38'], seamAllowance: true });
    const dxf = patternDXF(set);
    const polys = dxf.split('\n0\nPOLYLINE\n').slice(1).filter((s) => s.startsWith('8\nCUT\n'));
    expect(polys.length).toBe(resolveGarment(g).pieces.length);
    expect(dxf).toContain('$INSUNITS\n70\n4');
    for (const p of polys) expect(p).toMatch(/\n70\n1\n/);
  });
  it('tiles a 1200 × 800 mm layout onto A4 with 10 mm overlap', () => {
    const t = tileGrid(1200, 800, 'A4');
    expect(t.cols).toBe(7); expect(t.rows).toBe(3); expect(t.pages).toBe(21);
  });
  it('tech pack lists every POM and seam', () => {
    const { pr, g } = setup();
    const d = techPackData(pr, g.id);
    expect(d.pomRows.length).toBe(resolveGarment(g).pom.length);
    expect(d.sizes.length).toBe(9);
    expect(d.seamRows.length).toBe(resolveGarment(g).seams.length);
    expect(d.materials.length).toBeGreaterThan(0);
  });
});

describe('pdf smoke', () => {
  it('pattern PDF (A4 + plotter) and tech pack render', async () => {
    const { patternPDF } = await import('../src/core/export/pdf');
    const { techPackPDF } = await import('../src/core/export/techpack');
    const { pr, g } = setup();
    const set = exportSet(g, { sizes: ['36', '38', '40'], seamAllowance: true });
    const a4 = patternPDF(set, 'A4');
    expect(a4.size).toBeGreaterThan(5000);
    expect(patternPDF(set, 'plotter').size).toBeGreaterThan(3000);
    expect(techPackPDF(pr, g.id).size).toBeGreaterThan(5000);
  });
});
