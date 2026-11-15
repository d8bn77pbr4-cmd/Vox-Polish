import { jsPDF } from 'jspdf';
import type { Project, Material } from '../model';
import { resolveGarment, surfaceFor } from '../resolve';
import { getTemplate, defaultParams } from '../templates/registry';
import { SIZE_SYSTEMS, measurementsFor, sizeName } from '../sizing/charts';
import { seamReport } from '../pattern/checks';
import { TRIM_CATALOG, FINISH_NAMES } from '../textile/catalog';
import { piecePolygon } from '../pattern/piece';
import { bbox } from '../geometry/path';

const SEAMS: [RegExp, string][] = [[/^shoulder/, 'Schulter'], [/^side/, 'Seite'], [/^armholeF/, 'Armloch vorne'], [/^armholeB/, 'Armloch hinten'], [/^underarm/, 'Ärmelnaht'], [/^cuffend/, 'Bündchen Schluss'], [/^cuff_/, 'Bündchen'], [/^neck/, 'Halsausschnitt'], [/^hood_cb/, 'Kapuze Mitte'], [/^hoodneck/, 'Kapuze an Hals'], [/^band/, 'Saumbund'], [/^cf$/, 'Vordere Mitte'], [/^cb$/, 'Hintere Mitte'], [/^inseam/, 'Schrittnaht'], [/^outseam/, 'Seitennaht'], [/^wb_/, 'Bund'], [/^gore/, 'Keilnaht'], [/^cuff\d/, 'Umschlag']];
const seamLabel = (id: string) => { const f = SEAMS.find(([r]) => r.test(id)); const s = /_(L|R)$/.exec(id)?.[1]; return (f?.[1] ?? 'Eigene Naht') + (s ? (s === 'L' ? ' links' : ' rechts') : ''); };
const cmS = (mm: number) => (mm / 10).toFixed(1).replace('.', ',');

export function techPackData(project: Project, garmentId: string) {
  const g = project.garments.find((x) => x.id === garmentId)!;
  const t = getTemplate(g.templateId), res = resolveGarment(g);
  const sizes = g.size.system === 'custom' ? ['Maß'] : SIZE_SYSTEMS[g.size.system].labels;
  const poms = sizes.map((l) => (l === 'Maß' ? res.pom : t.build(measurementsFor({ system: g.size.system as 'womenEU', label: l }), { ...defaultParams(t), ...g.params }).pom));
  const pomRows = res.pom.map((p, i) => ({ label: p.label, values: poms.map((ps) => ps[i]?.value ?? NaN) }));
  const seamRows = seamReport(res.pieces, res.seams).map((r) => ({ name: seamLabel(r.seamId), a: r.la, b: r.lb, diff: r.diff, status: r.status }));
  const used = new Map<string, { m: Material; pieces: string[] }>();
  for (const inst of res.instances) {
    const b = surfaceFor(g, inst.key).layers.find((l) => l.kind === 'base');
    const m = b && b.kind === 'base' ? project.materials.find((x) => x.id === b.materialId) : undefined;
    if (!m) continue;
    const e = used.get(m.id) ?? { m, pieces: [] };
    if (!e.pieces.includes(inst.piece.name)) e.pieces.push(inst.piece.name);
    used.set(m.id, e);
  }
  const prints: { piece: string; name: string; kind: string; x: number; y: number; w: number; rot: number }[] = [];
  for (const inst of res.instances) for (const l of surfaceFor(g, inst.key).layers) {
    if (l.kind === 'image' || l.kind === 'text') prints.push({ piece: inst.piece.name + (inst.side === 'C' ? '' : inst.side === 'L' ? ' links' : ' rechts'), name: l.kind === 'text' ? `Text „${l.text}“` : l.name, kind: l.kind, x: l.x, y: l.y, w: l.kind === 'image' ? l.w : l.size, rot: l.rot });
    if (l.kind === 'pattern') prints.push({ piece: inst.piece.name, name: l.name, kind: 'pattern', x: 0, y: 0, w: l.pattern.scale, rot: l.pattern.angle });
  }
  const trims = new Map<string, { name: string; size: string; finish: string; color: string; qty: number }>();
  for (const tr of g.trims) {
    const c = TRIM_CATALOG.find((x) => x.type === tr.type)!;
    const size = c.unit === 'L' ? `${Math.round(tr.size / 0.635)} L (${tr.size.toFixed(1).replace('.', ',')} mm)` : `${Math.round(tr.size)} mm`;
    const k = [tr.type, size, tr.finish, tr.color].join('|');
    const e = trims.get(k) ?? { name: c.name + (tr.length ? ` ${cmS(tr.length)} cm` : ''), size, finish: FINISH_NAMES[tr.finish], color: tr.color, qty: 0 };
    e.qty += g.linkSides && tr.key.endsWith(':L') ? 2 : 1;
    trims.set(k, e);
  }
  return {
    garment: g, template: t, res, sizes, current: g.size.system === 'custom' ? 'Maß' : g.size.label, sizeName: sizeName(g.size),
    silhouette: t.silhouettes.find((s) => s.id === g.silhouetteId)?.name ?? '', pomRows, seamRows,
    materials: [...used.values()], prints, trims: [...trims.values()], palette: project.palette,
  };
}

