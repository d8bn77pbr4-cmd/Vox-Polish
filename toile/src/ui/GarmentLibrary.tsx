import { useState } from 'react';
import { CATEGORIES, TEMPLATES } from '../core/templates/registry';
import { Dialog } from './common';
import { PiecePreview } from './PiecePreview';
import { addGarment } from '../state/actions';
import { useApp } from '../state/store';

const FAMILIES = [{ id: 'top', name: 'Oberteile' }, { id: 'bottom', name: 'Unterteile' }, { id: 'accessory', name: 'Accessoires' }] as const;

export function GarmentLibrary({ onClose }: { onClose: () => void }) {
  const profile = useApp((s) => s.project?.profile ?? 'women');
  const [cat, setCat] = useState('tshirt');
  const tmpls = TEMPLATES.filter((t) => t.category === cat);
  return (
    <Dialog title="Kleidungsstück hinzufügen" onClose={onClose}>
      <div style={{ display: 'grid', gridTemplateColumns: '180px 1fr', gap: 18 }}>
        <div className="list">
          {FAMILIES.map((f) => (
            <div key={f.id}>
              <div className="muted small" style={{ padding: '10px 8px 4px', textTransform: 'uppercase', letterSpacing: '.08em' }}>{f.name}</div>
              {CATEGORIES.filter((c) => c.family === f.id).map((c) => (
                <div key={c.id} className={'item' + (c.id === cat ? ' sel' : '')} onClick={() => setCat(c.id)}>{c.name}</div>
              ))}
            </div>
          ))}
        </div>
        <div className="cards">
          {tmpls.flatMap((t) => t.silhouettes.map((s) => (
            <button key={t.id + s.id} className="card" onClick={() => { addGarment(t.id, s.id); onClose(); }}>
              <div className="thumb"><PiecePreview t={t} silId={s.id} profile={profile} /></div>
              <div className="cap"><b>{s.name}</b><span>{s.description}</span></div>
            </button>
          )))}
        </div>
      </div>
    </Dialog>
  );
}
