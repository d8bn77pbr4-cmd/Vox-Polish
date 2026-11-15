import { useEffect, useRef, useState } from 'react';
import { Upload, Link as LinkIcon, Trash2, Shirt, Stamp, Grid2x2 } from 'lucide-react';
import { useApp, appStore } from '../../state/store';
import { Panel } from '../common';
import { listLibrary, addToLibrary, removeFromLibrary, importFromUrl, onLibrary, renameLibrary, type LibraryItem } from '../../state/library';
import { projectStore } from '../../state/persistence';
import { addLayer, addMaterial, applyMaterial } from '../../state/designActions';

const urls = new Map<string, string>();
export function useThumb(id: string | null): string | undefined {
  const [u, setU] = useState(id ? urls.get(id) : undefined);
  useEffect(() => {
    if (!id) { setU(undefined); return; }
    if (urls.has(id)) { setU(urls.get(id)); return; }
    let live = true;
    void projectStore.getAsset(id).then((b) => { if (b && live) { const x = URL.createObjectURL(b); urls.set(id, x); setU(x); } });
    return () => { live = false; };
  }, [id]);
  return u;
}
function Thumb({ it, sel, onClick }: { it: LibraryItem; sel: boolean; onClick: () => void }) {
  const u = useThumb(it.id);
  return (
    <button className={'card' + (sel ? ' sel' : '')} onClick={onClick} draggable onDragStart={(e) => { e.dataTransfer.setData('application/x-toile-asset', it.id); e.dataTransfer.effectAllowed = 'copy'; }} title={it.name}>
      <div className="thumb" style={{ aspectRatio: '1', background: u ? `url(${u}) center/cover` : undefined }} />
    </button>
  );
}

export function GalleryPanel() {
  const ui = useApp((s) => s.ui);
  const project = useApp((s) => s.project)!;
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  useEffect(() => { const r = () => void listLibrary().then(setItems); r(); return onLibrary(r); }, []);
  const g = project.garments.find((x) => x.id === ui.garmentId);
  const sel = items.find((i) => i.id === ui.galleryId);
  const pick = (id: string) => appStore.getState().setUi({ galleryId: id });
  const addFiles = async (files: FileList | File[]) => {
    setBusy(true);
    try { let last = ''; for (const f of [...files]) if (f.type.startsWith('image/')) last = (await addToLibrary(f, f.name)).id; if (last) pick(last); }
    catch (e) { appStore.getState().toast('Bild konnte nicht gelesen werden: ' + (e as Error).message); }
    finally { setBusy(false); }
  };
  const fromUrl = async () => {
    if (!url.trim()) return;
    setBusy(true);
    try { const it = await importFromUrl(url.trim()); pick(it.id); setUrl(''); }
    catch { appStore.getState().toast('Die Seite erlaubt kein direktes Laden. Bild speichern (z. B. in Fotos) und über „Mediathek“ holen – oder kopieren und hier einfügen.'); }
    finally { setBusy(false); }
  };
  const asPrint = () => g && ui.instanceKey && sel && addLayer(g.id, ui.instanceKey, 'image', { assetId: sel.id, name: sel.name });
  const asFabric = () => {
    if (!g || !ui.instanceKey || !sel) return;
    const id = addMaterial({ name: sel.name, textureAssetId: sel.id, color: '#ffffff', repeat: 120 });
    applyMaterial(g.id, ui.instanceKey, id, 'garment');
    appStore.getState().setUi({ materialId: id });
  };
  const asMotif = () => g && ui.instanceKey && sel && addLayer(g.id, ui.instanceKey, 'pattern', { name: 'Motiv ' + sel.name, pattern: { type: 'motif', colors: ['transparent'], scale: 120, angle: 0, motifAssetId: sel.id, repeat: 'half-drop' } });
  return (
    <Panel title="Galerie" right={busy ? <span className="muted small">lädt …</span> : undefined}>
      <div className="row" style={{ gap: 4 }}>
        <button className="btn small" style={{ flex: 1 }} onClick={() => fileRef.current?.click()}><Upload size={12} /> Mediathek / Dateien</button>
        <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => { if (e.target.files) void addFiles(e.target.files); e.target.value = ''; }} />
      </div>
      <div className="row" style={{ gap: 4 }}>
        <input type="url" placeholder="Bild-Adresse (https://…)" value={url} onChange={(e) => setUrl(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && fromUrl()} style={{ flex: 1 }} />
        <button className="btn small" onClick={fromUrl}><LinkIcon size={12} /></button>
      </div>
      <div onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); if (e.dataTransfer.files.length) void addFiles(e.dataTransfer.files); }}
        style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6, minHeight: 60, border: items.length ? 0 : '1px dashed var(--line2)', borderRadius: 8, padding: items.length ? 0 : 10 }}>
        {items.length === 0 && <span className="muted small" style={{ gridColumn: '1 / -1' }}>Bilder hierher ziehen, aus der Mediathek wählen oder mit ⌘V einfügen (z. B. ein bei Pinterest kopiertes Muster).</span>}
        {items.map((it) => <Thumb key={it.id} it={it} sel={it.id === ui.galleryId} onClick={() => pick(it.id)} />)}
      </div>
      {sel && <>
        <div className="row"><input type="text" value={sel.name} onChange={(e) => void renameLibrary(sel.id, e.target.value)} style={{ flex: 1 }} /><span className="muted small">{sel.w}×{sel.h}</span>
          <button className="btn ghost icon danger" title="Aus Galerie entfernen" onClick={() => { void removeFromLibrary(sel.id); appStore.getState().setUi({ galleryId: null }); }}><Trash2 size={13} /></button></div>
        <div className="grid3">
          <button className="btn small" onClick={asPrint} title="Als platzierten Druck auf das aktuelle Teil"><Stamp size={12} /> Druck</button>
          <button className="btn small" onClick={asFabric} title="Als Stoff (Rapport) für das ganze Kleidungsstück"><Shirt size={12} /> Stoff</button>
          <button className="btn small" onClick={asMotif} title="Als Muster-Rapport (halb versetzt)"><Grid2x2 size={12} /> Motiv</button>
        </div>
        <div className="muted small">Tipp: Bild direkt auf die Fläche oder das 3D-Modell ziehen.</div>
      </>}
    </Panel>
  );
}
