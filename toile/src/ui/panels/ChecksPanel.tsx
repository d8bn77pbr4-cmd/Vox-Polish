import { useMemo } from 'react';
import { ArrowLeftRight, Trash2 } from 'lucide-react';
import { useApp, appStore } from '../../state/store';
import { Panel, cm } from '../common';
import { resolveGarment } from '../../core/resolve';
import { seamReport } from '../../core/pattern/checks';
import { getTemplate, defaultParams } from '../../core/templates/registry';
import { SIZE_SYSTEMS, measurementsFor } from '../../core/sizing/charts';
import { flipSeam, deleteSeam } from '../../state/actions';

const SEAM_NAMES: [RegExp, string][] = [
  [/^shoulder_(L|R)/, 'Schulter'], [/^side_(L|R)/, 'Seite'], [/^armholeF_(L|R)/, 'Armloch vorne'], [/^armholeB_(L|R)/, 'Armloch hinten'],
  [/^underarm_(L|R)/, 'Ärmelnaht'], [/^cuff_(L|R)/, 'Bündchen'], [/^cuffend/, 'Bündchen Schluss'], [/^neck/, 'Halsausschnitt'], [/^hood_cb/, 'Kapuze Mitte'],
  [/^hoodneck/, 'Kapuze an Hals'], [/^band/, 'Saumbund'], [/^cf$/, 'Vordere Mitte'], [/^cb$/, 'Hintere Mitte'], [/^inseam/, 'Schrittnaht'],
  [/^outseam/, 'Seitennaht'], [/^wb_/, 'Bund'], [/^gore/, 'Keilnaht'], [/^cuff\d/, 'Umschlag'],
];
export const seamName = (id: string) => { const f = SEAM_NAMES.find(([r]) => r.test(id)); const side = /_(L|R)$/.exec(id)?.[1]; return (f?.[1] ?? 'Eigene Naht') + (side ? (side === 'L' ? ' links' : ' rechts') : ''); };

export function ChecksPanel() {
  const project = useApp((s) => s.project)!;
  const gid = useApp((s) => s.ui.garmentId);
  const g = project.garments.find((x) => x.id === gid);
  const res = g ? resolveGarment(g) : null;
  const pomTable = useMemo(() => {
    if (!g || g.size.system === 'custom') return null;
    const t = getTemplate(g.templateId), sys = SIZE_SYSTEMS[g.size.system];
    const cols = sys.labels.map((l) => ({ l, pom: t.build(measurementsFor({ system: g.size.system as 'womenEU', label: l }), { ...defaultParams(t), ...g.params }).pom }));
    return { cols, rows: cols[0].pom.map((p) => p.id) };
  }, [g?.templateId, g?.params, g?.size]);
  if (!g || !res) return null;
  const rep = seamReport(res.pieces, res.seams);
  const custom = new Set(g.customSeams.map((s) => s.id));
  const cur = g.size.system !== 'custom' ? g.size.label : '';
  return (
    <>
      <Panel title="Nahtprüfung" defaultOpen={false}>
        <table className="pom">
          <thead><tr><th>Naht</th><th>A</th><th>B</th><th>Δ</th><th /></tr></thead>
          <tbody>
            {rep.map((r) => (
              <tr key={r.seamId} onMouseEnter={() => appStore.getState().setUi({ hoverSeam: r.seamId })} onMouseLeave={() => appStore.getState().setUi({ hoverSeam: null })}>
                <td>{seamName(r.seamId)}</td><td>{cm(r.la)}</td><td>{cm(r.lb)}</td>
                <td className={r.status}>{r.diff > 0 ? '+' : ''}{cm(r.diff)}</td>
                <td>{custom.has(r.seamId) && <span className="row" style={{ gap: 0 }}>
                  <button className="btn ghost icon" style={{ width: 22, height: 22 }} title="Richtung umkehren" onClick={() => flipSeam(g.id, r.seamId)}><ArrowLeftRight size={12} /></button>
                  <button className="btn ghost icon danger" style={{ width: 22, height: 22 }} title="Naht löschen" onClick={() => deleteSeam(g.id, r.seamId)}><Trash2 size={12} /></button>
                </span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="muted small">Längen in cm. Grün = passt (inkl. gewollter Einhaltung/Dehnung), gelb/rot = prüfen.</div>
      </Panel>
      <Panel title="Maßtabelle" defaultOpen={false}>
        {pomTable ? (
          <div style={{ overflowX: 'auto' }}>
            <table className="pom">
              <thead><tr><th>cm</th>{pomTable.cols.map((c) => <th key={c.l} style={{ color: c.l === cur ? 'var(--accent)' : undefined }}>{c.l}</th>)}</tr></thead>
              <tbody>{pomTable.rows.map((id, i) => (
                <tr key={id}><td>{pomTable.cols[0].pom[i].label}</td>{pomTable.cols.map((c) => <td key={c.l} style={{ color: c.l === cur ? 'var(--accent)' : undefined }}>{cm(c.pom[i].value)}</td>)}</tr>
              ))}</tbody>
            </table>
          </div>
        ) : <table className="pom"><tbody>{res.pom.map((p) => <tr key={p.id}><td>{p.label}</td><td>{cm(p.value)}</td></tr>)}</tbody></table>}
      </Panel>
    </>
  );
}
