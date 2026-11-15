import { useApp } from '../../state/store';
import { Panel, Slider, cm } from '../common';
import { getTemplate } from '../../core/templates/registry';
import { setParam, setSilhouette, setGarmentField } from '../../state/actions';
import { PiecePreview } from '../PiecePreview';

export function ParamsPanel() {
  const project = useApp((s) => s.project)!;
  const gid = useApp((s) => s.ui.garmentId);
  const g = project.garments.find((x) => x.id === gid);
  if (!g) return null;
  const t = getTemplate(g.templateId);
  const groups = [...new Set(t.params.map((p) => p.group))];
  return (
    <>
      <Panel title="Silhouette">
        <input type="text" value={g.name} onChange={(e) => setGarmentField(g.id, 'name', e.target.value, 'Name')} />
        <div className="grid2">
          {t.silhouettes.map((s) => (
            <button key={s.id} className={'card' + (s.id === g.silhouetteId ? ' sel' : '')} onClick={() => setSilhouette(g.id, s.id)} title={s.description}>
              <div className="thumb" style={{ aspectRatio: '3/2' }}><PiecePreview t={t} silId={s.id} profile={project.profile} /></div>
              <div className="cap" style={{ padding: '6px 8px' }}><b style={{ fontSize: 12 }}>{s.name}</b></div>
            </button>
          ))}
        </div>
        {(Object.keys(g.overrides).length > 0 || g.custom.length > 0) && <div className="small warn">Einige Teile sind vom Grundschnitt gelöst und werden proportional gradiert.</div>}
      </Panel>
      {groups.map((grp) => (
        <Panel key={grp} title={grp} defaultOpen={grp === 'Weite' || grp === 'Länge'}>
          {t.params.filter((p) => p.group === grp).map((p) => {
            const v = g.params[p.key] ?? p.default;
            if (p.options) return (
              <label key={p.key} className="field"><span className="name">{p.label}</span><span />
                <select style={{ gridColumn: '1 / -1' }} value={Math.round(v)} onChange={(e) => setParam(g.id, p.key, Number(e.target.value))}>
                  {p.options.map((o, i) => <option key={o} value={i}>{o}</option>)}
                </select>
              </label>
            );
            return <Slider key={p.key} label={p.label} value={v} min={p.min} max={p.max} step={p.step} onChange={(x) => setParam(g.id, p.key, x)}
              format={(x) => (p.unit === 'mm' ? `${x > 0 && p.min < 0 ? '+' : ''}${cm(x)} cm` : p.unit === 'n' ? String(Math.round(x * 100) / 100).replace('.', ',') : `${x}`)} />;
          })}
        </Panel>
      ))}
    </>
  );
}
