export type Workspace = 'mappe' | 'schnitt' | 'design' | 'anprobe';
const TABS: { id: Workspace; label: string }[] = [
  { id: 'schnitt', label: 'Schnitt' },
  { id: 'design', label: 'Design' },
  { id: 'anprobe', label: 'Anprobe' },
];
export function TopBar(props: { ws: Workspace; onWs: (w: Workspace) => void; children?: React.ReactNode }) {
  return (
    <header className="topbar">
      <div className="wordmark" onClick={() => props.onWs('mappe')} title="Mappe">TOILE</div>
      <nav className="tabs">
        {TABS.map((t) => (
          <button key={t.id} className={'tab' + (props.ws === t.id ? ' active' : '')} onClick={() => props.onWs(t.id)}>{t.label}</button>
        ))}
      </nav>
      <div className="spacer" />
      {props.children}
    </header>
  );
}
