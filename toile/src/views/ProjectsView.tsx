import { useEffect, useRef, useState } from 'react';
import { Plus, Upload, Download, Copy, Trash2, FolderOpen } from 'lucide-react';
import { projectStore, type ProjectMeta } from '../state/persistence';
import { appStore } from '../state/store';
import { newProject, uid } from '../core/model';
import { exportProjectFile, importProjectFile } from '../state/projectFile';
import { Dialog, Seg } from '../ui/common';

export function download(blob: Blob, name: string) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

function Thumb({ blob }: { blob?: Blob }) {
  const [url, setUrl] = useState<string>();
  useEffect(() => { if (!blob) return; const u = URL.createObjectURL(blob); setUrl(u); return () => URL.revokeObjectURL(u); }, [blob]);
  return url ? <img src={url} alt="" style={{ objectFit: 'cover' }} /> : <span className="wordmark" style={{ fontSize: 34, opacity: 0.25 }}>T</span>;
}

export function ProjectsView() {
  const [list, setList] = useState<ProjectMeta[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('Neuer Look');
  const [profile, setProfile] = useState<'women' | 'men'>('women');
  const fileRef = useRef<HTMLInputElement>(null);
  const refresh = () => projectStore.list().then(setList);
  useEffect(() => { void refresh(); }, []);
  const open = async (id: string) => { const p = await projectStore.load(id); if (p) appStore.getState().openProject(p); };
  const create = async () => {
    const p = newProject(name.trim() || 'Neuer Look', profile);
    await projectStore.save(p);
    appStore.getState().openProject(p);
  };
  const dup = async (id: string) => { const p = await projectStore.load(id); if (!p) return; await projectStore.save({ ...p, id: uid('p_'), name: p.name + ' (Kopie)', updatedAt: Date.now() }); void refresh(); };
  const exp = async (id: string) => {
    const p = await projectStore.load(id); if (!p) return;
    download(await exportProjectFile(p, projectStore), `${p.name.replace(/[^\wäöüÄÖÜß -]/g, '')}.toile`);
    await projectStore.save({ ...p, lastExportAt: Date.now() });
  };
  const del = async (m: ProjectMeta) => { if (confirm(`„${m.name}“ endgültig löschen?`)) { await projectStore.remove(m.id); void refresh(); } };
  const imp = async (f?: File) => {
    if (!f) return;
    try { const p = await importProjectFile(f, projectStore); appStore.getState().toast(`„${p.name}“ importiert`); void refresh(); }
    catch (e) { appStore.getState().toast((e as Error).message); }
  };
  return (
    <div style={{ height: '100%', overflowY: 'auto' }}>
      <div style={{ maxWidth: 1180, margin: '0 auto', padding: '56px 24px' }}>
        <div className="row" style={{ alignItems: 'flex-end', marginBottom: 28, gap: 16, flexWrap: 'wrap' }}>
          <div>
            <div className="wordmark" style={{ fontSize: 46 }}>TOILE</div>
            <div className="muted" style={{ marginTop: 6 }}>Digitales Atelier – Schnitt, Material und 3D-Anprobe</div>
          </div>
          <span className="spacer" />
          <button className="btn" onClick={() => fileRef.current?.click()}><Upload size={15} /> Projekt importieren</button>
          <button className="btn primary" onClick={() => setCreating(true)}><Plus size={15} /> Neuer Look</button>
          <input ref={fileRef} type="file" accept=".toile,.json,application/json" hidden onChange={(e) => { void imp(e.target.files?.[0]); e.target.value = ''; }} />
        </div>
        {list && list.length === 0 && (
          <div className="card" style={{ padding: 40, textAlign: 'center', cursor: 'default' }}>
            <div style={{ font: '600 24px var(--serif)', marginBottom: 8 }}>Deine Mappe ist noch leer</div>
            <div className="muted" style={{ marginBottom: 18 }}>Lege einen Look an und beginne mit einem Grundschnitt.</div>
            <div><button className="btn primary" onClick={() => setCreating(true)}><Plus size={15} /> Ersten Look anlegen</button></div>
          </div>
        )}
        <div className="cards" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))' }}>
          {list?.map((m) => (
            <div key={m.id} className="card" onDoubleClick={() => open(m.id)}>
              <div className="thumb" onClick={() => open(m.id)}><Thumb blob={m.thumb} /></div>
              <div className="cap">
                <b>{m.name}</b>
                <span>{m.garments} Teil{m.garments === 1 ? '' : 'e'} · {new Date(m.updatedAt).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' })}</span>
                <div className="row" style={{ marginTop: 8, gap: 4 }}>
                  <button className="btn small" onClick={() => open(m.id)}><FolderOpen size={13} /> Öffnen</button>
                  <span className="spacer" />
                  <button className="btn ghost icon" title="Duplizieren" onClick={() => dup(m.id)}><Copy size={14} /></button>
                  <button className="btn ghost icon" title="Als Datei sichern" onClick={() => exp(m.id)}><Download size={14} /></button>
                  <button className="btn ghost icon danger" title="Löschen" onClick={() => del(m)}><Trash2 size={14} /></button>
                </div>
              </div>
            </div>
          ))}
        </div>
        <p className="muted small" style={{ marginTop: 28 }}>Projekte werden nur in diesem Browser gespeichert. Sichere wichtige Looks regelmäßig als Datei – so kannst du sie auch mit Freunden teilen.</p>
      </div>
      {creating && (
        <Dialog title="Neuer Look" narrow onClose={() => setCreating(false)} foot={<><button className="btn" onClick={() => setCreating(false)}>Abbrechen</button><button className="btn primary" onClick={create}>Anlegen</button></>}>
          <div className="panel-body" style={{ padding: 0 }}>
            <label className="lbl">Name</label>
            <input type="text" value={name} autoFocus onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && create()} />
            <label className="lbl" style={{ marginTop: 8 }}>Avatar & Größensystem</label>
            <Seg value={profile} onChange={setProfile} options={[{ value: 'women', label: 'Damen (EU 38)' }, { value: 'men', label: 'Herren (EU 50)' }]} />
          </div>
        </Dialog>
      )}
    </div>
  );
}
