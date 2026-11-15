import { useApp } from '../state/store';
import { useCursor } from '../state/cursor';
import { cm } from './common';
import { sizeName } from '../core/sizing/charts';

export function StatusBar() {
  const x = useCursor((s) => s.x), y = useCursor((s) => s.y), hint = useCursor((s) => s.hint);
  const project = useApp((s) => s.project);
  const ui = useApp((s) => s.ui);
  const g = project?.garments.find((q) => q.id === ui.garmentId);
  return (
    <footer className="statusbar">
      {x !== null && y !== null && <span>x {cm(x)} cm · y {cm(y)} cm</span>}
      {g && <span>{g.name} · Größe {sizeName(g.size)}</span>}
      {ui.instanceKey && <span>{ui.instanceKey.replace(':C', '').replace(':L', ' links').replace(':R', ' rechts')}</span>}
      {hint && <span>{hint}</span>}
      <span className="spacer" />
      <span>{project ? (ui.dirty ? 'Speichert …' : 'Gespeichert') : ''}</span>
      <span>Taste ? = Kürzel</span>
    </footer>
  );
}
