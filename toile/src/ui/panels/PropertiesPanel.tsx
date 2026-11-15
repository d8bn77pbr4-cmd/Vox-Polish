import { RotateCcw, Scissors, Trash2 } from 'lucide-react';
import { useApp, appStore } from '../../state/store';
import { Panel, NumInput, Seg } from '../common';
import { resolveGarment } from '../../core/resolve';
import { editPiece, restorePiece, removeCustomPiece } from '../../state/actions';
import { setNodePos, toggleCurve } from '../../core/pattern/edit';
import type { Zone } from '../../core/pattern/types';
import { piecePolygon } from '../../core/pattern/piece';
import { polygonArea } from '../../core/geometry/path';

const ZONES: [Zone, string][] = [['torsoFront', 'Vorderkörper'], ['torsoBack', 'Rücken'], ['arm', 'Arm'], ['legFront', 'Bein vorne'], ['legBack', 'Bein hinten'], ['waist', 'Taille'], ['neck', 'Hals'], ['head', 'Kopf'], ['hem', 'Saum'], ['none', 'Nur 2D']];

export function PropertiesPanel() {
  const project = useApp((s) => s.project)!;
  const ui = useApp((s) => s.ui);
  const g = project.garments.find((x) => x.id === ui.garmentId);
  if (!g || !ui.selection.pieceId) return <Panel title="Eigenschaften"><div className="muted small">Tippe ein Schnittteil an, um es zu bearbeiten. Mit dem Direktauswahl-Werkzeug (A) verschiebst du Punkte und Kurven.</div></Panel>;
  const res = resolveGarment(g);
  const p = res.pieces.find((x) => x.id === ui.selection.pieceId);
  if (!p) return null;
  const isCustom = g.custom.some((c) => c.id === p.id), isOverride = !!g.overrides[p.id];
  const ed = (fn: Parameters<typeof editPiece>[2], key?: string) => editPiece(g.id, p.id, fn, key);
  const node = ui.selection.nodeIds.length === 1 ? p.nodes.find((n) => n.id === ui.selection.nodeIds[0]) : undefined;
  const area = Math.abs(polygonArea(piecePolygon(p))) / 1e6;
  return (
    <Panel title="Eigenschaften">
      <input type="text" value={p.name} onChange={(e) => ed((q) => ({ ...q, name: e.target.value }), `name:${p.id}`)} />
      <div className="muted small">{isCustom ? 'Eigenes Teil' : isOverride ? 'Vom Grundschnitt gelöst' : 'Parametrischer Grundschnitt'} · {area.toFixed(3).replace('.', ',')} m² · {p.nodes.length} Punkte</div>
      <div className="row"><span className="lbl" style={{ width: 92 }}>Zuschnitt</span>
        <Seg value={p.cut.count} onChange={(v) => ed((q) => ({ ...q, cut: { ...q.cut, count: v } }))} options={[{ value: 1, label: '1×' }, { value: 2, label: '2× gegengl.' }]} />
      </div>
      <div className="row"><span className="lbl" style={{ width: 92 }}>Nahtzugabe</span><NumInput value={p.sa} unit="mm" onChange={(v) => ed((q) => ({ ...q, sa: Math.max(0, v) }), `sa:${p.id}`)} /></div>
      <div className="row"><span className="lbl" style={{ width: 92 }}>Fadenlauf</span><NumInput value={p.grain} unit="°" onChange={(v) => ed((q) => ({ ...q, grain: v }), `grain:${p.id}`)} />
        <button className="btn small" onClick={() => ed((q) => ({ ...q, grain: q.grain === 45 ? 0 : 45 }))}>{p.grain === 45 ? 'gerade' : 'schräg 45°'}</button></div>
      {isCustom && <div className="row"><span className="lbl" style={{ width: 92 }}>Lage (3D)</span>
        <select value={p.placement.zone} onChange={(e) => ed((q) => ({ ...q, placement: { ...q.placement, zone: e.target.value as Zone } }))}>{ZONES.map(([z, l]) => <option key={z} value={z}>{l}</option>)}</select></div>}
      {node && <>
        <div className="muted small" style={{ marginTop: 6 }}>Punkt {node.id}</div>
        <div className="row"><span className="lbl">x</span><NumInput value={node.x} onChange={(v) => ed((q) => setNodePos(q, node.id, v, node.y), `nx:${node.id}`)} /><span className="lbl">y</span><NumInput value={node.y} onChange={(v) => ed((q) => setNodePos(q, node.id, node.x, v), `ny:${node.id}`)} /></div>
        <button className="btn small" onClick={() => ed((q) => toggleCurve(q, node.id))}>{node.hin || node.hout ? 'Zur Ecke machen' : 'Zur Kurve machen'}</button>
      </>}
      <label className="row small"><input type="checkbox" checked={ui.symmetric} onChange={(e) => appStore.getState().setUi({ symmetric: e.target.checked })} /> Symmetrisch bearbeiten</label>
      <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
        {!isCustom && !isOverride && <button className="btn small" onClick={() => ed((q) => q)}><Scissors size={13} /> Vom Grundschnitt lösen</button>}
        {isOverride && <button className="btn small" onClick={() => restorePiece(g.id, p.id)}><RotateCcw size={13} /> Grundschnitt wiederherstellen</button>}
        {isCustom && <button className="btn small danger" onClick={() => { removeCustomPiece(g.id, p.id); appStore.getState().setUi({ selection: { nodeIds: [] } }); }}><Trash2 size={13} /> Teil löschen</button>}
      </div>
    </Panel>
  );
}
