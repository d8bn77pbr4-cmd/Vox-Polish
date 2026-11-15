import { useState } from 'react';
import { FileDown, FileCode2, Printer, Ruler, FileText, Image as ImageIcon, Package, Layers } from 'lucide-react';
import { useApp, appStore } from '../state/store';
import { Dialog } from './common';
import { exportSet, allSizeLabels } from '../core/export/layout';
import { patternSVG } from '../core/export/svg';
import { patternDXF } from '../core/export/dxf';
import { patternPDF, type Paper } from '../core/export/pdf';
import { techPackPDF } from '../core/export/techpack';
import { notchMarks } from '../views/patternGeometry';
import { download } from '../views/ProjectsView';
import { exportProjectFile } from '../state/projectFile';
import { projectStore } from '../state/persistence';
import { fitApi } from '../views/FitView';
import { resolveGarment } from '../core/resolve';
import { surfaceRenderFor } from '../render2d/instanceSurface';
import { drawSurface } from '../render2d/compositor';
import { surfaceOutline } from '../render2d/frame';
import { bbox } from '../core/geometry/path';

/** centre crop of a rendered image to the given aspect (w/h) */
function cropPortrait(url: string | undefined, aspect: number): Promise<string | undefined> {
  if (!url) return Promise.resolve(undefined);
  return new Promise((res) => {
    const img = new Image();
    img.onload = () => {
      const h = img.height, w = Math.min(img.width, Math.round(h * aspect));
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      c.getContext('2d')!.drawImage(img, (img.width - w) / 2, 0, w, h, 0, 0, w, h);
      res(c.toDataURL('image/png'));
    };
    img.onerror = () => res(undefined);
    img.src = url;
  });
}
const safe = (s: string) => s.replace(/[^\wäöüÄÖÜß -]/g, '').trim() || 'toile';

