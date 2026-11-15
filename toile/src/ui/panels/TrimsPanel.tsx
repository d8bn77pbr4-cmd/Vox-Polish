import { Trash2 } from 'lucide-react';
import { useApp, appStore } from '../../state/store';
import { Panel, Slider, cm } from '../common';
import { TRIM_CATALOG, FINISH_NAMES } from '../../core/textile/catalog';
import { TrimGlyph } from '../TrimGlyph';
import { updateTrim, removeTrim, editKey } from '../../state/designActions';
import type { Finish, Trim } from '../../core/model';

export function TrimsPanel() {
  const project = useApp((s) => s.project)!;
  const ui = useApp((s) => s.ui);
  const g = project.garments.find((x) => x.id === ui.garmentId);
  if (!g) return null;
  const selId = ui.layerId?.startsWith('trim:') ? ui.layerId.slice(5) : null;
  const t = g.trims.find((x) => x.id === selId);
  const cat = t ? TRIM_CATALOG.find((c) => c.type === t.type)! : null;
  const onPiece = ui.instanceKey ? g.trims.filter((x) => x.key === editKey(g, ui.instanceKey!)) : [];
  return (
    <Panel title="Zutaten" defaultOpen={false}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 6 }}>
        {TRIM_CATALOG.map((c) => {
          const demo: Trim = { id: 'demo-' + c.type, type: c.type, key: '', x: 0, y: 0, size: c.type === 'zipper' || c.type === 'drawcord' ? 6 : 18, color: c.color, finish: c.finishes[0], rot: 0, length: 30, text: 'T' };
          return (
            <button key={c.type} className={'card' + (ui.trimType === c.type && ui.tool === 'trim' ? ' sel' : '')} title={c.name} onClick={() => appStore.getState().setUi({ trimType: c.type, tool: 'trim' })}>
              <div className="thumb" style={{ aspectRatio: '1' }}><svg viewBox={c.type === 'zipper' || c.type === 'drawcord' ? '-15 -4 30 40' : '-14 -14 28 28'}><TrimGlyph t={demo} /></svg></div>
            </button>
          );
        })}
      </div>
      <div className="muted small">Zutat wählen, dann auf die Fläche tippen. Mit „Verschieben“ (V) neu platzieren.</div>
      {t && cat && <div className="panel-body" style={{ padding: '6px 0 0', borderTop: '1px solid var(--line)' }}>
        <div className="row"><b>{cat.name}</b><span className="spacer" /><button className="btn ghost icon danger" onClick={() => { removeTrim(g.id, t.id); appStore.getState().setUi({ layerId: null }); }}><Trash2 size={13} /></button></div>
        <div className="row" style={{ flexWrap: 'wrap', gap: 4 }}>{cat.sizes.map((s) => {
          const mm = cat.unit === 'L' ? s * 0.635 : s;
          return <button key={s} className={'btn small' + (Math.abs(t.size - mm) < 0.1 ? ' on' : '')} onClick={() => updateTrim(g.id, t.id, { size: mm })}>{cat.unit === 'L' ? `${s} L` : `${s} mm`}</button>;
        })}</div>
        <div className="row"><span className="lbl">Oberfläche</span><select value={t.finish} onChange={(e) => updateTrim(g.id, t.id, { finish: e.target.value as Finish })} style={{ flex: 1 }}>{cat.finishes.map((f) => <option key={f} value={f}>{FINISH_NAMES[f]}</option>)}</select></div>
        <div className="row"><span className="lbl">Farbe</span><input type="color" value={t.color} onChange={(e) => updateTrim(g.id, t.id, { color: e.target.value })} style={{ width: 40, height: 26, padding: 0, border: 0, background: 'none' }} /></div>
        <Slider label="Drehung" value={t.rot} min={-180} max={180} step={1} onChange={(v) => updateTrim(g.id, t.id, { rot: v })} format={(v) => `${v}°`} />
        {(t.type === 'zipper' || t.type === 'drawcord') && <Slider label="Länge" value={t.length ?? 300} min={40} max={900} step={5} onChange={(v) => updateTrim(g.id, t.id, { length: v })} format={(v) => `${cm(v)} cm`} />}
        {(t.type === 'label' || t.type === 'patch') && <input type="text" value={t.text ?? ''} onChange={(e) => updateTrim(g.id, t.id, { text: e.target.value })} />}
      </div>}
      {onPiece.length > 0 && <div className="muted small">{onPiece.length} Zutat{onPiece.length === 1 ? '' : 'en'} auf diesem Teil</div>}
    </Panel>
  );
}
