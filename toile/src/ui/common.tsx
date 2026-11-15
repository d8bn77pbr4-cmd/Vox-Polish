import { useState, type ReactNode } from 'react';
import { ChevronDown, ChevronRight, X } from 'lucide-react';

export const cm = (mm: number, d = 1) => (mm / 10).toFixed(d).replace('.', ',');
export const fmtCm = (mm: number, d = 1) => `${cm(mm, d)} cm`;

const openState = new Map<string, boolean>();
export function Panel({ title, children, defaultOpen = true, right, id }: { title: string; children: ReactNode; defaultOpen?: boolean; right?: ReactNode; id?: string }) {
  const k = id ?? title;
  const [open, setOpen] = useState(openState.get(k) ?? defaultOpen);
  return (
    <section className="panel">
      <div className="panel-head" onClick={() => { openState.set(k, !open); setOpen(!open); }}>
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <span>{title}</span>
        <span className="spacer" />
        <span onClick={(e) => e.stopPropagation()}>{right}</span>
      </div>
      {open && <div className="panel-body">{children}</div>}
    </section>
  );
}

export function Slider({ label, value, min, max, step, onChange, format }: { label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void; format?: (v: number) => string }) {
  return (
    <label className="field">
      <span className="name">{label}</span>
      <span className="val">{format ? format(value) : value}</span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </label>
  );
}

export function NumInput({ value, onChange, unit = 'cm', step = 0.1, width = 72 }: { value: number; onChange: (mm: number) => void; unit?: 'cm' | 'mm' | '°' | ''; step?: number; width?: number }) {
  const [txt, setTxt] = useState<string | null>(null);
  const shown = unit === 'cm' ? cm(value) : String(Math.round(value * 100) / 100).replace('.', ',');
  const commit = (s: string) => {
    const v = Number(s.replace(',', '.'));
    if (Number.isFinite(v)) onChange(unit === 'cm' ? v * 10 : v);
    setTxt(null);
  };
  return (
    <span className="row" style={{ gap: 4 }}>
      <input className="num" style={{ width }} type="text" inputMode="decimal" value={txt ?? shown} step={step}
        onChange={(e) => setTxt(e.target.value)} onBlur={(e) => commit(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') commit((e.target as HTMLInputElement).value); }} />
      {unit && <span className="muted small">{unit}</span>}
    </span>
  );
}

export function Seg<T extends string | number>({ value, options, onChange }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="tabs" style={{ alignSelf: 'flex-start', flexWrap: 'wrap' }}>
      {options.map((o) => <button key={String(o.value)} className={'tab' + (o.value === value ? ' active' : '')} onClick={() => onChange(o.value)}>{o.label}</button>)}
    </div>
  );
}

export function Dialog({ title, onClose, children, foot, narrow }: { title: string; onClose: () => void; children: ReactNode; foot?: ReactNode; narrow?: boolean }) {
  return (
    <div className="dialog-back" onPointerDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={'dialog' + (narrow ? ' narrow' : '')}>
        <div className="dialog-head"><h2>{title}</h2><span className="spacer" /><button className="btn ghost icon" onClick={onClose}><X size={16} /></button></div>
        <div className="dialog-body">{children}</div>
        {foot && <div className="dialog-foot">{foot}</div>}
      </div>
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) { return <div className="empty"><div>{children}</div></div>; }
