import { useRef } from 'react';
import { Plus, Upload, X } from 'lucide-react';
import { useApp, appStore } from '../../state/store';
import { Panel, Slider, cm } from '../common';
import { surfaceFor } from '../../core/resolve';
import type { Weave } from '../../core/model';
import { addMaterial, updateMaterial, applyMaterial } from '../../state/designActions';
import { addToLibrary } from '../../state/library';
import { BASE_COLORS } from '../../core/textile/catalog';
import { getBitmap } from '../../render2d/assets';
import { useThumb } from './GalleryPanel';

const WEAVES: [Weave, string][] = [['jersey', 'Jersey (Masche)'], ['knit', 'Strick / Sweat'], ['rib', 'Rippe'], ['twill', 'Köper (Denim, Gabardine)'], ['plain', 'Leinwand'], ['canvas', 'Canvas'], ['satin', 'Satin'], ['velvet', 'Samt'], ['leather', 'Leder'], ['boucle', 'Bouclé'], ['rubber', 'Gummi']];

function Swatch({ color, tex }: { color: string; tex?: string | null }) {
  const url = useThumb(tex ?? null);
  return <span style={{ width: 22, height: 22, borderRadius: 6, flex: '0 0 auto', border: '1px solid var(--line2)', background: url ? `url(${url}) center/cover` : color }} />;
}

export function MaterialPanel() {
  const project = useApp((s) => s.project)!;
  const ui = useApp((s) => s.ui);
  const fileRef = useRef<HTMLInputElement>(null);
  const g = project.garments.find((x) => x.id === ui.garmentId);
  const base = g && ui.instanceKey ? surfaceFor(g, ui.instanceKey).layers.find((l) => l.kind === 'base') : undefined;
  const curId = ui.materialId ?? (base?.kind === 'base' ? base.materialId : project.materials[0]?.id);
  const m = project.materials.find((x) => x.id === curId);
  const set = (id: string) => appStore.getState().setUi({ materialId: id });
  const upload = async (f?: File) => {
    if (!f) return;
    const it = await addToLibrary(f, f.name);
    const id = addMaterial({ name: it.name, textureAssetId: it.id, color: '#ffffff', repeat: 120 });
    set(id);
    if (g && ui.instanceKey) applyMaterial(g.id, ui.instanceKey, id, 'garment');
  };
  return (
    <Panel title="Stoffe" right={<span className="row" style={{ gap: 4 }}>
      <button className="btn small" title="Bild als Stoff" onClick={() => fileRef.current?.click()}><Upload size={12} /></button>
      <button className="btn small" title="Neuer Stoff" onClick={() => set(addMaterial({}))}><Plus size={12} /></button>
      <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => { void upload(e.target.files?.[0]); e.target.value = ''; }} /></span>}>
      <div className="list" style={{ maxHeight: 190, overflowY: 'auto' }}>
        {project.materials.map((x) => (
          <div key={x.id} className={'item' + (x.id === curId ? ' sel' : '')} onClick={() => set(x.id)}>
            <Swatch color={x.color} tex={x.textureAssetId} /><span style={{ flex: 1 }}>{x.name}</span><span className="meta">{x.gsm} g/m²</span>
          </div>
        ))}
      </div>
      {m && g && ui.instanceKey && <>
        <div className="grid3">
          <button className="btn small" onClick={() => applyMaterial(g.id, ui.instanceKey!, m.id, 'piece')}>Dieses Teil</button>
          <button className="btn small" onClick={() => applyMaterial(g.id, ui.instanceKey!, m.id, 'same')}>Gleiche Teile</button>
          <button className="btn small" onClick={() => applyMaterial(g.id, ui.instanceKey!, m.id, 'garment')}>Ganzes Teil</button>
        </div>
        <input type="text" value={m.name} onChange={(e) => updateMaterial(m.id, { name: e.target.value })} />
        <div className="swatches">{BASE_COLORS.map((c) => <button key={c.hex} className={'swatch' + (m.color === c.hex ? ' sel' : '')} title={c.name} style={{ background: c.hex }} onClick={() => updateMaterial(m.id, { color: c.hex })} />)}</div>
        <div className="row"><span className="lbl">Farbe</span><input type="color" value={m.color} onChange={(e) => updateMaterial(m.id, { color: e.target.value })} style={{ width: 40, height: 26, padding: 0, border: 0, background: 'none' }} />
          <button className="btn small" onClick={() => updateMaterial(m.id, { color: ui.color })}>aktuelle Farbe</button></div>
        <div className="row"><span className="lbl">Stoffbild</span>
          {m.textureAssetId ? <><Swatch color={m.color} tex={m.textureAssetId} /><span className="muted small">{getBitmap(m.textureAssetId)?.width ?? ''} px</span><button className="btn ghost icon" onClick={() => updateMaterial(m.id, { textureAssetId: null })}><X size={13} /></button></>
            : <span className="muted small">keins</span>}
          {ui.galleryId && ui.galleryId !== m.textureAssetId && <button className="btn small" onClick={() => updateMaterial(m.id, { textureAssetId: ui.galleryId, color: '#ffffff' })}>Galerie-Bild</button>}
        </div>
        {m.textureAssetId && <Slider label="Rapportbreite" value={m.repeat} min={10} max={1000} step={5} onChange={(v) => updateMaterial(m.id, { repeat: v })} format={(v) => `${cm(v)} cm`} />}
        <div className="row"><span className="lbl">Bindung</span><select value={m.weave} onChange={(e) => updateMaterial(m.id, { weave: e.target.value as Weave })} style={{ flex: 1 }}>{WEAVES.map(([v, n]) => <option key={v} value={v}>{n}</option>)}</select></div>
        <Slider label="Glanz ↔ matt" value={m.roughness} min={0.1} max={1} step={0.01} onChange={(v) => updateMaterial(m.id, { roughness: v })} format={(v) => `${Math.round(v * 100)}`} />
        <Slider label="Samtschimmer" value={m.sheen} min={0} max={1} step={0.01} onChange={(v) => updateMaterial(m.id, { sheen: v })} format={(v) => `${Math.round(v * 100)}`} />
        <Slider label="Gewicht" value={m.gsm} min={40} max={1200} step={5} onChange={(v) => updateMaterial(m.id, { gsm: v })} format={(v) => `${v} g/m²`} />
        <Slider label="Dehnung Kette" value={m.stretch.warp} min={0} max={1} step={0.01} onChange={(v) => updateMaterial(m.id, { stretch: { ...m.stretch, warp: v } })} format={(v) => `${Math.round(v * 100)}`} />
        <Slider label="Dehnung Schuss" value={m.stretch.weft} min={0} max={1} step={0.01} onChange={(v) => updateMaterial(m.id, { stretch: { ...m.stretch, weft: v } })} format={(v) => `${Math.round(v * 100)}`} />
        <Slider label="Dehnung schräg" value={m.stretch.bias} min={0} max={1} step={0.01} onChange={(v) => updateMaterial(m.id, { stretch: { ...m.stretch, bias: v } })} format={(v) => `${Math.round(v * 100)}`} />
        <Slider label="Steifigkeit" value={m.bend} min={0} max={1} step={0.01} onChange={(v) => updateMaterial(m.id, { bend: v })} format={(v) => `${Math.round(v * 100)}`} />
        <input type="text" value={m.composition} placeholder="Zusammensetzung" onChange={(e) => updateMaterial(m.id, { composition: e.target.value })} />
      </>}
    </Panel>
  );
}
