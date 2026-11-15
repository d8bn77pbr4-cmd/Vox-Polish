import { Eye, EyeOff, Lock, Unlock, ChevronUp, ChevronDown, Copy, Trash2, Image, Grid2x2, Square, Brush, Type, Layers } from 'lucide-react';
import { useApp, appStore } from '../../state/store';
import { Panel, Slider, cm } from '../common';
import { surfaceFor } from '../../core/resolve';
import type { Layer, PatternSpec, BlendMode } from '../../core/model';
import { addLayer, removeLayer, moveLayer, duplicateLayer, updateLayer, pieceSize } from '../../state/designActions';
import { PATTERN_NAMES, PATTERN_PRESETS, REPEAT_NAMES } from '../../core/textile/patterns';
import { LAYER_PRESETS } from '../../core/textile/catalog';
import { canvasToAsset } from '../../render2d/assets';
import { getRaster, dirtyRasters, notifyRaster } from '../../render2d/raster';

const BLENDS: [BlendMode, string][] = [['normal', 'Normal'], ['multiply', 'Multiplizieren'], ['screen', 'Negativ multipl.'], ['overlay', 'Ineinanderkopieren'], ['soft-light', 'Weiches Licht'], ['darken', 'Abdunkeln'], ['lighten', 'Aufhellen'], ['color', 'Farbe'], ['luminosity', 'Luminanz']];
const ICON = { base: Layers, fill: Square, pattern: Grid2x2, image: Image, paint: Brush, text: Type };
const FONTS = ['Cormorant Garamond', 'Inter', 'Georgia', 'Helvetica', 'Courier New', 'Impact'];

