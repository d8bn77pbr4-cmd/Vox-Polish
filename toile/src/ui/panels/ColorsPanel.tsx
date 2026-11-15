import { useEffect, useRef, useState } from 'react';
import { Plus } from 'lucide-react';
import { useApp, appStore } from '../../state/store';
import { Panel } from '../common';
import { BASE_COLORS, SEASON_PALETTES } from '../../core/textile/catalog';
import { surfaceFor } from '../../core/resolve';
import { updateLayer } from '../../state/designActions';

const hex2rgb = (h: string) => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const rgb2hex = (r: number, g: number, b: number) => '#' + [r, g, b].map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');
function rgb2hsv(r: number, g: number, b: number) { r /= 255; g /= 255; b /= 255; const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn; let h = 0; if (d) h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; return [((h * 60) + 360) % 360, mx ? d / mx : 0, mx]; }
function hsv2rgb(h: number, s: number, v: number) { const c = v * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = v - c; const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x]; return [(r + m) * 255, (g + m) * 255, (b + m) * 255]; }

/** Sets the current colour and recolours the selected fill/text layer. */
export function pickColor(hex: string) {
  const s = appStore.getState();
  s.setUi({ color: hex });
  const g = s.project?.garments.find((x) => x.id === s.ui.garmentId);
  if (!g || !s.ui.instanceKey || !s.ui.layerId) return;
  const l = surfaceFor(g, s.ui.instanceKey).layers.find((x) => x.id === s.ui.layerId);
  if (l && (l.kind === 'fill' || l.kind === 'text')) updateLayer(g.id, s.ui.instanceKey, l.id, { color: hex }, 'Farbe', `color:${l.id}`);
}

export function ColorPicker({ value, onChange }: { value: string; onChange: (hex: string) => void }) {
  const [h, s, v] = rgb2hsv(...(hex2rgb(value) as [number, number, number]));
  const [hue, setHue] = useState(h);
  useEffect(() => { if (s > 0.02) setHue(h); }, [value]);
  const sq = useRef<HTMLDivElement>(null);
  const pick = (e: React.PointerEvent) => {
    const r = sq.current!.getBoundingClientRect();
    const ss = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), vv = Math.min(1, Math.max(0, 1 - (e.clientY - r.top) / r.height));
    onChange(rgb2hex(...(hsv2rgb(hue, ss, vv) as [number, number, number])));
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div ref={sq} style={{ position: 'relative', height: 150, borderRadius: 8, background: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, hsl(${hue} 100% 50%))`, cursor: 'crosshair', touchAction: 'none' }}
        onPointerDown={(e) => { (e.target as Element).setPointerCapture(e.pointerId); pick(e); }} onPointerMove={(e) => e.buttons && pick(e)}>
        <div style={{ position: 'absolute', left: `${s * 100}%`, top: `${(1 - v) * 100}%`, width: 14, height: 14, margin: -7, borderRadius: '50%', border: '2px solid #fff', boxShadow: '0 0 0 1px #000' }} />
      </div>
      <input type="range" min={0} max={359} value={hue} style={{ background: 'linear-gradient(to right,red,#ff0,lime,cyan,blue,#f0f,red)', borderRadius: 6, accentColor: '#fff' }}
        onChange={(e) => { const nh = Number(e.target.value); setHue(nh); onChange(rgb2hex(...(hsv2rgb(nh, Math.max(s, 0.01), Math.max(v, 0.01)) as [number, number, number]))); }} />
      <div className="row"><span style={{ width: 26, height: 26, borderRadius: 6, background: value, border: '1px solid var(--line2)' }} />
        <input type="text" value={value} onChange={(e) => /^#[0-9a-f]{6}$/i.test(e.target.value) && onChange(e.target.value.toLowerCase())} style={{ width: 90 }} /></div>
    </div>
  );
}

export function ColorDisc() {
  const color = useApp((s) => s.ui.color);
  const [open, setOpen] = useState(false);
  return (
    <div style={{ position: 'relative' }}>
      <button title="Farbe" onClick={() => setOpen(!open)} style={{ width: 38, height: 38, borderRadius: '50%', background: color, border: '3px solid #2a2a2e', boxShadow: '0 0 0 1px #3a3a40, 0 6px 16px rgba(0,0,0,.4)', cursor: 'pointer' }} />
      {open && <div className="floating" style={{ right: 0, top: 46, width: 250, padding: 12 }}><ColorPicker value={color} onChange={pickColor} />
        <div className="swatches" style={{ marginTop: 10 }}>{BASE_COLORS.map((c) => <button key={c.hex} className="swatch" title={c.name} style={{ background: c.hex }} onClick={() => pickColor(c.hex)} />)}</div></div>}
    </div>
  );
}

export function ColorsPanel() {
  const color = useApp((s) => s.ui.color);
  const palette = useApp((s) => s.project?.palette ?? []);
  return (
    <Panel title="Farben" defaultOpen={false}>
      <ColorPicker value={color} onChange={pickColor} />
      <div className="muted small">Atelier-Grundfarben</div>
      <div className="swatches">{BASE_COLORS.map((c) => <button key={c.hex} className={'swatch' + (c.hex === color ? ' sel' : '')} title={c.name} style={{ background: c.hex }} onClick={() => pickColor(c.hex)} />)}</div>
      {SEASON_PALETTES.map((p) => (
        <div key={p.name}><div className="muted small">{p.name}</div>
          <div className="swatches" style={{ marginTop: 4 }}>{p.colors.map((c) => <button key={c} className="swatch" style={{ background: c }} onClick={() => pickColor(c)} />)}</div></div>
      ))}
      <div className="row"><span className="muted small">Projektpalette</span><span className="spacer" />
        <button className="btn small" onClick={() => appStore.getState().update('Palette', (d) => { if (!d.palette.includes(color)) d.palette.push(color); })}><Plus size={12} /> aktuelle</button></div>
      <div className="swatches">{palette.map((c, i) => <button key={c + i} className="swatch" style={{ background: c }} onClick={() => pickColor(c)} onContextMenu={(e) => { e.preventDefault(); appStore.getState().update('Palette', (d) => { d.palette.splice(i, 1); }); }} title="Rechtsklick entfernt" />)}</div>
    </Panel>
  );
}
