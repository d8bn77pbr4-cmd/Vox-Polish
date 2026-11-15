import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import * as THREE from 'three';
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { OrbitControls, ContactShadows, Environment, Lightformer } from '@react-three/drei';
import { RotateCcw, Camera, Activity, Brush, RefreshCw } from 'lucide-react';
import { useApp, appStore } from '../state/store';
import { buildBody } from '../core/sim/body';
import { getTemplate } from '../core/templates/registry';
import { SimRunner, simSignature } from '../three/simRunner';
import { Avatar } from '../three/Avatar';
import { ClothGarments, type PaintHandlers } from '../three/GarmentMeshes';
import { Belt3D, Sneakers3D } from '../three/Structured';
import { onAssets } from '../render2d/assets';
import { onRaster } from '../render2d/raster';
import { resolveGarment } from '../core/resolve';
import { surfaceFrame } from '../render2d/frame';
import { beginPaint, continuePaint, endPaint, isPainting } from '../render2d/painter';
import { addLayer } from '../state/designActions';
import { addToLibrary } from '../state/library';
import { saveHooks } from '../state/persistence';
import { Seg } from '../ui/common';
import type { OrbitControls as OrbitImpl } from 'three-stdlib';

type View = 'front' | 'back' | 'side' | 'free';
const VIEWS: Record<Exclude<View, 'free'>, [number, number, number]> = { front: [0, 1.05, 4.3], back: [0, 1.05, -4.3], side: [4.3, 1.05, 0] };
const TARGET: [number, number, number] = [0, 0.92, 0];
const sharedRunner = new SimRunner();

/** Bridge for other modules: capture renders of the 3D view. */
export const fitApi: { setCamera?: (pos: [number, number, number], target: [number, number, number]) => void; capture?: (view: Exclude<View, 'free'>, w?: number) => Promise<string>; pick?: (cx: number, cy: number) => { gid: string; key: string; uv: THREE.Vector2 } | null } = {};

function Lights({ preset }: { preset: 'studio' | 'day' | 'runway' }) {
  if (preset === 'day') return <>
    <hemisphereLight args={['#f4f6ff', '#6b6457', 1.1]} />
    <directionalLight position={[4, 7, 3]} intensity={2.4} castShadow shadow-mapSize={[2048, 2048]} shadow-bias={-0.0004} />
  </>;
  if (preset === 'runway') return <>
    <ambientLight intensity={0.12} />
    <spotLight position={[0, 5.5, 3.2]} angle={0.42} penumbra={0.6} intensity={70} castShadow shadow-mapSize={[2048, 2048]} />
    <directionalLight position={[-3, 2.5, -3]} intensity={1.6} color="#bcd0ff" />
    <directionalLight position={[3, 2.5, -3]} intensity={1.2} color="#ffd9b0" />
  </>;
  return <>
    <ambientLight intensity={0.35} />
    <hemisphereLight args={['#ffffff', '#3a3a40', 0.55]} />
    <directionalLight position={[2.5, 5, 4]} intensity={2.3} color="#fff4e6" castShadow shadow-mapSize={[2048, 2048]} shadow-bias={-0.0004} />
    <directionalLight position={[-3.5, 3, 2.5]} intensity={0.7} color="#e6eeff" />
    <directionalLight position={[-2, 3.5, -4]} intensity={1.4} color="#dfe8ff" />
  </>;
}

function Driver({ runner, onProgress }: { runner: SimRunner; onProgress: (p: number) => void }) {
  const last = useRef(-1);
  useFrame(() => {
    if (runner.advance(14)) { const p = runner.progress; if (Math.abs(p - last.current) > 0.02 || p === 1) { last.current = p; onProgress(p); } }
  });
  return null;
}

