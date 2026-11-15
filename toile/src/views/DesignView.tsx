import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { useApp, appStore } from '../state/store';
import { cursorStore } from '../state/cursor';
import { resolveGarment, surfaceFor, linkedFrom } from '../core/resolve';
import type { Layer } from '../core/model';
import type { Vec2 } from '../core/geometry/vec';
import { pointInPolygon } from '../core/geometry/path';
import { renderSurface } from '../render2d/compositor';
import { surfaceRenderFor, trimsFor } from '../render2d/instanceSurface';
import { getBitmap, onAssets } from '../render2d/assets';
import { getRaster, onRaster, dirtyRasters, notifyRaster } from '../render2d/raster';
import { Stroke } from '../render2d/brush';
import { addLayer, updateLayer, addTrim, updateTrim, editKey } from '../state/designActions';
import { addToLibrary } from '../state/library';
import { TrimGlyph } from '../ui/TrimGlyph';
import { ColorDisc } from '../ui/panels/ColorsPanel';
import { Empty, VSlider } from '../ui/common';
import { uid } from '../core/model';

interface ViewT { tx: number; ty: number; s: number }
type Drag =
  | { mode: 'pan'; sx: number; sy: number; tx: number; ty: number }
  | { mode: 'layer'; id: string; start: Vec2; ox: number; oy: number; key: string }
  | { mode: 'scale'; id: string; cx: number; cy: number; d0: number; w0: number; key: string }
  | { mode: 'rotate'; id: string; cx: number; cy: number; key: string }
  | { mode: 'trim'; id: string; start: Vec2; ox: number; oy: number; mir: boolean; key: string }
  | { mode: 'paint'; stroke: Stroke; layerId: string; before: HTMLCanvasElement; raster: HTMLCanvasElement; mir: number };

