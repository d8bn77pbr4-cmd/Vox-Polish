import { appStore } from '../state/store';
import { TOOLS } from './Toolbar';

export function installShortcuts() {
  const kd = (e: KeyboardEvent) => {
    if ((e.target as HTMLElement).closest('input,textarea,select,[contenteditable]')) return;
    const s = appStore.getState();
    const mod = e.metaKey || e.ctrlKey;
    if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) s.redo(); else s.undo(); return; }
    if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); s.redo(); return; }
    if (!s.project || mod || e.altKey) return;
    if (e.key === '1') s.setUi({ workspace: 'schnitt', tool: 'select' });
    else if (e.key === '2') s.setUi({ workspace: 'design', tool: 'move' });
    else if (e.key === '3') s.setUi({ workspace: 'anprobe' });
    else if (e.key === '?') s.setUi({ dialog: s.ui.dialog === 'help' ? null : 'help' });
    else {
      const ws = s.ui.workspace === 'design' ? 'design' : s.ui.workspace === 'schnitt' ? 'schnitt' : null;
      if (!ws) return;
      const k = e.key.length === 1 ? e.key.toUpperCase() : e.key;
      const t = TOOLS[ws].find((x) => x.key === k || (x.key === '-' && e.key === '-'));
      if (t) s.setUi({ tool: t.id });
      if (ws === 'design' && (e.key === '[' || e.key === ']')) s.setUi({ brush: { ...s.ui.brush, size: Math.max(1, Math.min(400, s.ui.brush.size * (e.key === ']' ? 1.2 : 1 / 1.2))) } });
    }
  };
  window.addEventListener('keydown', kd);
  return () => window.removeEventListener('keydown', kd);
}
