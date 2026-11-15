import { useEffect, useMemo, useRef, useState } from 'react';
import { useApp, appStore } from '../state/store';
import { cursorStore } from '../state/cursor';
import { resolveGarment } from '../core/resolve';
import { getTemplate, defaultParams } from '../core/templates/registry';
import { SIZE_SYSTEMS, measurementsFor, sizeName } from '../core/sizing/charts';
import type { Vec2 } from '../core/geometry/vec';
import { pointInPolygon, edgePolyline } from '../core/geometry/path';
import { pieceAnchor } from '../core/pattern/piece';
import { insertNode, deleteNode, toggleCurve, moveNodes, setHandle, nearestOnOutline, mirrorPartner, makeCustomPiece } from '../core/pattern/edit';
import type { PatternPiece, Seam } from '../core/pattern/types';
import { layoutPieces, pathD, polyD, notchMarks, type PieceGeo } from './patternGeometry';
import { editPiece, setLayout, addSeam, addCustomPiece } from '../state/actions';
import { Empty, fmtCm, Dialog, Seg } from '../ui/common';
import { uid } from '../core/model';
import type { Zone } from '../core/pattern/types';

interface ViewT { tx: number; ty: number; s: number }
type Drag =
  | { mode: 'pan'; sx: number; sy: number; tx: number; ty: number }
  | { mode: 'piece'; id: string; start: Vec2; pos: Vec2; key: string }
  | { mode: 'nodes'; pieceId: string; ids: string[]; last: Vec2; key: string }
  | { mode: 'handle'; pieceId: string; node: string; which: 'hin' | 'hout'; key: string }
  | { mode: 'measure'; a: Vec2; b: Vec2 };

const SEAM_HUES = [28, 200, 120, 300, 55, 170, 340, 260, 90, 10];
const ZONES: { value: Zone; label: string }[] = [
  { value: 'torsoFront', label: 'Vorderkörper' }, { value: 'torsoBack', label: 'Rücken' }, { value: 'arm', label: 'Arm' },
  { value: 'legFront', label: 'Bein vorne' }, { value: 'legBack', label: 'Bein hinten' }, { value: 'waist', label: 'Taille' },
  { value: 'neck', label: 'Hals' }, { value: 'head', label: 'Kopf' }, { value: 'none', label: 'Nur 2D' },
];

