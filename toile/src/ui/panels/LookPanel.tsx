import { Plus, Eye, EyeOff, Copy, Trash2, ChevronUp, ChevronDown } from 'lucide-react';
import { useApp, appStore } from '../../state/store';
import { Panel } from '../common';
import { removeGarment, duplicateGarment, setGarmentField } from '../../state/actions';
import { getTemplate } from '../../core/templates/registry';
import { sizeName } from '../../core/sizing/charts';

export function LookPanel() {
  const project = useApp((s) => s.project)!;
  const gid = useApp((s) => s.ui.garmentId);
  return (
    <Panel title="Look" right={<button className="btn small" onClick={() => appStore.getState().setUi({ dialog: 'library' })}><Plus size={13} /> Teil</button>}>
      {project.garments.length === 0 && <div className="muted small">Füge ein Kleidungsstück hinzu.</div>}
      <div className="list">
        {[...project.garments].sort((a, b) => b.layer - a.layer).map((g) => (
          <div key={g.id} className={'item' + (g.id === gid ? ' sel' : '')} onClick={() => appStore.getState().setUi({ garmentId: g.id, instanceKey: null, layerId: null, selection: { nodeIds: [] } })}>
            <button className="btn ghost icon" style={{ width: 24, height: 24 }} title="Sichtbar in 3D" onClick={(e) => { e.stopPropagation(); setGarmentField(g.id, 'visible', !g.visible, 'Sichtbarkeit'); }}>{g.visible ? <Eye size={13} /> : <EyeOff size={13} />}</button>
            <div style={{ minWidth: 0 }}>
              <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{g.name}</div>
              <div className="muted small">{getTemplate(g.templateId).name} · {sizeName(g.size)} · Lage {g.layer}</div>
            </div>
            {g.id === gid && <span className="row" style={{ marginLeft: 'auto', gap: 0 }} onClick={(e) => e.stopPropagation()}>
              <button className="btn ghost icon" style={{ width: 24, height: 24 }} title="Lage nach außen" onClick={() => setGarmentField(g.id, 'layer', g.layer + 1, 'Lage')}><ChevronUp size={13} /></button>
              <button className="btn ghost icon" style={{ width: 24, height: 24 }} title="Lage nach innen" onClick={() => setGarmentField(g.id, 'layer', Math.max(0, g.layer - 1), 'Lage')}><ChevronDown size={13} /></button>
              <button className="btn ghost icon" style={{ width: 24, height: 24 }} title="Duplizieren" onClick={() => duplicateGarment(g.id)}><Copy size={13} /></button>
              <button className="btn ghost icon danger" style={{ width: 24, height: 24 }} title="Entfernen" onClick={() => { if (confirm(`„${g.name}“ entfernen?`)) removeGarment(g.id); }}><Trash2 size={13} /></button>
            </span>}
          </div>
        ))}
      </div>
    </Panel>
  );
}