export function DesignView() {
  const project = useApp((s) => s.project)!;
  const ui = useApp((s) => s.ui);
  const version = useApp((s) => s.version);
  const [tick, bump] = useReducer((x: number) => x + 1, 0);
  useEffect(() => { const a = onAssets(bump), b = onRaster(bump); return () => { a(); b(); }; }, []);
  const g = project.garments.find((x) => x.id === ui.garmentId);
  const res = g ? resolveGarment(g) : null;
  const inst = res ? res.instances.find((i) => i.key === ui.instanceKey) ?? res.instances[0] : undefined;
  useEffect(() => { if (inst && inst.key !== ui.instanceKey) appStore.getState().setUi({ instanceKey: inst.key }); }, [inst?.key]);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<ViewT>({ tx: 0, ty: 0, s: 0.3 });
  const drag = useRef<Drag | null>(null);
  const pointers = useRef(new Map<number, Vec2>());
  const pinch = useRef<{ d: number; mid: Vec2; view: ViewT } | null>(null);
  const tap = useRef<{ t: number; n: number; moved: boolean } | null>(null);
  const sr = useMemo(() => (g && inst ? surfaceRenderFor(project, g, inst, true) : null), [project, g, inst, version]);
  const raf = useRef(0);
  const draw = () => { if (sr && canvasRef.current) renderSurface(canvasRef.current, sr); };
  useEffect(draw, [sr, tick]);
  const fit = () => {
    const el = wrapRef.current; if (!el || !sr) return;
    const s = Math.min((el.clientWidth - 120) / sr.frame.w, (el.clientHeight - 80) / sr.frame.h);
    setView({ s, tx: (el.clientWidth - sr.frame.w * s) / 2, ty: (el.clientHeight - sr.frame.h * s) / 2 });
  };
  useEffect(() => { const t = setTimeout(fit, 20); return () => clearTimeout(t); }, [inst?.key, sr?.frame.w, sr?.frame.h]);
  useEffect(() => {
    const el = wrapRef.current; if (!el) return;
    let w = el.clientWidth;
    const ro = new ResizeObserver(() => { if (Math.abs(el.clientWidth - w) > 40) { w = el.clientWidth; fit(); } });
    ro.observe(el); return () => ro.disconnect();
  });
  // paste images straight onto the current piece
  useEffect(() => {
    const onPaste = async (e: ClipboardEvent) => {
      if ((e.target as HTMLElement)?.closest?.('input,textarea')) return;
      const f = [...(e.clipboardData?.files ?? [])].find((x) => x.type.startsWith('image/'));
      if (!f || !g || !inst) return;
      e.preventDefault();
      const it = await addToLibrary(f, 'Eingefügt');
      addLayer(g.id, inst.key, 'image', { assetId: it.id, name: it.name });
      appStore.getState().toast('Bild eingefügt und in der Galerie gespeichert');
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [g?.id, inst?.key]);

  if (!g || !res || !inst || !sr) return <Empty>Wähle oder füge ein Kleidungsstück hinzu.</Empty>;
  const f = sr.frame, mx = sr.mirrorPlacement ? -1 : 1;
  const surface = surfaceFor(g, inst.key);
  const selLayer = surface.layers.find((l) => l.id === ui.layerId);
  const toMm = (cx: number, cy: number): Vec2 => {
    const r = wrapRef.current!.getBoundingClientRect();
    return { x: (cx - r.left - view.tx) / view.s / f.pxPerMm + f.x0, y: (cy - r.top - view.ty) / view.s / f.pxPerMm + f.y0 };
  };
  const ppm = f.pxPerMm;
  const imgBox = (l: Layer) => {
    if (l.kind === 'image') { const b = getBitmap(l.assetId); const h = b ? (l.w * b.height) / b.width : l.w; return { cx: l.x * mx, cy: l.y, w: l.w, h, rot: l.rot * mx }; }
    if (l.kind === 'text') { const w = l.size * Math.max(1, l.text.length) * 0.62 + l.tracking * l.text.length; return { cx: l.x * mx, cy: l.y, w, h: l.size * 1.1, rot: l.rot * mx }; }
    return null;
  };
  const inBox = (p: Vec2, b: NonNullable<ReturnType<typeof imgBox>>) => {
    const a = (-b.rot * Math.PI) / 180, dx = p.x - b.cx, dy = p.y - b.cy;
    const x = dx * Math.cos(a) - dy * Math.sin(a), y = dx * Math.sin(a) + dy * Math.cos(a);
    return Math.abs(x) <= b.w / 2 && Math.abs(y) <= b.h / 2;
  };
  const trims = trimsFor(g, inst.key);
  const sel = selLayer ? imgBox(selLayer) : null;
  const handleR = 9 / view.s / ppm;
  const corner = sel ? (() => { const a = (sel.rot * Math.PI) / 180; const dx = sel.w / 2, dy = sel.h / 2; return { x: sel.cx + dx * Math.cos(a) - dy * Math.sin(a), y: sel.cy + dx * Math.sin(a) + dy * Math.cos(a) }; })() : null;
  const rotH = sel ? (() => { const a = (sel.rot * Math.PI) / 180, d = sel.h / 2 + 18 / view.s / ppm; return { x: sel.cx + d * Math.sin(a), y: sel.cy - d * Math.cos(a) }; })() : null;
  const st = appStore.getState();

  const ensurePaintLayer = (): Extract<Layer, { kind: 'paint' }> => {
    const s = surfaceFor(appStore.getState().project!.garments.find((x) => x.id === g.id)!, inst.key);
    const cur = s.layers.find((l) => l.id === appStore.getState().ui.layerId);
    if (cur?.kind === 'paint' && !cur.locked) return cur;
    const top = [...s.layers].reverse().find((l) => l.kind === 'paint' && !l.locked);
    if (top && top.kind === 'paint') { st.setUi({ layerId: top.id }); return top; }
    const id = addLayer(g.id, inst.key, 'paint');
    const s2 = surfaceFor(appStore.getState().project!.garments.find((x) => x.id === g.id)!, inst.key);
    return s2.layers.find((l) => l.id === id) as Extract<Layer, { kind: 'paint' }>;
  };

  const onDown = (e: React.PointerEvent) => {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (e.pointerType === 'touch') {
      if (!tap.current || performance.now() - tap.current.t > 300) tap.current = { t: performance.now(), n: 0, moved: false };
      tap.current.n = Math.max(tap.current.n, pointers.current.size);
    }
    if (pointers.current.size >= 2) {
      if (drag.current?.mode === 'paint') { drag.current.stroke.end(); const c = drag.current.before.getContext('2d')!; drag.current.raster.getContext('2d')!.clearRect(0, 0, drag.current.raster.width, drag.current.raster.height); drag.current.raster.getContext('2d')!.drawImage(c.canvas, 0, 0); notifyRaster(); }
      const [a, b] = [...pointers.current.values()];
      pinch.current = { d: Math.hypot(a.x - b.x, a.y - b.y), mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, view };
      drag.current = null; return;
    }
    const p = toMm(e.clientX, e.clientY);
    const tool = ui.tool;
    if (e.button === 1 || tool === 'hand') { drag.current = { mode: 'pan', sx: e.clientX, sy: e.clientY, tx: view.tx, ty: view.ty }; return; }
    if (tool === 'brush' || tool === 'eraser') {
      const layer = ensurePaintLayer();
      const raster = getRaster(layer);
      const before = document.createElement('canvas'); before.width = raster.width; before.height = raster.height; before.getContext('2d')!.drawImage(raster, 0, 0);
      const brush = tool === 'eraser' ? { ...ui.brush, brush: 'eraser' } : ui.brush;
      const stroke = new Stroke(raster.getContext('2d')!, brush, ui.color, { erase: tool === 'eraser' });
      const mir = linkedFrom(g, inst.key) ? -1 : 1;
      const lf = layer.frame;
      stroke.add({ x: (p.x * mir - lf.x0) * lf.pxPerMm, y: (p.y - lf.y0) * lf.pxPerMm, pressure: e.pointerType === 'mouse' ? 1 : e.pressure });
      drag.current = { mode: 'paint', stroke, layerId: layer.id, before, raster, mir };
      draw();
      return;
    }
    if (tool === 'eyedropper') {
      const c = canvasRef.current!.getContext('2d')!;
      const d = c.getImageData(Math.round((p.x - f.x0) * ppm), Math.round((p.y - f.y0) * ppm), 1, 1).data;
      if (d[3] > 0) st.setUi({ color: '#' + [d[0], d[1], d[2]].map((v) => v.toString(16).padStart(2, '0')).join('') });
      return;
    }
    if (tool === 'fill') { addLayer(g.id, inst.key, 'fill'); return; }
    if (tool === 'text') { addLayer(g.id, inst.key, 'text', { x: p.x * mx, y: p.y }); st.setUi({ tool: 'move' }); return; }
    if (tool === 'trim') { const id = addTrim(g.id, inst.key, ui.trimType as never, p.x, p.y); st.setUi({ layerId: null }); cursorStore.setState({ hint: 'Zutat gesetzt' }); void id; return; }
    // move tool
    if (sel && selLayer && !selLayer.locked) {
      if (rotH && Math.hypot(p.x - rotH.x, p.y - rotH.y) < handleR * 1.4) { drag.current = { mode: 'rotate', id: selLayer.id, cx: sel.cx, cy: sel.cy, key: uid('d') }; return; }
      if (corner && Math.hypot(p.x - corner.x, p.y - corner.y) < handleR * 1.4 && selLayer.kind === 'image') { drag.current = { mode: 'scale', id: selLayer.id, cx: sel.cx, cy: sel.cy, d0: Math.hypot(p.x - sel.cx, p.y - sel.cy), w0: selLayer.w, key: uid('d') }; return; }
    }
    const ht = [...trims].reverse().find((t) => Math.hypot(p.x - t.x, p.y - t.y) < Math.max(t.size / 2, 6) + 2);
    if (ht) { st.setUi({ layerId: 'trim:' + ht.id }); drag.current = { mode: 'trim', id: ht.id, start: p, ox: ht.x, oy: ht.y, mir: ht.mirrored, key: uid('d') }; return; }
    const hit = [...surface.layers].reverse().find((l) => { const b = imgBox(l); return b && l.visible && !l.locked && inBox(p, b); });
    if (hit && (hit.kind === 'image' || hit.kind === 'text')) {
      st.setUi({ layerId: hit.id });
      drag.current = { mode: 'layer', id: hit.id, start: p, ox: hit.x, oy: hit.y, key: uid('d') };
      return;
    }
    if (!pointInPolygon(p, sr.outline)) st.setUi({ layerId: null });
    drag.current = { mode: 'pan', sx: e.clientX, sy: e.clientY, tx: view.tx, ty: view.ty };
  };
  const onMove = (e: React.PointerEvent) => {
    if (pointers.current.has(e.pointerId)) {
      const o = pointers.current.get(e.pointerId)!;
      if (tap.current && Math.hypot(e.clientX - o.x, e.clientY - o.y) > 12) tap.current.moved = true;
      pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    }
    if (pinch.current && pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y), mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const pv = pinch.current.view, r = wrapRef.current!.getBoundingClientRect();
      const s = Math.min(12, Math.max(0.03, pv.s * (d / pinch.current.d)));
      const mx0 = pinch.current.mid.x - r.left, my0 = pinch.current.mid.y - r.top;
      setView({ s, tx: mid.x - r.left - ((mx0 - pv.tx) / pv.s) * s, ty: mid.y - r.top - ((my0 - pv.ty) / pv.s) * s });
      return;
    }
    const p = toMm(e.clientX, e.clientY);
    cursorStore.setState({ x: p.x, y: p.y });
    const dr = drag.current; if (!dr) return;
    if (dr.mode === 'pan') setView({ ...view, tx: dr.tx + e.clientX - dr.sx, ty: dr.ty + e.clientY - dr.sy });
    if (dr.mode === 'paint') {
      const lay = surfaceFor(appStore.getState().project!.garments.find((x) => x.id === g.id)!, inst.key).layers.find((l) => l.id === dr.layerId);
      if (!lay || lay.kind !== 'paint') return;
      const lf = lay.frame;
      const evs = (e.nativeEvent as PointerEvent).getCoalescedEvents?.() ?? [e.nativeEvent];
      for (const ev of evs) {
        const q = toMm(ev.clientX, ev.clientY);
        dr.stroke.add({ x: (q.x * dr.mir - lf.x0) * lf.pxPerMm, y: (q.y - lf.y0) * lf.pxPerMm, pressure: e.pointerType === 'mouse' ? 1 : ev.pressure });
      }
      cancelAnimationFrame(raf.current); raf.current = requestAnimationFrame(draw);
    }
    if (dr.mode === 'layer') updateLayer(g.id, inst.key, dr.id, { x: dr.ox + (p.x - dr.start.x) * mx, y: dr.oy + p.y - dr.start.y }, 'Ebene verschieben', dr.key);
    if (dr.mode === 'scale') updateLayer(g.id, inst.key, dr.id, { w: Math.max(5, dr.w0 * (Math.hypot(p.x - dr.cx, p.y - dr.cy) / dr.d0)) } as Partial<Layer>, 'Ebene skalieren', dr.key);
    if (dr.mode === 'rotate') { const a = (Math.atan2(p.x - dr.cx, -(p.y - dr.cy)) * 180) / Math.PI; updateLayer(g.id, inst.key, dr.id, { rot: Math.round(a * mx * (e.shiftKey ? 1 / 15 : 1)) * (e.shiftKey ? 15 : 1) } as Partial<Layer>, 'Ebene drehen', dr.key); }
    if (dr.mode === 'trim') { const nx = dr.ox + p.x - dr.start.x, ny = dr.oy + p.y - dr.start.y; updateTrim(g.id, dr.id, { x: dr.mir ? -nx : nx, y: ny }, dr.key); }
  };
  const onUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    if (pointers.current.size === 0 && tap.current && !tap.current.moved && performance.now() - tap.current.t < 300 && tap.current.n >= 2) {
      if (tap.current.n === 2) st.undo(); else st.redo();
      tap.current = null; drag.current = null; return;
    }
    const dr = drag.current;
    if (dr?.mode === 'paint') {
      const r = dr.stroke.end();
      const x = Math.max(0, r.x), y = Math.max(0, r.y), w = Math.min(dr.raster.width - x, r.w), h = Math.min(dr.raster.height - y, r.h);
      if (w > 0 && h > 0) {
        const before = dr.before.getContext('2d')!.getImageData(x, y, w, h), after = dr.raster.getContext('2d')!.getImageData(x, y, w, h);
        st.pushRaster({ kind: 'raster', label: 'Pinselstrich', layerId: dr.layerId, rect: { x, y, w, h }, before, after });
        dirtyRasters.add(dr.layerId); notifyRaster();
      }
    }
    drag.current = null;
  };
  const onWheel = (e: React.WheelEvent) => {
    const r = wrapRef.current!.getBoundingClientRect();
    if (e.ctrlKey || e.metaKey || e.altKey) {
      const s = Math.min(12, Math.max(0.03, view.s * Math.exp(-e.deltaY * 0.0022)));
      const mx0 = e.clientX - r.left, my0 = e.clientY - r.top;
      setView({ s, tx: mx0 - ((mx0 - view.tx) / view.s) * s, ty: my0 - ((my0 - view.ty) / view.s) * s });
    } else setView({ ...view, tx: view.tx - e.deltaX, ty: view.ty - e.deltaY });
  };
  const onDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    const p = toMm(e.clientX, e.clientY);
    const asset = e.dataTransfer.getData('application/x-toile-asset');
    let id = asset, name = 'Druck';
    if (!id) {
      const file = [...e.dataTransfer.files].find((x) => x.type.startsWith('image/'));
      if (!file) return;
      const it = await addToLibrary(file, file.name); id = it.id; name = it.name;
    }
    addLayer(g.id, inst.key, 'image', { assetId: id, name, x: p.x * mx, y: p.y });
  };
  const paintTool = ui.tool === 'brush' || ui.tool === 'eraser';
  const cursor = paintTool ? 'crosshair' : ui.tool === 'hand' ? 'grab' : ui.tool === 'eyedropper' ? 'copy' : ui.tool === 'trim' || ui.tool === 'text' ? 'cell' : 'default';
  const brushPx = ui.brush.size * view.s;
  return (
    <div ref={wrapRef} style={{ position: 'absolute', inset: 0, overflow: 'hidden', background: 'radial-gradient(circle at 50% 40%, #1a1a1d, #0d0d0f)', touchAction: 'none', cursor }}
      onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} onWheel={onWheel}
      onDragOver={(e) => e.preventDefault()} onDrop={onDrop} onPointerLeave={() => cursorStore.setState({ x: null, y: null })}>
      <canvas ref={canvasRef} style={{ position: 'absolute', left: 0, top: 0, transformOrigin: '0 0', transform: `translate(${view.tx}px, ${view.ty}px) scale(${view.s})`, imageRendering: view.s > 2 ? 'pixelated' : 'auto', filter: 'drop-shadow(0 18px 30px rgba(0,0,0,.5))' }} />
      <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
        <g transform={`translate(${view.tx} ${view.ty}) scale(${view.s}) scale(${ppm}) translate(${-f.x0} ${-f.y0})`}>
          <path d={'M' + sr.outline.map((q) => `${q.x} ${q.y}`).join('L') + 'Z'} fill="none" stroke="rgba(236,233,228,.35)" strokeWidth={1 / view.s / ppm} />
          {trims.map((t) => <g key={t.id} transform={`translate(${t.x} ${t.y})`} opacity={t.mirrored ? 0.85 : 1}><TrimGlyph t={t} selected={ui.layerId === 'trim:' + t.id} /></g>)}
          {sel && corner && rotH && ui.tool === 'move' && (
            <g>
              <g transform={`translate(${sel.cx} ${sel.cy}) rotate(${sel.rot})`}>
                <rect x={-sel.w / 2} y={-sel.h / 2} width={sel.w} height={sel.h} fill="none" stroke="#d8c3a0" strokeWidth={1.2 / view.s / ppm} strokeDasharray={`${5 / view.s / ppm} ${3 / view.s / ppm}`} />
              </g>
              <line x1={sel.cx + (rotH.x - sel.cx) * 0.6} y1={sel.cy + (rotH.y - sel.cy) * 0.6} x2={rotH.x} y2={rotH.y} stroke="#d8c3a0" strokeWidth={1 / view.s / ppm} />
              <circle cx={rotH.x} cy={rotH.y} r={handleR * 0.7} fill="#111" stroke="#d8c3a0" strokeWidth={1.2 / view.s / ppm} />
              {selLayer?.kind === 'image' && <rect x={corner.x - handleR * 0.6} y={corner.y - handleR * 0.6} width={handleR * 1.2} height={handleR * 1.2} fill="#d8c3a0" />}
            </g>
          )}
        </g>
      </svg>
      {paintTool && (
        <div className="floating" style={{ left: 12, top: '50%', transform: 'translateY(-50%)', padding: '10px 6px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }} onPointerDown={(e) => e.stopPropagation()}>
          <span className="muted small">Größe</span>
          <VSlider value={Math.sqrt(ui.brush.size)} min={1} max={Math.sqrt(300)} onChange={(v) => st.setUi({ brush: { ...ui.brush, size: v * v } })} />
          <span className="small">{Math.round(ui.brush.size)}</span>
          <span className="muted small">Deckkr.</span>
          <VSlider value={ui.brush.opacity} min={0.02} max={1} onChange={(v) => st.setUi({ brush: { ...ui.brush, opacity: v } })} />
          <span className="small">{Math.round(ui.brush.opacity * 100)}%</span>
          <div style={{ width: Math.min(46, Math.max(3, brushPx)), height: Math.min(46, Math.max(3, brushPx)), borderRadius: '50%', border: '1px solid var(--line2)', background: ui.tool === 'eraser' ? 'transparent' : ui.color }} />
        </div>
      )}
      <div style={{ position: 'absolute', right: 14, top: 14 }} onPointerDown={(e) => e.stopPropagation()}><ColorDisc /></div>
      <div className="floating small muted" style={{ left: 12, bottom: 12, padding: '5px 10px' }}>
        {inst.piece.name}{inst.side !== 'C' ? (inst.side === 'L' ? ' · links' : ' · rechts') : ''}{linkedFrom(g, inst.key) ? ' · gekoppelt mit links' : ''} · {Math.round(view.s * 100)} %
        {editKey(g, inst.key) !== inst.key ? '' : ''}
      </div>
    </div>
  );
}