export function PatternView() {
  const project = useApp((s) => s.project)!;
  const ui = useApp((s) => s.ui);
  const g = project.garments.find((x) => x.id === ui.garmentId);
  const svgRef = useRef<SVGSVGElement>(null);
  const [view, setView] = useState<ViewT>({ tx: 40, ty: 40, s: 0.3 });
  const drag = useRef<Drag | null>(null);
  const pointers = useRef(new Map<number, Vec2>());
  const pinch = useRef<{ d: number; mid: Vec2; view: ViewT } | null>(null);
  const [hover, setHover] = useState<{ pieceId: string; seg: number; pt: Vec2 } | null>(null);
  const [measure, setMeasure] = useState<{ a: Vec2; b: Vec2 } | null>(null);
  const [sewFirst, setSewFirst] = useState<{ pieceId: string; from: string; to: string } | null>(null);
  const [pen, setPen] = useState<Vec2[]>([]);
  const [penDone, setPenDone] = useState<Vec2[] | null>(null);
  const space = useRef(false);

  const res = g ? resolveGarment(g) : null;
  const geos = useMemo(() => (res && g ? layoutPieces(res.pieces, g.layout, ui.showSA) : []), [res, g?.layout, ui.showSA]);
  const geoById = useMemo(() => new Map(geos.map((x) => [x.piece.id, x])), [geos]);

  const fit = () => {
    const el = svgRef.current; if (!el || !geos.length) return;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const q of geos) { minX = Math.min(minX, q.b.minX + q.ox); minY = Math.min(minY, q.b.minY + q.oy); maxX = Math.max(maxX, q.b.maxX + q.ox); maxY = Math.max(maxY, q.b.maxY + q.oy); }
    const r = el.getBoundingClientRect();
    const s = Math.min((r.width - 80) / (maxX - minX), (r.height - 80) / (maxY - minY));
    setView({ s, tx: (r.width - (maxX - minX) * s) / 2 - minX * s, ty: (r.height - (maxY - minY) * s) / 2 - minY * s });
  };
  useEffect(() => { const t = setTimeout(fit, 30); return () => clearTimeout(t); }, [g?.id, geos.length]);
  useEffect(() => { cursorStore.setState({ zoom: view.s }); }, [view.s]);
  const fitRef = useRef(fit); fitRef.current = fit;
  useEffect(() => {
    const el = svgRef.current?.parentElement; if (!el) return;
    let w = el.clientWidth;
    const ro = new ResizeObserver(() => { if (Math.abs(el.clientWidth - w) > 40) { w = el.clientWidth; fitRef.current(); } });
    ro.observe(el); return () => ro.disconnect();
  }, [g?.id]);
  useEffect(() => {
    const kd = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input,textarea,select')) return;
      if (e.code === 'Space') space.current = true;
      if ((e.metaKey || e.ctrlKey) && e.key === '0') { e.preventDefault(); fit(); }
      const sel = appStore.getState().ui.selection;
      if (!g || !sel.pieceId) return;
      if ((e.key === 'Delete' || e.key === 'Backspace') && sel.nodeIds.length) {
        editPiece(g.id, sel.pieceId, (p) => sel.nodeIds.reduce((acc, id) => deleteNode(acc, id), p), undefined, 'Punkt löschen');
        appStore.getState().setUi({ selection: { pieceId: sel.pieceId, nodeIds: [] } });
      }
      const arrows: Record<string, Vec2> = { ArrowLeft: { x: -1, y: 0 }, ArrowRight: { x: 1, y: 0 }, ArrowUp: { x: 0, y: -1 }, ArrowDown: { x: 0, y: 1 } };
      if (arrows[e.key] && sel.nodeIds.length) {
        e.preventDefault();
        const k = e.shiftKey ? 10 : 1;
        editPiece(g.id, sel.pieceId, (p) => moveNodes(p, sel.nodeIds, arrows[e.key].x * k, arrows[e.key].y * k), 'nudge', 'Punkt verschieben');
      }
      if (e.key === 'Escape') { setPen([]); setSewFirst(null); setMeasure(null); }
    };
    const ku = (e: KeyboardEvent) => { if (e.code === 'Space') space.current = false; };
    window.addEventListener('keydown', kd); window.addEventListener('keyup', ku);
    return () => { window.removeEventListener('keydown', kd); window.removeEventListener('keyup', ku); };
  }, [g?.id, geos]);

  // ---- grading overlay ----
  const gradeSets = useMemo(() => {
    if (!g || !ui.grading || g.size.system === 'custom') return [];
    const t = getTemplate(g.templateId);
    const sys = SIZE_SYSTEMS[g.size.system];
    return sys.labels.map((label, i) => ({ label, hue: 200 - (i / (sys.labels.length - 1)) * 200, pieces: t.build(measurementsFor({ system: g.size.system as 'womenEU', label }), { ...defaultParams(t), ...g.params }).pieces }));
  }, [ui.grading, g?.size, g?.params, g?.templateId]);

  if (!g || !res) return <Empty><div style={{ font: '600 22px var(--serif)', marginBottom: 8 }}>Noch kein Kleidungsstück</div><button className="btn primary" onClick={() => appStore.getState().setUi({ dialog: 'library' })}>Kleidungsstück hinzufügen</button></Empty>;

  const toSheet = (cx: number, cy: number): Vec2 => {
    const r = svgRef.current!.getBoundingClientRect();
    return { x: (cx - r.left - view.tx) / view.s, y: (cy - r.top - view.ty) / view.s };
  };
  const local = (gp: PieceGeo, p: Vec2) => ({ x: p.x - gp.ox, y: p.y - gp.oy });
  const tol = 9 / view.s;
  const hitPiece = (p: Vec2) => [...geos].reverse().find((gp) => pointInPolygon(local(gp, p), gp.poly) || pointInPolygon(local(gp, p), gp.sa));
  const hitNode = (gp: PieceGeo, p: Vec2) => {
    const q = local(gp, p);
    let best: { id: string; handle?: 'hin' | 'hout'; d: number } | null = null;
    for (const n of gp.piece.nodes) {
      const cands: [number, 'hin' | 'hout' | undefined][] = [[Math.hypot(n.x - q.x, n.y - q.y), undefined]];
      if (ui.selection.nodeIds.includes(n.id)) {
        if (n.hin) cands.push([Math.hypot(n.hin.x - q.x, n.hin.y - q.y), 'hin']);
        if (n.hout) cands.push([Math.hypot(n.hout.x - q.x, n.hout.y - q.y), 'hout']);
      }
      for (const [d, h] of cands) if (d < tol && (!best || d < best.d)) best = { id: n.id, handle: h, d };
    }
    return best;
  };
  const hitEdge = (p: Vec2) => {
    let best: { gp: PieceGeo; seg: number; t: number; dist: number; pt: Vec2 } | null = null;
    for (const gp of geos) {
      const r = nearestOnOutline(gp.piece, local(gp, p));
      if (r.dist < tol && (!best || r.dist < best.dist)) best = { gp, ...r };
    }
    return best;
  };
  const snap = (p: Vec2): Vec2 => {
    for (const gp of geos) for (const n of gp.piece.nodes) { const q = { x: n.x + gp.ox, y: n.y + gp.oy }; if (Math.hypot(q.x - p.x, q.y - p.y) < tol) return q; }
    return p;
  };
  const sel = ui.selection;
  const setSel = (s: typeof sel) => appStore.getState().setUi({ selection: s });

  const onDown = (e: React.PointerEvent) => {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinch.current = { d: Math.hypot(a.x - b.x, a.y - b.y), mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, view };
      drag.current = null; return;
    }
    const p = toSheet(e.clientX, e.clientY);
    const tool = ui.tool;
    if (e.button === 1 || space.current || tool === 'hand') { drag.current = { mode: 'pan', sx: e.clientX, sy: e.clientY, tx: view.tx, ty: view.ty }; return; }
    if (tool === 'measure') { const a = snap(p); drag.current = { mode: 'measure', a, b: a }; setMeasure({ a, b: a }); return; }
    if (tool === 'pen') {
      const q = snap(p);
      if (pen.length >= 3 && Math.hypot(q.x - pen[0].x, q.y - pen[0].y) < tol * 1.5) { setPenDone(pen); setPen([]); }
      else setPen([...pen, q]);
      return;
    }
    if (tool === 'addPoint' || tool === 'notch' || tool === 'sew') {
      const h = hitEdge(p);
      if (!h) { drag.current = { mode: 'pan', sx: e.clientX, sy: e.clientY, tx: view.tx, ty: view.ty }; return; }
      const pc = h.gp.piece, from = pc.nodes[h.seg].id, to = pc.nodes[(h.seg + 1) % pc.nodes.length].id;
      if (tool === 'addPoint') editPiece(g.id, pc.id, (q) => insertNode(q, h.seg, h.t), undefined, 'Punkt einfügen');
      if (tool === 'notch') {
        const before = edgePolyline(pc.nodes, from, to);
        let acc = 0, best = 0, bd = Infinity;
        for (let i = 1; i < before.length; i++) {
          const L = Math.hypot(before[i].x - before[i - 1].x, before[i].y - before[i - 1].y);
          const d = Math.hypot(before[i].x - h.pt.x, before[i].y - h.pt.y);
          acc += L; if (d < bd) { bd = d; best = acc; }
        }
        editPiece(g.id, pc.id, (q) => ({ ...q, notches: [...q.notches, { id: uid('k'), at: from, offset: best }] }), undefined, 'Knips setzen');
      }
      if (tool === 'sew') {
        if (!sewFirst) { setSewFirst({ pieceId: pc.id, from, to }); appStore.getState().toast('Erste Kante gewählt – jetzt die Gegenkante antippen'); }
        else {
          if (sewFirst.pieceId === pc.id && sewFirst.from === from) { setSewFirst(null); return; }
          const pa = geoById.get(sewFirst.pieceId)!.piece;
          const both2 = pa.cut.count === 2 && pc.cut.count === 2;
          const mk = (side?: 'L' | 'R'): Seam => ({ id: uid('s_'), a: { piece: sewFirst.pieceId, side: pa.cut.count === 2 ? side ?? 'L' : undefined, from: sewFirst.from, to: sewFirst.to }, b: { piece: pc.id, side: pc.cut.count === 2 ? side ?? 'L' : undefined, from, to }, flip: true });
          addSeam(g.id, mk('L'));
          if (both2) addSeam(g.id, mk('R'));
          setSewFirst(null);
          appStore.getState().toast('Naht angelegt – Richtung in „Prüfung“ umkehrbar');
        }
      }
      return;
    }
    const gp = sel.pieceId ? geoById.get(sel.pieceId) : undefined;
    if ((tool === 'direct' || tool === 'delPoint' || tool === 'curve') && gp) {
      const hn = hitNode(gp, p);
      if (hn) {
        if (tool === 'delPoint') { editPiece(g.id, gp.piece.id, (q) => deleteNode(q, hn.id), undefined, 'Punkt löschen'); return; }
        if (tool === 'curve') { editPiece(g.id, gp.piece.id, (q) => toggleCurve(q, hn.id), undefined, 'Kurve umschalten'); return; }
        if (hn.handle) { drag.current = { mode: 'handle', pieceId: gp.piece.id, node: hn.id, which: hn.handle, key: uid('d') }; return; }
        const ids = e.shiftKey ? Array.from(new Set([...sel.nodeIds, hn.id])) : sel.nodeIds.includes(hn.id) ? sel.nodeIds : [hn.id];
        setSel({ pieceId: gp.piece.id, nodeIds: ids });
        drag.current = { mode: 'nodes', pieceId: gp.piece.id, ids, last: p, key: uid('d') };
        return;
      }
    }
    const hp = hitPiece(p);
    if (hp) {
      setSel({ pieceId: hp.piece.id, nodeIds: hp.piece.id === sel.pieceId ? sel.nodeIds : [] });
      if (tool === 'select' || tool === 'direct') {
        const pos = g.layout[hp.piece.id] ?? { x: hp.b.minX + hp.ox, y: hp.b.minY + hp.oy };
        drag.current = { mode: 'piece', id: hp.piece.id, start: p, pos, key: uid('d') };
      }
    } else {
      setSel({ nodeIds: [] });
      drag.current = { mode: 'pan', sx: e.clientX, sy: e.clientY, tx: view.tx, ty: view.ty };
    }
  };
  const onMove = (e: React.PointerEvent) => {
    if (pointers.current.has(e.pointerId)) pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch.current && pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y), mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const pv = pinch.current.view, k = d / pinch.current.d, r = svgRef.current!.getBoundingClientRect();
      const s = Math.min(8, Math.max(0.05, pv.s * k));
      const mx = pinch.current.mid.x - r.left, my = pinch.current.mid.y - r.top;
      setView({ s, tx: mid.x - r.left - ((mx - pv.tx) / pv.s) * s, ty: mid.y - r.top - ((my - pv.ty) / pv.s) * s });
      return;
    }
    const p = toSheet(e.clientX, e.clientY);
    cursorStore.setState({ x: p.x, y: p.y });
    const dr = drag.current;
    if (!dr) {
      if (['addPoint', 'notch', 'sew', 'measure'].includes(ui.tool)) {
        const h = hitEdge(p);
        setHover(h ? { pieceId: h.gp.piece.id, seg: h.seg, pt: { x: h.pt.x + h.gp.ox, y: h.pt.y + h.gp.oy } } : null);
      }
      if (ui.tool === 'pen' && pen.length) setMeasure({ a: pen[pen.length - 1], b: snap(p) });
      return;
    }
    if (dr.mode === 'pan') setView({ ...view, tx: dr.tx + e.clientX - dr.sx, ty: dr.ty + e.clientY - dr.sy });
    if (dr.mode === 'piece') setLayout(g.id, dr.id, dr.pos.x + p.x - dr.start.x, dr.pos.y + p.y - dr.start.y, dr.key);
    if (dr.mode === 'measure') { dr.b = snap(p); setMeasure({ a: dr.a, b: dr.b }); }
    if (dr.mode === 'nodes') {
      const dx = p.x - dr.last.x, dy = p.y - dr.last.y;
      dr.last = p;
      const sym = ui.symmetric;
      editPiece(g.id, dr.pieceId, (q) => {
        let out = moveNodes(q, dr.ids, dx, dy);
        if (sym) {
          const partners = dr.ids.map((id) => mirrorPartner(q, id)).filter((x): x is string => !!x && !dr.ids.includes(x));
          if (partners.length) out = moveNodes(out, partners, -dx, dy);
        }
        return out;
      }, dr.key, 'Punkt verschieben');
    }
    if (dr.mode === 'handle') {
      const gp = geoById.get(dr.pieceId)!;
      editPiece(g.id, dr.pieceId, (q) => setHandle(q, dr.node, dr.which, local(gp, p), !e.altKey), dr.key, 'Kurve formen');
    }
  };
  const onUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    if (drag.current?.mode === 'measure') { /* keep result visible */ }
    drag.current = null;
  };
  const onWheel = (e: React.WheelEvent) => {
    const r = svgRef.current!.getBoundingClientRect();
    if (e.ctrlKey || e.metaKey || e.altKey) {
      const k = Math.exp(-e.deltaY * 0.0022), s = Math.min(8, Math.max(0.05, view.s * k));
      const mx = e.clientX - r.left, my = e.clientY - r.top;
      setView({ s, tx: mx - ((mx - view.tx) / view.s) * s, ty: my - ((my - view.ty) / view.s) * s });
    } else setView({ ...view, tx: view.tx - e.deltaX, ty: view.ty - e.deltaY });
  };

  const strokeW = 1.3 / view.s;
  const seamColor = new Map<string, number>();
  res.seams.forEach((s, i) => seamColor.set(s.id, SEAM_HUES[i % SEAM_HUES.length]));
  const showSeams = ui.tool === 'sew' || !!ui.hoverSeam;
  const seamEdges: { d: string; hue: number; key: string }[] = [];
  if (showSeams) for (const s of res.seams) {
    if (ui.hoverSeam && s.id !== ui.hoverSeam) continue;
    for (const e of [s.a, s.b]) {
      const gp = geoById.get(e.piece); if (!gp) continue;
      try { const pts = edgePolyline(gp.piece.nodes, e.from, e.to); seamEdges.push({ key: s.id + e.piece + e.side + e.from, hue: seamColor.get(s.id)!, d: 'M' + pts.map((q) => `${q.x + gp.ox} ${q.y + gp.oy}`).join(' L') }); } catch { /* ignore */ }
    }
  }
  const cursorFor: Record<string, string> = { hand: 'grab', pen: 'crosshair', measure: 'crosshair', addPoint: 'copy', sew: 'cell', notch: 'crosshair' };
  return (
    <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(circle at 50% 40%, #17171a, #0e0e10)' }}>
      <svg ref={svgRef} width="100%" height="100%" style={{ touchAction: 'none', cursor: cursorFor[ui.tool] ?? 'default', display: 'block' }}
        onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} onWheel={onWheel}
        onPointerLeave={() => cursorStore.setState({ x: null, y: null })}>
        <defs>
          <pattern id="grid10" width={10} height={10} patternUnits="userSpaceOnUse"><path d="M10 0H0V10" fill="none" stroke="#ffffff" strokeOpacity={0.035} strokeWidth={0.5 / view.s} /></pattern>
          <pattern id="grid100" width={100} height={100} patternUnits="userSpaceOnUse"><rect width={100} height={100} fill="url(#grid10)" /><path d="M100 0H0V100" fill="none" stroke="#ffffff" strokeOpacity={0.07} strokeWidth={1 / view.s} /></pattern>
          <marker id="arr" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="#8b8790" /></marker>
        </defs>
        <g transform={`translate(${view.tx} ${view.ty}) scale(${view.s})`}>
          <rect x={-5000} y={-5000} width={12000} height={12000} fill="url(#grid100)" />
          {geos.map((gp) => {
            const selected = gp.piece.id === sel.pieceId;
            const isOverride = !!g.overrides[gp.piece.id] || g.custom.some((c) => c.id === gp.piece.id);
            const a = pieceAnchor(gp.piece), h = gp.b.maxY - gp.b.minY;
            const cx = (gp.b.minX + gp.b.maxX) / 2, cy = (gp.b.minY + gp.b.maxY) / 2;
            const gl = h * 0.32, ga = (gp.piece.grain * Math.PI) / 180;
            const fs = Math.max(10, Math.min(26, (gp.b.maxX - gp.b.minX) / 9));
            return (
              <g key={gp.piece.id} transform={`translate(${gp.ox} ${gp.oy})`}>
                {gradeSets.map((gs) => {
                  const q = gs.pieces.find((x) => x.id === gp.piece.id); if (!q) return null;
                  const qa = pieceAnchor(q);
                  return <path key={gs.label} d={pathD(q)} transform={`translate(${a.x - qa.x} ${a.y - qa.y})`} fill="none" stroke={`hsl(${gs.hue} 70% 62%)`} strokeOpacity={0.75} strokeWidth={strokeW * 0.8} />;
                })}
                {ui.showSA && <path d={polyD(gp.sa)} fill={selected ? 'rgba(216,195,160,0.06)' : 'rgba(255,255,255,0.02)'} stroke="#5d5a62" strokeWidth={strokeW * 0.8} strokeDasharray={`${6 / view.s} ${4 / view.s}`} />}
                <path d={gp.d} fill={selected ? 'rgba(216,195,160,0.16)' : 'rgba(216,195,160,0.07)'} stroke={selected ? '#d8c3a0' : isOverride ? '#e0b45c' : '#ece9e4'} strokeWidth={strokeW * (selected ? 1.6 : 1.1)} />
                {gp.piece.internal.map((l) => (
                  <polyline key={l.id} points={(l.closed ? [...l.pts, l.pts[0]] : l.pts).map((q) => `${q.x},${q.y}`).join(' ')} fill="none"
                    stroke={l.kind === 'stitch' ? '#8b8790' : l.kind === 'pleat' ? '#e0b45c' : '#6aa0d8'} strokeWidth={strokeW * 0.8} strokeDasharray={l.kind === 'guide' ? `${10 / view.s} ${5 / view.s}` : `${4 / view.s} ${3 / view.s}`} />
                ))}
                {notchMarks(gp.piece).map((n, i) => <line key={i} x1={n.a.x} y1={n.a.y} x2={n.b.x} y2={n.b.y} stroke="#ece9e4" strokeWidth={strokeW * 1.2} />)}
                <line x1={cx - Math.sin(ga) * gl} y1={cy - Math.cos(ga) * gl} x2={cx + Math.sin(ga) * gl} y2={cy + Math.cos(ga) * gl} stroke="#8b8790" strokeWidth={strokeW} markerStart="url(#arr)" markerEnd="url(#arr)" />
                <text x={cx + 8} y={cy - gl * 0.35} fill="#ece9e4" fontSize={fs} fontFamily="Inter" fontWeight={600} style={{ pointerEvents: 'none' }}>{gp.piece.name}</text>
                <text x={cx + 8} y={cy - gl * 0.35 + fs * 1.25} fill="#8b8790" fontSize={fs * 0.72} fontFamily="Inter" style={{ pointerEvents: 'none' }}>
                  {gp.piece.cut.count === 2 ? '2× gegengleich' : '1×'}{gp.piece.cut.fold ? ' · im Bruch' : ''} · {sizeName(g.size)}
                </text>
                {selected && (ui.tool === 'direct' || ui.tool === 'delPoint' || ui.tool === 'curve' || ui.tool === 'select') && gp.piece.nodes.map((n) => {
                  const on = sel.nodeIds.includes(n.id);
                  return (
                    <g key={n.id}>
                      {on && n.hin && <><line x1={n.x} y1={n.y} x2={n.hin.x} y2={n.hin.y} stroke="#d8c3a0" strokeWidth={strokeW * 0.7} /><rect x={n.hin.x - 3.5 / view.s} y={n.hin.y - 3.5 / view.s} width={7 / view.s} height={7 / view.s} fill="#111" stroke="#d8c3a0" strokeWidth={strokeW * 0.8} /></>}
                      {on && n.hout && <><line x1={n.x} y1={n.y} x2={n.hout.x} y2={n.hout.y} stroke="#d8c3a0" strokeWidth={strokeW * 0.7} /><rect x={n.hout.x - 3.5 / view.s} y={n.hout.y - 3.5 / view.s} width={7 / view.s} height={7 / view.s} fill="#111" stroke="#d8c3a0" strokeWidth={strokeW * 0.8} /></>}
                      <circle cx={n.x} cy={n.y} r={(on ? 5.5 : 4) / view.s} fill={on ? '#d8c3a0' : '#111113'} stroke="#d8c3a0" strokeWidth={strokeW} />
                    </g>
                  );
                })}
              </g>
            );
          })}
          {seamEdges.map((s) => <path key={s.key} d={s.d} fill="none" stroke={`hsl(${s.hue} 75% 60%)`} strokeWidth={4 / view.s} strokeOpacity={0.85} strokeLinecap="round" />)}
          {hover && (() => {
            const gp = geoById.get(hover.pieceId); if (!gp) return null;
            const pc = gp.piece, from = pc.nodes[hover.seg].id, to = pc.nodes[(hover.seg + 1) % pc.nodes.length].id;
            const pts = edgePolyline(pc.nodes, from, to);
            let L = 0; for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
            return <g>
              <polyline points={pts.map((q) => `${q.x + gp.ox},${q.y + gp.oy}`).join(' ')} fill="none" stroke="#d8c3a0" strokeWidth={4 / view.s} strokeLinecap="round" />
              <text x={hover.pt.x + 10 / view.s} y={hover.pt.y - 10 / view.s} fontSize={13 / view.s} fill="#d8c3a0" fontFamily="Inter">{fmtCm(L)}</text>
            </g>;
          })()}
          {sewFirst && (() => {
            const gp = geoById.get(sewFirst.pieceId); if (!gp) return null;
            const pts = edgePolyline(gp.piece.nodes, sewFirst.from, sewFirst.to);
            return <polyline points={pts.map((q) => `${q.x + gp.ox},${q.y + gp.oy}`).join(' ')} fill="none" stroke="#8fbf8a" strokeWidth={5 / view.s} strokeLinecap="round" />;
          })()}
          {pen.length > 0 && <polyline points={pen.map((q) => `${q.x},${q.y}`).join(' ')} fill="rgba(216,195,160,.08)" stroke="#d8c3a0" strokeWidth={strokeW * 1.5} />}
          {pen.map((q, i) => <circle key={i} cx={q.x} cy={q.y} r={4 / view.s} fill="#d8c3a0" />)}
          {measure && (
            <g>
              <line x1={measure.a.x} y1={measure.a.y} x2={measure.b.x} y2={measure.b.y} stroke="#8fbf8a" strokeWidth={strokeW * 1.4} strokeDasharray={`${5 / view.s} ${3 / view.s}`} />
              <text x={(measure.a.x + measure.b.x) / 2 + 8 / view.s} y={(measure.a.y + measure.b.y) / 2 - 8 / view.s} fontSize={14 / view.s} fill="#8fbf8a" fontFamily="Inter" fontWeight={600}>{fmtCm(Math.hypot(measure.b.x - measure.a.x, measure.b.y - measure.a.y))}</text>
            </g>
          )}
        </g>
      </svg>
      <div className="floating row" style={{ left: 12, bottom: 12, padding: 4, gap: 2 }}>
        <button className="btn ghost small" onClick={() => setView({ ...view, s: Math.max(0.05, view.s / 1.25) })}>−</button>
        <button className="btn ghost small" onClick={fit}>{`${Math.round((view.s / 3.7795) * 100)} %`}</button>
        <button className="btn ghost small" onClick={() => setView({ ...view, s: Math.min(8, view.s * 1.25) })}>+</button>
      </div>
      {res.warnings.length > 0 && <div className="floating small warn" style={{ right: 12, bottom: 12, padding: '6px 10px', maxWidth: 360 }}>{res.warnings[0]}{res.warnings.length > 1 ? ` (+${res.warnings.length - 1})` : ''}</div>}
      {penDone && <NewPieceDialog pts={penDone} onClose={() => setPenDone(null)} onCreate={(name, zone, count) => {
        const minX = Math.min(...penDone.map((q) => q.x)), minY = Math.min(...penDone.map((q) => q.y));
        const pc: PatternPiece = { ...makeCustomPiece(penDone.map((q) => ({ x: q.x - minX, y: q.y - minY })), name, zone), cut: { count } };
        addCustomPiece(g.id, pc);
        setLayout(g.id, pc.id, minX, minY, uid('d'));
        appStore.getState().setUi({ selection: { pieceId: pc.id, nodeIds: [] }, tool: 'direct' });
        setPenDone(null);
      }} />}
    </div>
  );
}