export function ExportDialog({ onClose }: { onClose: () => void }) {
  const project = useApp((s) => s.project)!;
  const gidUi = useApp((s) => s.ui.garmentId);
  const [gid, setGid] = useState(gidUi ?? project.garments[0]?.id);
  const g = project.garments.find((x) => x.id === gid);
  const [sizes, setSizes] = useState<string[]>(g && g.size.system !== 'custom' ? [g.size.label] : []);
  const [sa, setSa] = useState(true);
  const [busy, setBusy] = useState('');
  const set = () => exportSet(g!, { sizes, seamAllowance: sa }, notchMarks);
  const run = async (label: string, f: () => Promise<void> | void) => { setBusy(label); try { await f(); } catch (e) { appStore.getState().toast('Export fehlgeschlagen: ' + (e as Error).message); } finally { setBusy(''); } };
  const name = g ? safe(`${project.name} ${g.name}`) : safe(project.name);
  const surfaces = () => {
    const res = resolveGarment(g!);
    const items = res.instances.map((inst) => ({ inst, sr: surfaceRenderFor(project, g!, inst, true), b: bbox(surfaceOutline(inst.piece)) }));
    const ppm = 3, gap = 30;
    let x = 0, y = 0, rowH = 0, W = 0; const pos: { x: number; y: number }[] = [];
    for (const it of items) { const w = it.b.maxX - it.b.minX, h = it.b.maxY - it.b.minY; if (x > 0 && x + w > 1600) { x = 0; y += rowH + gap; rowH = 0; } pos.push({ x: x - it.b.minX, y: y - it.b.minY }); x += w + gap; rowH = Math.max(rowH, h); W = Math.max(W, x); }
    const c = document.createElement('canvas'); c.width = Math.ceil(W * ppm); c.height = Math.ceil((y + rowH) * ppm);
    const ctx = c.getContext('2d')!;
    items.forEach((it, i) => { ctx.setTransform(ppm, 0, 0, ppm, pos[i].x * ppm, pos[i].y * ppm); drawSurface(ctx, it.sr); });
    return new Promise<Blob>((res) => c.toBlob((b) => res(b!), 'image/png'));
  };
  const Btn = ({ icon: I, label, sub, onClick }: { icon: typeof FileDown; label: string; sub: string; onClick: () => void }) => (
    <button className="card" style={{ padding: 12, flexDirection: 'row', gap: 10, alignItems: 'center' }} disabled={!!busy} onClick={onClick}>
      <I size={20} color="#d8c3a0" /><span><b style={{ display: 'block' }}>{busy === label ? 'Erstelle …' : label}</b><span className="muted small">{sub}</span></span>
    </button>
  );
  return (
    <Dialog title="Export" onClose={onClose}>
      {!g ? <div className="muted">Lege zuerst ein Kleidungsstück an.</div> : <>
        <div className="row" style={{ gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
          <select value={gid} onChange={(e) => { setGid(e.target.value); const ng = project.garments.find((x) => x.id === e.target.value); setSizes(ng && ng.size.system !== 'custom' ? [ng.size.label] : []); }}>
            {project.garments.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
          </select>
          <label className="row small"><input type="checkbox" checked={sa} onChange={(e) => setSa(e.target.checked)} /> mit Nahtzugabe</label>
          {allSizeLabels(g).length > 0 && <div className="row" style={{ gap: 4, flexWrap: 'wrap' }}><span className="muted small">Größen:</span>
            {allSizeLabels(g).map((l) => <button key={l} className={'btn small' + (sizes.includes(l) ? ' on' : '')} onClick={() => setSizes(sizes.includes(l) ? sizes.filter((s) => s !== l) : [...sizes, l])}>{l}</button>)}
            <button className="btn small ghost" onClick={() => setSizes(allSizeLabels(g))}>alle</button></div>}
        </div>
        <div className="muted small" style={{ marginBottom: 6 }}>Schnitt 1:1</div>
        <div className="cards" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', marginBottom: 16 }}>
          <Btn icon={Printer} label="PDF A4 gekachelt" sub="Zum Ausdrucken zu Hause, mit Klebemarken" onClick={() => run('PDF A4 gekachelt', () => download(patternPDF(set(), 'A4'), `${name} Schnitt A4.pdf`))} />
          <Btn icon={Printer} label="PDF A3 gekachelt" sub="Weniger Seiten" onClick={() => run('PDF A3 gekachelt', () => download(patternPDF(set(), 'A3' as Paper), `${name} Schnitt A3.pdf`))} />
          <Btn icon={Ruler} label="PDF Plotter" sub="Eine große Seite, Copyshop/Plotter" onClick={() => run('PDF Plotter', () => download(patternPDF(set(), 'plotter'), `${name} Schnitt Plotter.pdf`))} />
          <Btn icon={FileCode2} label="SVG 1:1" sub="Für Illustrator, Inkscape, Lasercutter" onClick={() => run('SVG 1:1', () => download(new Blob([patternSVG(set())], { type: 'image/svg+xml' }), `${name} Schnitt.svg`))} />
          <Btn icon={FileDown} label="DXF" sub="Für CAD und Zuschnittsysteme (mm)" onClick={() => run('DXF', () => download(new Blob([patternDXF(set())], { type: 'application/dxf' }), `${name} Schnitt.dxf`))} />
        </div>
        <div className="muted small" style={{ marginBottom: 6 }}>Präsentation & Produktion</div>
        <div className="cards" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}>
          <Btn icon={FileText} label="Tech Pack (PDF)" sub={fitApi.capture ? 'Mit 3D-Ansichten vorne/hinten' : 'Öffne einmal die Anprobe für 3D-Bilder'} onClick={() => run('Tech Pack (PDF)', async () => {
            const front = await cropPortrait(await fitApi.capture?.('front', 1400), 78 / 120), back = await cropPortrait(await fitApi.capture?.('back', 1400), 78 / 120);
            download(techPackPDF(project, g.id, { front, back }), `${name} Tech Pack.pdf`);
          })} />
          <Btn icon={ImageIcon} label="3D-Bild (PNG)" sub="Vorderansicht in hoher Auflösung" onClick={() => run('3D-Bild (PNG)', async () => {
            const url = await fitApi.capture?.('front', 2400);
            if (!url) { appStore.getState().toast('Öffne zuerst die Anprobe'); return; }
            const a = document.createElement('a'); a.href = url; a.download = `${name} 3D.png`; a.click();
          })} />
          <Btn icon={Layers} label="Design-Flächen (PNG)" sub="Alle gestalteten Teile, 3 px/mm" onClick={() => run('Design-Flächen (PNG)', async () => download(await surfaces(), `${name} Flächen.png`))} />
          <Btn icon={Package} label="Projektdatei (.toile)" sub="Sichern & mit Freunden teilen" onClick={() => run('Projektdatei (.toile)', async () => {
            download(await exportProjectFile(project, projectStore), `${safe(project.name)}.toile`);
            appStore.getState().silent((d) => { d.lastExportAt = Date.now(); });
          })} />
        </div>
      </>}
    </Dialog>
  );
}