function Bridge({ controls }: { controls: React.RefObject<OrbitImpl | null> }) {
  const { gl, scene, camera, size } = useThree();
  useEffect(() => {
    fitApi.capture = async (view, w = 1200) => {
      const cam = camera as THREE.PerspectiveCamera, old = cam.position.clone(), oldT = controls.current?.target.clone();
      cam.position.set(...VIEWS[view]); controls.current?.target.set(...TARGET); cam.lookAt(...TARGET); cam.updateMatrixWorld();
      const h = Math.round((w * size.height) / size.width);
      const prev = gl.getPixelRatio(); gl.setPixelRatio((w / size.width) || 1);
      gl.render(scene, cam);
      const url = gl.domElement.toDataURL('image/png');
      gl.setPixelRatio(prev); cam.position.copy(old); if (oldT) controls.current?.target.copy(oldT); cam.updateMatrixWorld(); gl.render(scene, cam);
      void h;
      return url;
    };
    fitApi.setCamera = (pos, target) => { camera.position.set(...pos); controls.current?.target.set(...target); controls.current?.update(); };
    fitApi.pick = (cx, cy) => {
      const r = gl.domElement.getBoundingClientRect();
      const ray = new THREE.Raycaster();
      ray.setFromCamera(new THREE.Vector2(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1), camera);
      const hit = ray.intersectObjects(scene.children, true).find((h) => h.object.userData?.gid && h.uv);
      return hit ? { gid: hit.object.userData.gid, key: hit.object.userData.key, uv: hit.uv! } : null;
    };
    saveHooks.thumb = async () => {
      gl.render(scene, camera);
      const src = gl.domElement, c = document.createElement('canvas');
      c.width = 480; c.height = 360;
      const k = Math.max(c.width / src.width, c.height / src.height);
      c.getContext('2d')!.drawImage(src, (c.width - src.width * k) / 2, (c.height - src.height * k) / 2, src.width * k, src.height * k);
      return new Promise<Blob | undefined>((res) => c.toBlob((b) => res(b ?? undefined), 'image/jpeg', 0.85));
    };
    return () => { fitApi.capture = undefined; fitApi.pick = undefined; saveHooks.thumb = async () => undefined; };
  }, [gl, scene, camera, size]);
  return null;
}

