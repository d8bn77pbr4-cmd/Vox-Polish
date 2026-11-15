import { Link2, Unlink, Copy } from 'lucide-react';
import { useApp, appStore } from '../../state/store';
import { Panel } from '../common';
import { resolveGarment, linkedFrom } from '../../core/resolve';
import { setLinkSides, copyLeftToRight } from '../../state/designActions';

export function InstancesPanel() {
  const project = useApp((s) => s.project)!;
  const ui = useApp((s) => s.ui);
  const g = project.garments.find((x) => x.id === ui.garmentId);
  if (!g) return null;
  const res = resolveGarment(g);
  const hasPairs = res.instances.some((i) => i.side !== 'C');
  return (
    <Panel title="Teile" right={hasPairs ? (
      <button className={'btn small' + (g.linkSides ? ' on' : '')} title={g.linkSides ? 'Links/Rechts gekoppelt – tippen zum Trennen' : 'Links/Rechts getrennt – tippen zum Koppeln'} onClick={() => setLinkSides(g.id, !g.linkSides)}>
        {g.linkSides ? <><Link2 size={12} /> gekoppelt</> : <><Unlink size={12} /> getrennt</>}
      </button>) : undefined}>
      <div className="list">
        {res.instances.map((i) => (
          <div key={i.key} className={'item' + (i.key === ui.instanceKey ? ' sel' : '')} onClick={() => appStore.getState().setUi({ instanceKey: i.key, layerId: null })}>
            <span>{i.piece.name}</span>
            <span className="meta">{i.side === 'L' ? 'links' : i.side === 'R' ? (linkedFrom(g, i.key) ? 'rechts ⇢ links' : 'rechts') : ''}</span>
          </div>
        ))}
      </div>
      {hasPairs && !g.linkSides && <button className="btn small" onClick={() => copyLeftToRight(g.id)}><Copy size={12} /> Von links übernehmen</button>}
      {hasPairs && <div className="muted small">{g.linkSides ? 'Rechte Teile zeigen die linke Gestaltung (Drucke seitenrichtig gespiegelt).' : 'Jede Seite hat eigene Ebenen – z. B. Schriftzug nur auf dem linken Schuh.'}</div>}
    </Panel>
  );
}
