import { useApp, appStore } from '../../state/store';
import { Panel, Slider } from '../common';
import { BRUSHES } from '../../render2d/brush';

export function BrushPanel() {
  const b = useApp((s) => s.ui.brush);
  const set = (p: Partial<typeof b>) => appStore.getState().setUi({ brush: { ...b, ...p } });
  return (
    <Panel title="Pinsel">
      <div className="grid3">{BRUSHES.filter((x) => !x.erase).map((x) => (
        <button key={x.id} className={'btn small' + (b.brush === x.id ? ' on' : '')} onClick={() => { set({ brush: x.id, hardness: x.hardness, spacing: x.spacing, size: x.size }); appStore.getState().setUi({ tool: 'brush' }); }}>{x.name}</button>
      ))}</div>
      <Slider label="Größe" value={b.size} min={1} max={300} step={1} onChange={(v) => set({ size: v })} format={(v) => `${Math.round(v)} px`} />
      <Slider label="Deckkraft" value={b.opacity} min={0.02} max={1} step={0.01} onChange={(v) => set({ opacity: v })} format={(v) => `${Math.round(v * 100)} %`} />
      <Slider label="Härte" value={b.hardness} min={0} max={1} step={0.01} onChange={(v) => set({ hardness: v })} format={(v) => `${Math.round(v * 100)} %`} />
      <Slider label="Fluss" value={b.flow} min={0.05} max={1} step={0.01} onChange={(v) => set({ flow: v })} format={(v) => `${Math.round(v * 100)} %`} />
      <Slider label="Glättung (Stabilisierung)" value={b.smoothing} min={0} max={0.95} step={0.01} onChange={(v) => set({ smoothing: v })} format={(v) => `${Math.round(v * 100)} %`} />
      <div className="muted small">Druck des Stifts steuert Größe und Deckkraft. [ und ] ändern die Größe.</div>
    </Panel>
  );
}
