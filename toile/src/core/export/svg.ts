import type { ExportSet } from './layout';
import { sizeHue } from './layout';

const pts = (a: { x: number; y: number }[], dx: number, dy: number) => a.map((q) => `${(q.x + dx).toFixed(2)},${(q.y + dy).toFixed(2)}`).join(' ');
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/** 1:1 pattern sheet (units mm). */
export function patternSVG(set: ExportSet): string {
  const M = 20, ctrl = 100;
  const W = set.width + 2 * M, H = set.height + 2 * M + ctrl + 30;
  const out: string[] = [];
  out.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${W.toFixed(2)}mm" height="${H.toFixed(2)}mm" viewBox="${-M} ${-M} ${W.toFixed(2)} ${H.toFixed(2)}" font-family="Helvetica, Arial, sans-serif">`);
  out.push(`<title>${esc(set.garment)} – Schnitt 1:1</title>`);
  set.pieces.forEach((p) => {
    out.push(`<g id="${esc(p.id)}">`);
    p.sizes.forEach((s, i) => {
      const col = set.sizes.length > 1 ? `hsl(${sizeHue(i, set.sizes.length)},70%,40%)` : '#000';
      out.push(`<polygon points="${pts(s.cut, p.ox + s.dx, p.oy + s.dy)}" fill="none" stroke="${col}" stroke-width="0.35"/>`);
      if (set.seamAllowance) out.push(`<polygon points="${pts(s.seam, p.ox + s.dx, p.oy + s.dy)}" fill="none" stroke="${col}" stroke-width="0.25" stroke-dasharray="3 1.5"/>`);
    });
    for (const l of p.internal) out.push(`<polyline points="${pts(l.closed ? [...l.pts, l.pts[0]] : l.pts, p.ox, p.oy)}" fill="none" stroke="#555" stroke-width="0.25" stroke-dasharray="2 1.5"/>`);
    for (const n of p.notches) out.push(`<line x1="${(n.a.x + p.ox).toFixed(2)}" y1="${(n.a.y + p.oy).toFixed(2)}" x2="${(n.b.x + p.ox).toFixed(2)}" y2="${(n.b.y + p.oy).toFixed(2)}" stroke="#000" stroke-width="0.35"/>`);
    const cx = (p.b.minX + p.b.maxX) / 2 + p.ox, cy = (p.b.minY + p.b.maxY) / 2 + p.oy, gl = (p.b.maxY - p.b.minY) * 0.3, ga = (p.grain * Math.PI) / 180;
    const x1 = cx - Math.sin(ga) * gl, y1 = cy - Math.cos(ga) * gl, x2 = cx + Math.sin(ga) * gl, y2 = cy + Math.cos(ga) * gl;
    out.push(`<line x1="${x1.toFixed(2)}" y1="${y1.toFixed(2)}" x2="${x2.toFixed(2)}" y2="${y2.toFixed(2)}" stroke="#000" stroke-width="0.3"/>`);
    const fs = Math.max(4, Math.min(9, (p.b.maxX - p.b.minX) / 14));
    out.push(`<text x="${(cx + 4).toFixed(2)}" y="${(cy - gl * 0.4).toFixed(2)}" font-size="${fs}" font-weight="bold">${esc(p.name)}</text>`);
    out.push(`<text x="${(cx + 4).toFixed(2)}" y="${(cy - gl * 0.4 + fs * 1.3).toFixed(2)}" font-size="${fs * 0.7}">${esc(set.garment)} · ${p.cut} · Gr. ${esc(set.sizes.join(', '))}</text>`);
    out.push('</g>');
  });
  const cy = set.height + 30;
  out.push(`<rect id="control" x="0" y="${cy.toFixed(2)}" width="${ctrl}" height="${ctrl}" fill="none" stroke="#000" stroke-width="0.4"/>`);
  out.push(`<text x="4" y="${(cy + 10).toFixed(2)}" font-size="5">Kontrollquadrat 10 × 10 cm</text>`);
  out.push(`<text x="${ctrl + 8}" y="${(cy + 10).toFixed(2)}" font-size="5">${esc(set.garment)} · TOILE · ${set.seamAllowance ? 'mit' : 'ohne'} Nahtzugabe · Maßstab 1:1</text>`);
  out.push('</svg>');
  return out.join('\n');
}