function NewPieceDialog({ pts, onClose, onCreate }: { pts: Vec2[]; onClose: () => void; onCreate: (name: string, zone: Zone, count: 1 | 2) => void }) {
  const [name, setName] = useState('Eigenes Teil');
  const [zone, setZone] = useState<Zone>('torsoFront');
  const [count, setCount] = useState<1 | 2>(1);
  void pts;
  return (
    <Dialog title="Neues Schnittteil" narrow onClose={onClose} foot={<><button className="btn" onClick={onClose}>Abbrechen</button><button className="btn primary" onClick={() => onCreate(name, zone, count)}>Anlegen</button></>}>
      <div className="panel-body" style={{ padding: 0 }}>
        <label className="lbl">Name</label>
        <input type="text" value={name} autoFocus onChange={(e) => setName(e.target.value)} />
        <label className="lbl">Lage am Körper (für die 3D-Anprobe)</label>
        <select value={zone} onChange={(e) => setZone(e.target.value as Zone)}>{ZONES.map((z) => <option key={z.value} value={z.value}>{z.label}</option>)}</select>
        <label className="lbl">Zuschnitt</label>
        <Seg value={count} onChange={setCount} options={[{ value: 1, label: '1×' }, { value: 2, label: '2× gegengleich' }]} />
        <p className="muted small">Damit das Teil in 3D genäht wird, verbinde seine Kanten danach mit dem Nähwerkzeug (S) mit anderen Teilen.</p>
      </div>
    </Dialog>
  );
}