export function techPackPDF(project: Project, garmentId: string, renders: { front?: string; back?: string } = {}): Blob {
  const d = techPackData(project, garmentId);
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'landscape' });
  const W = 297, H = 210, M = 14;
  const header = (title: string, n: number) => {
    doc.setFillColor(17, 17, 19); doc.rect(0, 0, W, 16, 'F');
    doc.setTextColor(216, 195, 160); doc.setFont('times', 'bold'); doc.setFontSize(15); doc.text('T O I L E', M, 10.5);
    doc.setTextColor(236, 233, 228); doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
    doc.text(`${title}  ·  ${d.garment.name}  ·  ${project.name}`, 60, 10.5);
    doc.text(`Tech Pack · Seite ${n} · ${new Date().toLocaleDateString('de-DE')}`, W - M, 10.5, { align: 'right' });
    doc.setTextColor(20, 20, 20);
  };
  // 1 cover
  header('Übersicht', 1);
  doc.setFont('times', 'bold'); doc.setFontSize(26); doc.text(d.garment.name, M, 34);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
  const info = [['Kategorie', d.template.name], ['Silhouette', d.silhouette], ['Grundgröße', d.sizeName], ['Größensatz', d.sizes.join(' · ')], ['Teile', String(d.res.pieces.length)], ['Lage im Look', String(d.garment.layer)]];
  info.forEach(([k, v], i) => { doc.setTextColor(120, 120, 120); doc.text(k, M, 46 + i * 7); doc.setTextColor(20, 20, 20); doc.text(v, M + 32, 46 + i * 7); });
  const imgW = 78, imgH = 120;
  if (renders.front) doc.addImage(renders.front, 'PNG', 115, 24, imgW, imgH, undefined, 'FAST');
  if (renders.back) doc.addImage(renders.back, 'PNG', 115 + imgW + 8, 24, imgW, imgH, undefined, 'FAST');
  doc.setFontSize(8); doc.setTextColor(120, 120, 120);
  if (renders.front) doc.text('Vorderansicht', 115, 148); if (renders.back) doc.text('Rückansicht', 115 + imgW + 8, 148);
  doc.setTextColor(20, 20, 20); doc.setFontSize(11); doc.text('Farbpalette', M, 100);
  d.palette.slice(0, 10).forEach((c, i) => { const n = parseInt(c.slice(1), 16); doc.setFillColor((n >> 16) & 255, (n >> 8) & 255, n & 255); doc.rect(M + i * 9, 104, 8, 8, 'F'); });
  doc.setFontSize(11); doc.text('Stoffe', M, 124);
  d.materials.forEach((e, i) => {
    const n = parseInt(e.m.color.slice(1), 16); doc.setFillColor((n >> 16) & 255, (n >> 8) & 255, n & 255); doc.rect(M, 128 + i * 9, 6, 6, 'F');
    doc.setFontSize(9); doc.text(`${e.m.name} · ${e.m.gsm} g/m² · ${e.m.composition}`, M + 9, 132 + i * 9);
  });
  // 2 pattern overview
  doc.addPage('a4', 'landscape'); header('Schnittübersicht', 2);
  const ps = d.res.pieces.map((p) => ({ p, poly: piecePolygon(p, 1), b: bbox(piecePolygon(p, 1)) }));
  const totalW = ps.reduce((a, q) => a + (q.b.maxX - q.b.minX) + 40, 0), maxH = Math.max(...ps.map((q) => q.b.maxY - q.b.minY));
  const rows = totalW > 2.6 * maxH * 2 ? 2 : 1;
  const perRow = Math.ceil(ps.length / rows);
  const scale = Math.min((W - 2 * M) / (ps.slice(0, perRow).reduce((a, q) => a + (q.b.maxX - q.b.minX) + 40, 0)), (H - 50) / rows / (maxH + 40));
  ps.forEach((q, i) => {
    const r = Math.floor(i / perRow), before = ps.slice(r * perRow, i).reduce((a, z) => a + (z.b.maxX - z.b.minX) + 40, 0);
    const ox = M + before * scale - q.b.minX * scale, oy = 30 + r * (maxH + 40) * scale - q.b.minY * scale;
    const P = q.poly.map((v) => [v.x * scale + ox, v.y * scale + oy]);
    doc.setDrawColor(20, 20, 20); doc.setLineWidth(0.3);
    doc.lines(P.slice(1).map((v, k) => [v[0] - P[k][0], v[1] - P[k][1]]), P[0][0], P[0][1], [1, 1], 'S', true);
    doc.setFontSize(8); doc.text(`${q.p.name} (${q.p.cut.count === 2 ? '2×' : '1×'})`, ox + q.b.minX * scale, oy + q.b.maxY * scale + 5);
  });
  doc.setFontSize(8); doc.setTextColor(120, 120, 120); doc.text(`Maßstab ca. 1:${Math.round(1 / scale)} · Schnitt 1:1 separat als PDF/DXF exportieren`, M, H - 8); doc.setTextColor(20, 20, 20);
  // 3 measurements & seams
  doc.addPage('a4', 'landscape'); header('Maßtabelle & Nähte', 3);
  doc.setFontSize(11); doc.text('Maßtabelle (Fertigmaße in cm)', M, 26);
  const colW = Math.min(16, (W - 2 * M - 62) / d.sizes.length);
  doc.setFontSize(8);
  d.sizes.forEach((s, i) => { doc.setFont('helvetica', s === d.current ? 'bold' : 'normal'); doc.text(s, M + 62 + i * colW + colW - 2, 33, { align: 'right' }); });
  d.pomRows.forEach((r, j) => {
    const y = 39 + j * 6;
    doc.setFont('helvetica', 'normal'); doc.text(r.label, M, y);
    r.values.forEach((v, i) => { doc.setFont('helvetica', d.sizes[i] === d.current ? 'bold' : 'normal'); doc.text(cmS(v), M + 62 + i * colW + colW - 2, y, { align: 'right' }); });
    doc.setDrawColor(225, 225, 225); doc.line(M, y + 1.8, M + 62 + d.sizes.length * colW, y + 1.8);
  });
  const sy = 45 + d.pomRows.length * 6;
  doc.setFontSize(11); doc.setFont('helvetica', 'normal'); doc.text('Nahtliste mit Längenprüfung (cm)', M, sy);
  doc.setFontSize(8);
  const half = Math.ceil(d.seamRows.length / 2);
  d.seamRows.forEach((r, i) => {
    const col = i < half ? 0 : 1, y = sy + 7 + (i % half) * 5.2, x = M + col * 135;
    if (y > H - 10) return;
    doc.text(r.name, x, y); doc.text(cmS(r.a), x + 60, y, { align: 'right' }); doc.text(cmS(r.b), x + 78, y, { align: 'right' });
    doc.setTextColor(r.status === 'ok' ? 40 : 190, r.status === 'ok' ? 130 : r.status === 'warn' ? 140 : 50, 60);
    doc.text(`${r.diff > 0 ? '+' : ''}${cmS(r.diff)}`, x + 96, y, { align: 'right' }); doc.setTextColor(20, 20, 20);
  });
  // 4 BOM
  doc.addPage('a4', 'landscape'); header('Material & Zutaten', 4);
  let y = 28;
  doc.setFontSize(11); doc.text('Stoffliste', M, y); y += 6; doc.setFontSize(8.5);
  for (const e of d.materials) { doc.text(`${e.m.name}`, M, y); doc.text(`${e.m.gsm} g/m²`, M + 60, y); doc.text(e.m.composition, M + 85, y); doc.text(e.pieces.join(', '), M + 160, y, { maxWidth: W - M - 160 - M }); y += 6; }
  y += 4; doc.setFontSize(11); doc.text('Zutaten', M, y); y += 6; doc.setFontSize(8.5);
  if (!d.trims.length) { doc.setTextColor(120, 120, 120); doc.text('keine', M, y); doc.setTextColor(20, 20, 20); y += 6; }
  for (const tr of d.trims) { doc.text(`${tr.qty} ×`, M, y); doc.text(tr.name, M + 12, y); doc.text(tr.size, M + 70, y); doc.text(tr.finish, M + 115, y); doc.text(tr.color, M + 150, y); y += 6; }
  y += 4; doc.setFontSize(11); doc.text('Drucke, Muster & Schriftzüge', M, y); y += 6; doc.setFontSize(8.5);
  if (!d.prints.length) { doc.setTextColor(120, 120, 120); doc.text('keine', M, y); doc.setTextColor(20, 20, 20); }
  for (const p of d.prints) {
    if (y > H - 10) break;
    doc.text(p.piece, M, y); doc.text(p.name, M + 55, y, { maxWidth: 70 });
    doc.text(p.kind === 'pattern' ? `Rapport ${cmS(p.w)} cm · ${p.rot}°` : `Mitte x ${cmS(p.x)} / y ${cmS(p.y)} cm ab HPS-Mitte · ${p.kind === 'text' ? 'Schrifthöhe' : 'Breite'} ${cmS(p.w)} cm · ${p.rot}°`, M + 130, y);
    y += 6;
  }
  return doc.output('blob');
}