export function FitView() {
  const project = useApp((s) => s.project)!;
  const ui = useApp((s) => s.ui);
  const version = useApp((s) => s.version);
  const [texTick, bumpTex] = useReducer((x: number) => x + 1, 0);
  useEffect(() => {
    let t: ReturnType<typeof setTimeout> | undefined;
    const f = () => { clearTimeout(t); t = setTimeout(bumpTex, 120); };
    const a = onAssets(f), b = onRaster(f);
    return () => { a(); b(); clearTimeout(t); };
  }, []);
  useEffect(() => { const t = setTimeout(bumpTex, 150); return () => clearTimeout(t); }, [version]);
  const body = useMemo(() => buildBody(project.avatar, project.profile), [JSON.stringify(project.avatar), project.profile]);
  const runner = sharedRunner;
  const [, rerender] = useReducer((x: number) => x + 1, 0);
  const [progress, setProgress] = useState(1);
  const [pending, setPending] = useState(false);
  const sig = simSignature(project, ui.simQuality);
  const force = useRef(runner.forceN);
  const [forceN, setForce] = useState(runner.forceN);
  useEffect(() => {
    if (sig === runner.sig && force.current === forceN) return;
    setPending(true);
    const t = setTimeout(() => {
      runner.sig = sig; force.current = forceN; runner.forceN = forceN;
      try { runner.rebuild(appStore.getState().project!, body, appStore.getState().ui.simQuality); } catch (e) { console.error(e); appStore.getState().toast('Simulation fehlgeschlagen: ' + (e as Error).message); }
      setPending(false); setProgress(runner.progress); rerender();
    }, runner.sig ? 380 : 30);
    return () => clearTimeout(t);
  }, [sig, body, forceN]);
  const controls = useRef<OrbitImpl | null>(null);
  const [view, setView] = useState<View>('front');
  const [turn, setTurn] = useState(false);
  const goView = (v: Exclude<View, 'free'>) => {
    setView(v);
    const c = controls.current; if (!c) return;
    c.object.position.set(...VIEWS[v]); c.target.set(...TARGET); c.update();
  };
  const structured = project.garments.filter((g) => g.visible && getTemplate(g.templateId).kind !== 'cloth');
  const hasShoes = structured.some((g) => getTemplate(g.templateId).kind === 'sneaker');
  const paint: PaintHandlers | null = ui.paint3d ? {
    down: (e: ThreeEvent<PointerEvent>, gid: string, key: string) => {
      if (!e.uv) return; e.stopPropagation();
      if (controls.current) controls.current.enabled = false;
      const g = appStore.getState().project!.garments.find((x) => x.id === gid)!;
      const inst = resolveGarment(g).instances.find((i) => i.key === key)!; const f = surfaceFrame(inst.piece);
      appStore.getState().setUi({ garmentId: gid, instanceKey: key });
      beginPaint(gid, key, f.x0 + (e.uv.x * f.w) / f.pxPerMm, f.y0 + ((1 - e.uv.y) * f.h) / f.pxPerMm, e.pointerType === 'mouse' ? 1 : e.nativeEvent.pressure);
    },
    move: (e, gid, key) => {
      if (!isPainting() || !e.uv) return;
      const g = appStore.getState().project!.garments.find((x) => x.id === gid)!;
      const inst = resolveGarment(g).instances.find((i) => i.key === key)!; const f = surfaceFrame(inst.piece);
      continuePaint(f.x0 + (e.uv.x * f.w) / f.pxPerMm, f.y0 + ((1 - e.uv.y) * f.h) / f.pxPerMm, e.pointerType === 'mouse' ? 1 : e.nativeEvent.pressure);
    },
    up: () => { endPaint(); if (controls.current) controls.current.enabled = true; },
  } : null;
  useEffect(() => {
    const up = () => { if (isPainting()) { endPaint(); if (controls.current) controls.current.enabled = true; } };
    window.addEventListener('pointerup', up); return () => window.removeEventListener('pointerup', up);
  }, []);
  const onDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    const hit = fitApi.pick?.(e.clientX, e.clientY);
    if (!hit) { appStore.getState().toast('Bild auf ein Kleidungsstück ziehen'); return; }
    let id = e.dataTransfer.getData('application/x-toile-asset'), name = 'Druck';
    if (!id) { const file = [...e.dataTransfer.files].find((x) => x.type.startsWith('image/')); if (!file) return; const it = await addToLibrary(file, file.name); id = it.id; name = it.name; }
    const g = appStore.getState().project!.garments.find((x) => x.id === hit.gid)!;
    const inst = resolveGarment(g).instances.find((i) => i.key === hit.key)!; const f = surfaceFrame(inst.piece);
    const x = f.x0 + (hit.uv.x * f.w) / f.pxPerMm, y = f.y0 + ((1 - hit.uv.y) * f.h) / f.pxPerMm;
    appStore.getState().setUi({ garmentId: g.id, instanceKey: hit.key });
    addLayer(g.id, hit.key, 'image', { assetId: id, name, x: hit.key.endsWith(':R') && g.linkSides ? -x : x, y });
  };
  const shot = async () => {
    const url = await fitApi.capture?.(view === 'free' ? 'front' : view, 2000);
    if (!url) return;
    const a = document.createElement('a'); a.href = url; a.download = `${project.name}-${view}.png`; a.click();
  };
  const st = appStore.getState();
  const bg = ui.light === 'runway' ? 'radial-gradient(circle at 50% 30%, #1c1c22, #050506)' : ui.light === 'day' ? 'radial-gradient(circle at 50% 30%, #f1efe9, #c9c5bc)' : 'radial-gradient(circle at 50% 35%, #2a2a2f, #0d0d0f)';
  return (
    <div style={{ position: 'absolute', inset: 0, background: bg }} onDragOver={(e) => e.preventDefault()} onDrop={onDrop}>
      <Canvas shadows dpr={[1, 2]} camera={{ position: VIEWS.front, fov: 30, near: 0.05, far: 50 }} gl={{ preserveDrawingBuffer: true, antialias: true, toneMapping: THREE.ACESFilmicToneMapping }}
        onCreated={({ gl }) => { gl.outputColorSpace = THREE.SRGBColorSpace; }}>
        <Lights preset={ui.light} />
        <Environment resolution={128} frames={1}>
          <Lightformer form="rect" intensity={2} position={[0, 4, 3]} scale={[6, 2, 1]} />
          <Lightformer form="rect" intensity={1} position={[-4, 2, -2]} scale={[2, 4, 1]} color="#dfe8ff" />
          <Lightformer form="ring" intensity={1.5} position={[3, 3, 2]} scale={2} />
        </Environment>
        <Avatar body={body} hideFeet={hasShoes} />
        <ClothGarments runner={runner} project={project} fitMap={ui.fitMap} texTick={texTick} paint={paint} />
        {structured.map((g) => getTemplate(g.templateId).kind === 'belt'
          ? <Belt3D key={g.id} project={project} g={g} body={body} texTick={texTick} />
          : <Sneakers3D key={g.id} project={project} g={g} body={body} texTick={texTick} />)}
        <ContactShadows position={[0, 0.001, 0]} opacity={ui.light === 'day' ? 0.35 : 0.55} scale={4} blur={2.4} far={2} resolution={512} />
        <mesh rotation-x={-Math.PI / 2} position-y={-0.001} receiveShadow><circleGeometry args={[1.4, 64]} /><meshStandardMaterial color={ui.light === 'day' ? '#d9d5cc' : '#18181b'} roughness={1} transparent opacity={0.6} /></mesh>
        <OrbitControls ref={controls} target={TARGET} enableDamping minDistance={0.6} maxDistance={8} autoRotate={turn} autoRotateSpeed={1.6} onStart={() => setView('free')} />
        <Driver runner={runner} onProgress={setProgress} />
        <Bridge controls={controls} />
      </Canvas>
      <div className="floating" style={{ left: 12, top: 12, padding: 8, display: 'flex', flexDirection: 'column', gap: 8, minWidth: 230 }} onPointerDown={(e) => e.stopPropagation()}>
        <div className="row small">
          {pending ? <span className="muted">Schnitt geändert – aktualisiere …</span> : progress < 1 ? <span>Simuliert … {Math.round(progress * 100)} %</span> : <span className="ok">Anprobe fertig</span>}
          <span className="spacer" />
          <button className="btn ghost icon" title="Neu simulieren" onClick={() => setForce((x) => x + 1)}><RefreshCw size={14} /></button>
        </div>
        <div style={{ height: 3, background: 'var(--line)', borderRadius: 2 }}><div style={{ height: 3, width: `${(pending ? 0 : progress) * 100}%`, background: 'var(--accent)', borderRadius: 2, transition: 'width .2s' }} /></div>
        <Seg value={ui.simQuality} onChange={(v) => st.setUi({ simQuality: v })} options={[{ value: 'draft', label: 'Entwurf' }, { value: 'standard', label: 'Standard' }, { value: 'fine', label: 'Fein' }]} />
        <Seg value={ui.light} onChange={(v) => st.setUi({ light: v })} options={[{ value: 'studio', label: 'Studio' }, { value: 'day', label: 'Tageslicht' }, { value: 'runway', label: 'Laufsteg' }]} />
        <div className="row" style={{ gap: 4, flexWrap: 'wrap' }}>
          <button className={'btn small' + (ui.fitMap ? ' on' : '')} onClick={() => st.setUi({ fitMap: !ui.fitMap })}><Activity size={12} /> Passformkarte</button>
          <button className={'btn small' + (ui.paint3d ? ' on' : '')} onClick={() => st.setUi({ paint3d: !ui.paint3d })}><Brush size={12} /> Auf 3D malen</button>
        </div>
      </div>
      <div className="floating row" style={{ left: '50%', bottom: 14, transform: 'translateX(-50%)', padding: 4, gap: 2 }} onPointerDown={(e) => e.stopPropagation()}>
        {(['front', 'back', 'side'] as const).map((v) => <button key={v} className={'btn ghost small' + (view === v ? ' on' : '')} onClick={() => goView(v)}>{v === 'front' ? 'Vorne' : v === 'back' ? 'Hinten' : 'Seite'}</button>)}
        <button className={'btn ghost small' + (turn ? ' on' : '')} onClick={() => setTurn(!turn)}><RotateCcw size={12} /> Drehteller</button>
        <button className="btn ghost small" onClick={shot}><Camera size={12} /> Foto</button>
      </div>
      {ui.fitMap && (
        <div className="floating small" style={{ right: 12, bottom: 14, padding: '8px 10px', width: 190 }}>
          <div style={{ height: 8, borderRadius: 4, background: 'linear-gradient(to right, #3388f2, #4dcc66, #f2cc26, #f24026)' }} />
          <div className="row" style={{ justifyContent: 'space-between', marginTop: 4 }}><span>locker</span><span>neutral</span><span>spannt 8 %</span></div>
        </div>
      )}
      {ui.paint3d && <div className="floating small muted" style={{ right: 12, top: 12, padding: '6px 10px' }}>Malen auf dem Modell – Pinsel & Farbe aus „Design“. Drehen: Ziehen neben dem Modell.</div>}
    </div>
  );
}
