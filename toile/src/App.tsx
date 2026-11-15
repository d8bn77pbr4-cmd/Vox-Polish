import { useState } from 'react';
import { TopBar, type Workspace } from './ui/TopBar';

export function App() {
  const [ws, setWs] = useState<Workspace>('mappe');
  return (
    <div className="app">
      <TopBar ws={ws} onWs={setWs} />
      <main className="empty">{ws}</main>
      <footer className="statusbar">TOILE</footer>
    </div>
  );
}
