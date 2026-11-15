import { useEffect } from 'react';
import { Undo2, Redo2, Columns2, Download } from 'lucide-react';
import { useApp, appStore, type Workspace } from './state/store';
import { ProjectsView } from './views/ProjectsView';
import { PatternView } from './views/PatternView';
import { Toolbar } from './ui/Toolbar';
import { StatusBar } from './ui/StatusBar';
import { GarmentLibrary } from './ui/GarmentLibrary';
import { LookPanel } from './ui/panels/LookPanel';
import { ParamsPanel } from './ui/panels/ParamsPanel';
import { SizePanel, AvatarPanel } from './ui/panels/SizePanel';
import { PropertiesPanel } from './ui/panels/PropertiesPanel';
import { ChecksPanel } from './ui/panels/ChecksPanel';
import { Empty } from './ui/common';

const TABS: { id: Workspace; label: string }[] = [{ id: 'schnitt', label: 'Schnitt' }, { id: 'design', label: 'Design' }, { id: 'anprobe', label: 'Anprobe' }];

function TopBar() {
  const project = useApp((s) => s.project)!;
  const ui = useApp((s) => s.ui);
  useApp((s) => s.version);
  const st = appStore.getState();
  return (
    <header className="topbar">
      <div className="wordmark" title="Zur Mappe" onClick={() => st.closeProject()}>TOILE</div>
      <input type="text" value={project.name} onChange={(e) => st.update('Name', (d) => { d.name = e.target.value; }, 'pname')} style={{ background: 'transparent', border: '1px solid transparent', width: 180, fontWeight: 500 }} />
      <nav className="tabs">
        {TABS.map((t) => <button key={t.id} className={'tab' + (ui.workspace === t.id ? ' active' : '')} onClick={() => st.setUi({ workspace: t.id, tool: t.id === 'design' ? 'move' : t.id === 'schnitt' ? 'select' : ui.tool })}>{t.label}</button>)}
      </nav>
      <button className={'btn icon' + (ui.split ? ' on' : '')} title="Geteilte Ansicht mit 3D" onClick={() => st.setUi({ split: !ui.split })}><Columns2 size={16} /></button>
      <div className="spacer" />
      <button className="btn icon ghost" title="Rückgängig (⌘Z)" disabled={!st.canUndo()} onClick={() => st.undo()}><Undo2 size={16} /></button>
      <button className="btn icon ghost" title="Wiederholen (⇧⌘Z)" disabled={!st.canRedo()} onClick={() => st.redo()}><Redo2 size={16} /></button>
      <button className="btn" onClick={() => st.setUi({ dialog: 'export' })}><Download size={15} /> Export</button>
    </header>
  );
}

function Studio() {
  const ui = useApp((s) => s.ui);
  const ws = ui.workspace;
  const main = ws === 'schnitt' ? <PatternView /> : ws === 'design' ? <Empty>Design</Empty> : <Empty>Anprobe</Empty>;
  const showSplit = ui.split && ws !== 'anprobe';
  return (
    <div className={'workspace' + (ws === 'anprobe' ? ' no-tools' : '')}>
      {ws !== 'anprobe' && <Toolbar ws={ws === 'design' ? 'design' : 'schnitt'} />}
      <div className="stage">
        <div className="pane">{main}</div>
        {showSplit && <div className="pane"><Empty>Anprobe</Empty></div>}
      </div>
      <aside className="sidebar">
        <LookPanel />
        {ws === 'schnitt' && <><PropertiesPanel /><ParamsPanel /><SizePanel /><ChecksPanel /><AvatarPanel /></>}
        {ws === 'anprobe' && <><SizePanel /><AvatarPanel /></>}
      </aside>
    </div>
  );
}

export function App() {
  const hasProject = useApp((s) => !!s.project);
  const dialog = useApp((s) => s.ui.dialog);
  const toast = useApp((s) => s.ui.toast);
  useEffect(() => { document.title = hasProject ? `${appStore.getState().project!.name} – TOILE` : 'TOILE – Atelier'; }, [hasProject]);
  const close = () => appStore.getState().setUi({ dialog: null });
  return (
    <div className="app" style={!hasProject ? { gridTemplateRows: '1fr' } : undefined}>
      {hasProject ? <><TopBar /><Studio /><StatusBar /></> : <ProjectsView />}
      {dialog === 'library' && <GarmentLibrary onClose={close} />}
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
