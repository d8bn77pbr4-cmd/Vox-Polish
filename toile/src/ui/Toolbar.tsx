import type { LucideIcon } from 'lucide-react';
import { MousePointer2, MousePointerClick, PlusCircle, MinusCircle, Spline, PenTool, Ruler, Scissors, Link2, Hand, Move, Brush, Eraser, Pipette, PaintBucket, Type, CircleDot, Layers, Grid3x3 } from 'lucide-react';
import { useApp, appStore, type ToolId } from '../state/store';

export const TOOLS: Record<'schnitt' | 'design', { id: ToolId; icon: LucideIcon; label: string; key: string }[]> = {
  schnitt: [
    { id: 'select', icon: MousePointer2, label: 'Auswählen & Teile verschieben', key: 'V' },
    { id: 'direct', icon: MousePointerClick, label: 'Direktauswahl – Punkte & Kurven', key: 'A' },
    { id: 'addPoint', icon: PlusCircle, label: 'Punkt einfügen', key: '+' },
    { id: 'delPoint', icon: MinusCircle, label: 'Punkt löschen', key: '-' },
    { id: 'curve', icon: Spline, label: 'Ecke ↔ Kurve', key: 'C' },
    { id: 'pen', icon: PenTool, label: 'Neues Teil zeichnen', key: 'P' },
    { id: 'measure', icon: Ruler, label: 'Messen', key: 'M' },
    { id: 'notch', icon: Scissors, label: 'Knips setzen', key: 'N' },
    { id: 'sew', icon: Link2, label: 'Nähen – Kanten verbinden', key: 'S' },
    { id: 'hand', icon: Hand, label: 'Hand', key: 'H' },
  ],
  design: [
    { id: 'move', icon: Move, label: 'Verschieben & Skalieren', key: 'V' },
    { id: 'brush', icon: Brush, label: 'Pinsel', key: 'B' },
    { id: 'eraser', icon: Eraser, label: 'Radierer', key: 'E' },
    { id: 'eyedropper', icon: Pipette, label: 'Pipette', key: 'I' },
    { id: 'fill', icon: PaintBucket, label: 'Farbe füllen', key: 'G' },
    { id: 'text', icon: Type, label: 'Text', key: 'T' },
    { id: 'trim', icon: CircleDot, label: 'Zutat setzen (Knopf, Niete …)', key: 'K' },
    { id: 'hand', icon: Hand, label: 'Hand', key: 'H' },
  ],
};

export function Toolbar({ ws }: { ws: 'schnitt' | 'design' }) {
  const tool = useApp((s) => s.ui.tool);
  const ui = useApp((s) => s.ui);
  return (
    <aside className="toolrail">
      {TOOLS[ws].map((t) => (
        <button key={t.id} className={'tool' + (tool === t.id ? ' active' : '')} title={`${t.label} (${t.key})`} onClick={() => appStore.getState().setUi({ tool: t.id })}><t.icon size={18} /></button>
      ))}
      {ws === 'schnitt' && <>
        <div className="tool-sep" />
        <button className={'tool' + (ui.showSA ? ' active' : '')} title="Nahtzugabe anzeigen" onClick={() => appStore.getState().setUi({ showSA: !ui.showSA })}><Layers size={18} /></button>
        <button className={'tool' + (ui.grading ? ' active' : '')} title="Gradierbild (alle Größen)" onClick={() => appStore.getState().setUi({ grading: !ui.grading })}><Grid3x3 size={18} /></button>
      </>}
    </aside>
  );
}
