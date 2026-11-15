import { jsPDF } from 'jspdf';
import type { ExportSet } from './layout';
import { sizeHue } from './layout';

export type Paper = 'A4' | 'A3' | 'plotter';
const SIZES = { A4: [210, 297], A3: [297, 420] } as const;
const MARGIN = 10, OVERLAP = 10;

export function tileGrid(W: number, H: number, paper: Exclude<Paper, 'plotter'>) {
  const [pw, ph] = SIZES[paper];
  const iw = pw - 2 * MARGIN, ih = ph - 2 * MARGIN;
  const cols = Math.max(1, Math.ceil((W - OVERLAP) / (iw - OVERLAP))), rows = Math.max(1, Math.ceil((H - OVERLAP) / (ih - OVERLAP)));
  return { cols, rows, pages: cols * rows, iw, ih, pw, ph };
}
const hsl = (h: number) => { const f = (n: number) => { const k = (n + h / 30) % 12, a = 0.7 * Math.min(0.4, 1 - 0.4); return Math.round(255 * (0.4 - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)))); }; return [f(0), f(8), f(4)] as [number, number, number]; };

function drawSet(doc: jsPDF, set: ExportSet, ox: number, oy: number, clip?: { x: number; y: number; w: number; h: number }) {
  for (const p of set.pieces) {
    if (clip) {
      const x0 = p.b.minX + p.ox + ox - 40, x1 = p.b.maxX + p.ox + ox + 40, y0 = p.b.minY + p.oy + oy - 40, y1 = p.b.maxY + p.oy + oy + 40;
      if (x1 < clip.x || x0 > clip.x + clip.w || y1 < clip.y || y0 > clip.y + clip.h) continue;
    }
    p.sizes.forEach((s, i) => {
      const c = set.sizes.length > 1 ? hsl(sizeHue(i, set.sizes.length)) : [0, 0, 0];
      doc.setDrawColor(c[0], c[1], c[2]); doc.setLineWidth(0.35); doc.setLineDashPattern([], 0);
      const P = (a: { x: number; y: number }[]) => a.map((q) => [q.x + p.ox + s.dx + ox, q.y + p.oy + s.dy + oy]);
      const cut = P(s.cut);
      doc.lines(cut.slice(1).map((q, k) => [q[0] - cut[k][0], q[1] - cut[k][1]]), cut[0][0], cut[0][1], [1, 1], 'S', true);
      if (set.seamAllowance) {
        doc.setLineWidth(0.2); doc.setLineDashPattern([3, 1.5], 0);
        const sw = P(s.seam);
        doc.lines(sw.slice(1).map((q, k) => [q[0] - sw[k][0], q[1] - sw[k][1]]), sw[0][0], sw[0][1], [1, 1], 'S', true);
      }
    });
    doc.setDrawColor(0, 0, 0); doc.setLineDashPattern([], 0); doc.setLineWidth(0.35);
    for (const n of p.notches) doc.line(n.a.x + p.ox + ox, n.a.y + p.oy + oy, n.b.x + p.ox + ox, n.b.y + p.oy + oy);
    doc.setDrawColor(90, 90, 90); doc.setLineWidth(0.2); doc.setLineDashPattern([2, 1.5], 0);
    for (const l of p.internal) { const a = l.closed ? [...l.pts, l.pts[0]] : l.pts; for (let k = 1; k < a.length; k++) doc.line(a[k - 1].x + p.ox + ox, a[k - 1].y + p.oy + oy, a[k].x + p.ox + ox, a[k].y + p.oy + oy); }
    doc.setLineDashPattern([], 0); doc.setDrawColor(0, 0, 0); doc.setLineWidth(0.3);
    const cx = (p.b.minX + p.b.maxX) / 2 + p.ox + ox, cy = (p.b.minY + p.b.maxY) / 2 + p.oy + oy, gl = (p.b.maxY - p.b.minY) * 0.3, ga = (p.grain * Math.PI) / 180;
    doc.line(cx - Math.sin(ga) * gl, cy - Math.cos(ga) * gl, cx + Math.sin(ga) * gl, cy + Math.cos(ga) * gl);
    doc.setFontSize(10); doc.setTextColor(0, 0, 0); doc.text(p.name, cx + 4, cy - gl * 0.4);
    doc.setFontSize(7); doc.text(`${set.garment} · ${p.cut} · Gr. ${set.sizes.join(', ')}`, cx + 4, cy - gl * 0.4 + 4);
  }
}
function control(doc: jsPDF, x: number, y: number) {
  doc.setDrawColor(0, 0, 0); doc.setLineWidth(0.4); doc.setLineDashPattern([], 0); doc.rect(x, y, 100, 100);
  doc.setFontSize(8); doc.text('Kontrollquadrat 10 × 10 cm – beim Drucken „Tatsächliche Größe“ wählen', x + 3, y + 6);
}

export function patternPDF(set: ExportSet, paper: Paper): Blob {
  if (paper === 'plotter') {
    const W = set.width + 2 * MARGIN, H = set.height + 2 * MARGIN + 120;
    const doc = new jsPDF({ unit: 'mm', format: [W, H], orientation: W > H ? 'landscape' : 'portrait' });
    drawSet(doc, set, MARGIN, MARGIN);
    control(doc, MARGIN, set.height + MARGIN + 15);
    return doc.output('blob');
  }
  const ctrlH = 115;
  const H = set.height + ctrlH;
  const t = tileGrid(set.width, H, paper);
  const doc = new jsPDF({ unit: 'mm', format: paper.toLowerCase(), orientation: 'portrait' });
  for (let r = 0; r < t.rows; r++) for (let c = 0; c < t.cols; c++) {
    if (r || c) doc.addPage(paper.toLowerCase(), 'portrait');
    const ox = MARGIN - c * (t.iw - OVERLAP), oy = MARGIN - r * (t.ih - OVERLAP);
    doc.saveGraphicsState();
    doc.rect(MARGIN, MARGIN, t.iw, t.ih, null as unknown as string); doc.clip(); doc.discardPath();
    drawSet(doc, set, ox, oy, { x: MARGIN, y: MARGIN, w: t.iw, h: t.ih });
    control(doc, ox, oy + set.height + 10);
    doc.restoreGraphicsState();
    doc.setDrawColor(160, 160, 160); doc.setLineWidth(0.2); doc.setLineDashPattern([1, 1], 0);
    doc.rect(MARGIN, MARGIN, t.iw, t.ih);
    doc.setLineDashPattern([], 0);
    // overlap guides
    doc.setDrawColor(200, 120, 120);
    doc.line(MARGIN + t.iw - OVERLAP, MARGIN, MARGIN + t.iw - OVERLAP, MARGIN + t.ih);
    doc.line(MARGIN, MARGIN + t.ih - OVERLAP, MARGIN + t.iw, MARGIN + t.ih - OVERLAP);
    const label = `${String.fromCharCode(65 + r)}${c + 1}`;
    doc.setFontSize(9); doc.setTextColor(120, 120, 120);
    doc.text(`${label} · Zeile ${r + 1}/${t.rows}, Spalte ${c + 1}/${t.cols} · rechts und unten 1 cm überlappen`, MARGIN, t.ph - 4);
    doc.setTextColor(0, 0, 0);
  }
  return doc.output('blob');
}
