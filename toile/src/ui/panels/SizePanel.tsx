import { useApp, appStore } from '../../state/store';
import { Panel, NumInput, Seg } from '../common';
import { SIZE_SYSTEMS, measurementsFor, intLabel, type SizeSpec } from '../../core/sizing/charts';
import { MEASUREMENT_KEYS, MEASUREMENT_LABELS, type Measurements } from '../../core/sizing/measurements';
import { setSize } from '../../state/actions';

function MeasureGrid({ m, onChange }: { m: Measurements; onChange: (k: keyof Measurements, v: number) => void }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '4px 8px', alignItems: 'center' }}>
      {MEASUREMENT_KEYS.map((k) => (
        <label key={k} style={{ display: 'contents' }}><span className="muted small">{MEASUREMENT_LABELS[k]}</span><NumInput value={m[k]} onChange={(v) => onChange(k, Math.max(10, v))} width={64} /></label>
      ))}
    </div>
  );
}

export function SizePanel() {
  const project = useApp((s) => s.project)!;
  const gid = useApp((s) => s.ui.garmentId);
  const g = project.garments.find((x) => x.id === gid);
  if (!g) return null;
  const sys = g.size.system;
  const setSys = (v: string) => {
    if (v === 'custom') setSize(g.id, { system: 'custom', m: measurementsFor(g.size) });
    else setSize(g.id, { system: v as 'womenEU', label: SIZE_SYSTEMS[v as 'womenEU'].base });
  };
  return (
    <Panel title="Größe">
      <Seg value={sys} onChange={setSys} options={[{ value: 'womenEU', label: 'Damen EU' }, { value: 'menEU', label: 'Herren EU' }, { value: 'custom', label: 'Maß' }]} />
      {sys !== 'custom' ? (
        <div className="row" style={{ flexWrap: 'wrap', gap: 4 }}>
          {SIZE_SYSTEMS[sys].labels.map((l) => (
            <button key={l} className={'btn small' + ((g.size as { label: string }).label === l ? ' on' : '')} onClick={() => setSize(g.id, { system: sys, label: l } as SizeSpec)} title={intLabel(sys, l)}>{l}</button>
          ))}
        </div>
      ) : (
        <MeasureGrid m={(g.size as { m: Measurements }).m} onChange={(k, v) => setSize(g.id, { system: 'custom', m: { ...(g.size as { m: Measurements }).m, [k]: v } })} />
      )}
    </Panel>
  );
}

export function AvatarPanel() {
  const project = useApp((s) => s.project)!;
  const upd = (k: keyof Measurements, v: number) => appStore.getState().update('Avatar-Maß', (d) => { d.avatar[k] = v; }, `avatar:${k}`);
  return (
    <Panel title="Avatar (Körpermaße)" defaultOpen={false}>
      <div className="row" style={{ flexWrap: 'wrap', gap: 4 }}>
        {(project.profile === 'women' ? SIZE_SYSTEMS.womenEU : SIZE_SYSTEMS.menEU).labels.map((l) => (
          <button key={l} className="btn small" onClick={() => appStore.getState().update('Avatar-Größe', (d) => { d.avatar = measurementsFor({ system: project.profile === 'women' ? 'womenEU' : 'menEU', label: l }); })}>{l}</button>
        ))}
      </div>
      <MeasureGrid m={project.avatar} onChange={upd} />
      <p className="muted small">Der Avatar ist unabhängig von der Kleidergröße – so prüfst du, wie eine Größe an diesem Körper sitzt.</p>
    </Panel>
  );
}