export function LayersPanel() {
  const project = useApp((s) => s.project)!;
  const ui = useApp((s) => s.ui);
  const g = project.garments.find((x) => x.id === ui.garmentId);
  if (!g || !ui.instanceKey) return null;
  const key = ui.instanceKey;
  const layers = surfaceFor(g, key).layers;
  const sel = layers.find((l) => l.id === ui.layerId);
  const up = (patch: Partial<Layer>, label = 'Ebene ändern') => sel && updateLayer(g.id, key, sel.id, patch, label);
  const applyPreset = async (id: string) => {
    const pr = LAYER_PRESETS.find((x) => x.id === id)!;
    const sz = pieceSize(g, key);
    if (pr.kind === 'image') {
      if (!ui.galleryId) { appStore.getState().toast('Wähle zuerst ein Bild in der Galerie'); return; }
      addLayer(g.id, key, 'image', { assetId: ui.galleryId, name: pr.name, x: pr.x * sz.w, y: sz.minY + pr.y * sz.h, w: pr.w * sz.w });
      return;
    }
    const c = document.createElement('canvas');
    const wmm = pr.vertical ? pr.w * sz.w : sz.w * 1.2, hmm = pr.vertical ? sz.h * 1.2 : sz.h * 0.07;
    c.width = 400; c.height = Math.max(8, Math.round((400 * hmm) / wmm));
    const x = c.getContext('2d')!;
    x.fillStyle = '#f4f1ea'; x.fillRect(0, 0, c.width, c.height); x.fillStyle = ui.color;
    if (pr.vertical) { x.fillRect(c.width * 0.12, 0, c.width * 0.22, c.height); x.fillRect(c.width * 0.66, 0, c.width * 0.22, c.height); }
    else { x.fillRect(0, c.height * 0.15, c.width, c.height * 0.25); x.fillRect(0, c.height * 0.6, c.width, c.height * 0.25); }
    const asset = await canvasToAsset(c);
    addLayer(g.id, key, 'image', { assetId: asset, name: pr.name, x: 0, y: pr.vertical ? sz.minY + sz.h / 2 : sz.minY + pr.y * sz.h, w: wmm });
  };
  return (
    <Panel title="Ebenen">
      <div className="row" style={{ flexWrap: 'wrap', gap: 4 }}>
        <button className="btn small" title="Muster-Ebene" onClick={() => addLayer(g.id, key, 'pattern')}><Grid2x2 size={12} /> Muster</button>
        <button className="btn small" title="Farbfläche" onClick={() => addLayer(g.id, key, 'fill')}><Square size={12} /> Farbe</button>
        <button className="btn small" title="Malebene" onClick={() => { addLayer(g.id, key, 'paint'); appStore.getState().setUi({ tool: 'brush' }); }}><Brush size={12} /> Malen</button>
        <button className="btn small" title="Text" onClick={() => addLayer(g.id, key, 'text')}><Type size={12} /> Text</button>
        <button className="btn small" title="Bild aus der Galerie" onClick={() => ui.galleryId ? addLayer(g.id, key, 'image', { assetId: ui.galleryId }) : appStore.getState().toast('Wähle zuerst ein Bild in der Galerie')}><Image size={12} /> Bild</button>
        <select value="" onChange={(e) => e.target.value && applyPreset(e.target.value)} style={{ flex: 1 }}>
          <option value="">Vorlage …</option>{LAYER_PRESETS.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>
      <div className="list">
        {[...layers].reverse().map((l) => {
          const I = ICON[l.kind];
          return (
            <div key={l.id} className={'item' + (l.id === ui.layerId ? ' sel' : '')} onClick={() => appStore.getState().setUi({ layerId: l.id })}>
              <I size={13} className="muted" />
              <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', opacity: l.visible ? 1 : 0.45 }}>{l.name}</span>
              <span className="muted small">{l.blend !== 'normal' ? BLENDS.find((b) => b[0] === l.blend)?.[1] : ''}{l.opacity < 1 ? ` ${Math.round(l.opacity * 100)}%` : ''}</span>
              <button className="btn ghost icon" style={{ width: 22, height: 22 }} onClick={(e) => { e.stopPropagation(); updateLayer(g.id, key, l.id, { locked: !l.locked }, 'Sperren'); }}>{l.locked ? <Lock size={12} /> : <Unlock size={12} className="muted" />}</button>
              <button className="btn ghost icon" style={{ width: 22, height: 22 }} onClick={(e) => { e.stopPropagation(); updateLayer(g.id, key, l.id, { visible: !l.visible }, 'Sichtbarkeit'); }}>{l.visible ? <Eye size={12} /> : <EyeOff size={12} />}</button>
            </div>
          );
        })}
      </div>
      {sel && (
        <div className="panel-body" style={{ padding: '8px 0 0', borderTop: '1px solid var(--line)' }}>
          <div className="row">
            <input type="text" value={sel.name} onChange={(e) => up({ name: e.target.value }, 'Umbenennen')} style={{ flex: 1 }} />
            {sel.kind !== 'base' && <>
              <button className="btn ghost icon" title="nach oben" onClick={() => moveLayer(g.id, key, sel.id, 1)}><ChevronUp size={14} /></button>
              <button className="btn ghost icon" title="nach unten" onClick={() => moveLayer(g.id, key, sel.id, -1)}><ChevronDown size={14} /></button>
              <button className="btn ghost icon" title="duplizieren" onClick={() => duplicateLayer(g.id, key, sel.id)}><Copy size={14} /></button>
              <button className="btn ghost icon danger" title="löschen" onClick={() => removeLayer(g.id, key, sel.id)}><Trash2 size={14} /></button>
            </>}
          </div>
          <Slider label="Deckkraft" value={sel.opacity} min={0} max={1} step={0.01} onChange={(v) => up({ opacity: v })} format={(v) => `${Math.round(v * 100)} %`} />
          <div className="row"><span className="lbl">Mischmodus</span><select value={sel.blend} onChange={(e) => up({ blend: e.target.value as BlendMode })} style={{ flex: 1 }}>{BLENDS.map(([v, n]) => <option key={v} value={v}>{n}</option>)}</select></div>
          {sel.kind === 'base' && <div className="row"><span className="lbl">Stoff</span><select value={sel.materialId} onChange={(e) => up({ materialId: e.target.value } as Partial<Layer>, 'Stoff')} style={{ flex: 1 }}>{project.materials.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select></div>}
          {sel.kind === 'fill' && <div className="row"><span className="lbl">Farbe</span><span className="swatch" style={{ width: 22, height: 22, background: sel.color }} /><span className="muted small">mit dem Farbkreis ändern</span></div>}
          {sel.kind === 'pattern' && <PatternProps spec={sel.pattern} galleryId={ui.galleryId} onChange={(p) => up({ pattern: { ...sel.pattern, ...p } } as Partial<Layer>, 'Muster')} />}
          {sel.kind === 'image' && <>
            <Slider label="Breite" value={sel.w} min={5} max={1200} step={1} onChange={(v) => up({ w: v } as Partial<Layer>)} format={(v) => `${cm(v)} cm`} />
            <Slider label="Drehung" value={sel.rot} min={-180} max={180} step={1} onChange={(v) => up({ rot: v } as Partial<Layer>)} format={(v) => `${v}°`} />
            <Slider label="Farbton" value={sel.adjust.hue} min={-180} max={180} step={1} onChange={(v) => up({ adjust: { ...sel.adjust, hue: v } } as Partial<Layer>)} format={(v) => `${v}°`} />
            <Slider label="Sättigung" value={sel.adjust.sat} min={-100} max={100} step={1} onChange={(v) => up({ adjust: { ...sel.adjust, sat: v } } as Partial<Layer>)} format={(v) => `${v}`} />
            <Slider label="Helligkeit" value={sel.adjust.bright} min={-100} max={100} step={1} onChange={(v) => up({ adjust: { ...sel.adjust, bright: v } } as Partial<Layer>)} format={(v) => `${v}`} />
            <Slider label="Kontrast" value={sel.adjust.contrast} min={-100} max={100} step={1} onChange={(v) => up({ adjust: { ...sel.adjust, contrast: v } } as Partial<Layer>)} format={(v) => `${v}`} />
            {ui.galleryId && ui.galleryId !== sel.assetId && <button className="btn small" onClick={() => up({ assetId: ui.galleryId! } as Partial<Layer>, 'Bild ersetzen')}>Durch Galerie-Auswahl ersetzen</button>}
          </>}
          {sel.kind === 'text' && <>
            <input type="text" value={sel.text} onChange={(e) => up({ text: e.target.value } as Partial<Layer>, 'Text')} />
            <div className="row"><span className="lbl">Schrift</span><select value={sel.font} onChange={(e) => up({ font: e.target.value } as Partial<Layer>)} style={{ flex: 1 }}>{FONTS.map((f) => <option key={f}>{f}</option>)}</select></div>
            <Slider label="Größe" value={sel.size} min={3} max={400} step={1} onChange={(v) => up({ size: v } as Partial<Layer>)} format={(v) => `${cm(v)} cm`} />
            <Slider label="Laufweite" value={sel.tracking} min={-5} max={40} step={0.5} onChange={(v) => up({ tracking: v } as Partial<Layer>)} format={(v) => `${v}`} />
            <Slider label="Drehung" value={sel.rot} min={-180} max={180} step={1} onChange={(v) => up({ rot: v } as Partial<Layer>)} format={(v) => `${v}°`} />
          </>}
          {sel.kind === 'paint' && <button className="btn small" onClick={() => { const c = getRaster(sel); c.getContext('2d')!.clearRect(0, 0, c.width, c.height); dirtyRasters.add(sel.id); notifyRaster(); }}>Malebene leeren</button>}
        </div>
      )}
    </Panel>
  );
}

function PatternProps({ spec, galleryId, onChange }: { spec: PatternSpec; galleryId: string | null; onChange: (p: Partial<PatternSpec>) => void }) {
  return <>
    <div className="row"><span className="lbl">Vorlage</span><select value="" onChange={(e) => { const p = PATTERN_PRESETS[Number(e.target.value)]; if (p) onChange({ ...p.spec }); }} style={{ flex: 1 }}>
      <option value="">wählen …</option>{PATTERN_PRESETS.map((p, i) => <option key={p.name} value={i}>{p.name}</option>)}</select></div>
    <div className="row"><span className="lbl">Art</span><select value={spec.type} onChange={(e) => onChange({ type: e.target.value as PatternSpec['type'], ...(e.target.value === 'motif' ? { motifAssetId: galleryId ?? undefined, repeat: spec.repeat ?? 'half-drop' } : {}) })} style={{ flex: 1 }}>
      {Object.entries(PATTERN_NAMES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
    {spec.type === 'motif' && <>
      <div className="row"><span className="lbl">Rapport</span><select value={spec.repeat ?? 'full'} onChange={(e) => onChange({ repeat: e.target.value as PatternSpec['repeat'] })} style={{ flex: 1 }}>{Object.entries(REPEAT_NAMES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
      {galleryId && galleryId !== spec.motifAssetId && <button className="btn small" onClick={() => onChange({ motifAssetId: galleryId })}>Galerie-Auswahl als Motiv</button>}
      {!spec.motifAssetId && <div className="small warn">Wähle ein Bild in der Galerie und übernimm es als Motiv.</div>}
    </>}
    <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>{spec.colors.map((c, i) => (
      <input key={i} type="color" value={c === 'transparent' ? '#ffffff' : c} onChange={(e) => { const cs = [...spec.colors]; cs[i] = e.target.value; onChange({ colors: cs }); }} style={{ width: 34, height: 26, padding: 0, border: '1px solid var(--line2)', borderRadius: 6, background: 'none' }} />
    ))}</div>
    <Slider label="Rapportgröße" value={spec.scale} min={2} max={400} step={1} onChange={(v) => onChange({ scale: v })} format={(v) => `${cm(v)} cm`} />
    <Slider label="Winkel" value={spec.angle} min={-90} max={90} step={1} onChange={(v) => onChange({ angle: v })} format={(v) => `${v}°`} />
  </>;
}
