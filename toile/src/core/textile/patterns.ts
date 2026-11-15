import type { Vec2 } from '../geometry/vec';
import type { PatternSpec } from '../model';

export const PATTERN_NAMES: Record<PatternSpec['type'], string> = {
  stripes: 'Streifen', pinstripe: 'Nadelstreifen', gingham: 'Vichy-Karo', glencheck: 'Glencheck', houndstooth: 'Pepita',
  dots: 'Tupfen', herringbone: 'Fischgrat', camo: 'Camouflage', motif: 'Eigenes Motiv',
};
export const REPEAT_NAMES = { full: 'Voll', 'half-drop': 'Halb versetzt', brick: 'Ziegel', mirror: 'Gespiegelt' } as const;

export function repeatOffset(repeat: NonNullable<PatternSpec['repeat']>, col: number, row: number, w: number, h: number): Vec2 {
  if (repeat === 'half-drop') return { x: col * w, y: row * h + (col % 2 ? h / 2 : 0) };
  if (repeat === 'brick') return { x: col * w + (row % 2 ? w / 2 : 0), y: row * h };
  return { x: col * w, y: row * h };
}

const P = (name: string, type: PatternSpec['type'], colors: string[], scale: number, angle = 0) => ({ name, spec: { type, colors, scale, angle } as PatternSpec });
export const PATTERN_PRESETS = [
  P('Breton marine', 'stripes', ['#f4f1ea', '#1c2541'], 22), P('Streifen bordeaux', 'stripes', ['#efe6d2', '#5e1a24'], 14),
  P('Nadelstreifen anthrazit', 'pinstripe', ['#36363a', '#d9d6cf'], 12), P('Nadelstreifen marine', 'pinstripe', ['#1c2541', '#e6e0d4'], 15),
  P('Vichy rot', 'gingham', ['#ffffff', '#b0262f'], 12), P('Vichy schwarz', 'gingham', ['#ffffff', '#121214'], 8),
  P('Glencheck grau', 'glencheck', ['#d8d4cc', '#4a4a4e', '#8a3b3b'], 70), P('Glencheck braun', 'glencheck', ['#e3d6bf', '#5a4330', '#2b4fa8'], 70),
  P('Pepita schwarz-weiß', 'houndstooth', ['#f4f1ea', '#121214'], 16), P('Pepita kamel', 'houndstooth', ['#efe6d2', '#7b5232'], 24),
  P('Tupfen marine', 'dots', ['#1c2541', '#f4f1ea'], 18), P('Tupfen klein', 'dots', ['#121214', '#efe6d2'], 8),
  P('Fischgrat grau', 'herringbone', ['#6d6a66', '#9b9a97'], 14), P('Fischgrat tabak', 'herringbone', ['#4a3022', '#8b6a4a'], 16),
  P('Camouflage oliv', 'camo', ['#6b6a45', '#8a835a', '#3c3a26', '#a39a6e'], 140), P('Camouflage Winter', 'camo', ['#e6e0d4', '#9b9a97', '#36363a', '#c7c3bb'], 140),
];

/** PRNG for deterministic generated patterns */
export function rng(seed: number) { let s = seed >>> 0 || 1; return () => ((s = Math.imul(s ^ (s >>> 15), 2246822507) ^ Math.imul(s ^ (s >>> 13), 3266489909)), ((s ^= s >>> 16) >>> 0) / 4294967296); }

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
/** Draws exactly one seamless repeat tile at (0,0) and returns its size in px. */
export function drawPatternTile(ctx: Ctx, spec: PatternSpec, pxPerMm: number, motif?: CanvasImageSource & { width: number; height: number }): { w: number; h: number } {
  const S = Math.max(4, spec.scale * pxPerMm);
  const [c0 = '#ffffff', c1 = '#000000', c2 = c1, c3 = c0] = spec.colors;
  const rect = (x: number, y: number, w: number, h: number, c: string) => { ctx.fillStyle = c; ctx.fillRect(x, y, w, h); };
  switch (spec.type) {
    case 'stripes': rect(0, 0, S, S, c0); rect(0, S / 2, S, S / 2, c1); return { w: S, h: S };
    case 'pinstripe': { rect(0, 0, S, S, c0); const lw = Math.max(1, 0.6 * pxPerMm); rect(S / 2 - lw / 2, 0, lw, S, c1); return { w: S, h: S }; }
    case 'gingham': {
      rect(0, 0, S, S, c0); ctx.globalAlpha = 0.5; rect(0, 0, S / 2, S, c1); rect(0, 0, S, S / 2, c1); ctx.globalAlpha = 1; return { w: S, h: S };
    }
    case 'houndstooth': {
      const u = S / 8; rect(0, 0, S, S, c0); ctx.fillStyle = c1;
      for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
        let on = false;
        if (r < 4 && c < 4) on = true;
        else if (r < 4 && c >= 4) on = (c - 4 - r + 8) % 4 === 3 || (c - 4 - r + 8) % 4 === 0 && c === 4 + r;
        else if (r >= 4 && c < 4) on = (r - 4 - c + 8) % 4 === 3 || ((r - 4 - c + 8) % 4 === 0 && r === 4 + c);
        if (on) ctx.fillRect(c * u, r * u, u + 0.5, u + 0.5);
      }
      return { w: S, h: S };
    }
    case 'dots': {
      rect(0, 0, S, S, c0); ctx.fillStyle = c1; const r = S * 0.17;
      for (const [x, y] of [[S * 0.25, S * 0.25], [S * 0.75, S * 0.75]]) { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); }
      return { w: S, h: S };
    }
    case 'herringbone': {
      rect(0, 0, S, S, c0); ctx.strokeStyle = c1; ctx.lineWidth = Math.max(1, S / 10);
      const n = 5;
      for (let i = -n; i <= n * 2; i++) {
        const y = (i * S) / n;
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(S / 2, y + S / 2); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(S, y); ctx.lineTo(S / 2, y + S / 2); ctx.stroke();
      }
      return { w: S, h: S };
    }
    case 'glencheck': {
      rect(0, 0, S, S, c0); ctx.fillStyle = c1; const h = S / 2, n = 8, lw = Math.max(1, h / n / 2.2);
      for (let i = 0; i < n; i++) { ctx.fillRect(i * (h / n), 0, lw, h); ctx.fillRect(h, h + i * (h / n), h, lw); }
      const u = h / 8;
      for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) if ((r + c) % 2 === 0) { ctx.fillRect(h + c * u, r * u, u * 0.6, u * 0.6); ctx.fillRect(c * u, h + r * u, u * 0.6, u * 0.6); }
      ctx.fillStyle = c2; ctx.globalAlpha = 0.8; ctx.fillRect(S * 0.72, 0, Math.max(1, S / 90), S); ctx.fillRect(0, S * 0.72, S, Math.max(1, S / 90)); ctx.globalAlpha = 1;
      return { w: S, h: S };
    }
    case 'camo': {
      rect(0, 0, S, S, c0); const rnd = rng(7);
      for (const col of [c1, c2, c3]) {
        ctx.fillStyle = col;
        for (let i = 0; i < 9; i++) {
          const x = rnd() * S, y = rnd() * S, rx = (0.06 + rnd() * 0.12) * S, ry = (0.04 + rnd() * 0.09) * S, a = rnd() * Math.PI;
          for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) { ctx.beginPath(); ctx.ellipse(x + ox, y + oy, rx, ry, a, 0, Math.PI * 2); ctx.fill(); }
        }
      }
      return { w: S, h: S };
    }
    case 'motif': {
      if (!motif) { rect(0, 0, S, S, c0); return { w: S, h: S }; }
      const w = S, h = (S * motif.height) / motif.width, rep = spec.repeat ?? 'full';
      if (spec.colors.length && spec.colors[0] !== 'transparent') rect(0, 0, rep === 'mirror' || rep === 'half-drop' ? 2 * w : w, rep === 'mirror' || rep === 'brick' ? 2 * h : h, c0);
      if (rep === 'full') { ctx.drawImage(motif, 0, 0, w, h); return { w, h }; }
      if (rep === 'half-drop') { ctx.drawImage(motif, 0, 0, w, h); ctx.drawImage(motif, w, h / 2, w, h); ctx.drawImage(motif, w, -h / 2, w, h); return { w: 2 * w, h }; }
      if (rep === 'brick') { ctx.drawImage(motif, 0, 0, w, h); ctx.drawImage(motif, w / 2, h, w, h); ctx.drawImage(motif, -w / 2, h, w, h); return { w, h: 2 * h }; }
      ctx.drawImage(motif, 0, 0, w, h);
      ctx.save(); ctx.translate(2 * w, 0); ctx.scale(-1, 1); ctx.drawImage(motif, 0, 0, w, h); ctx.restore();
      ctx.save(); ctx.translate(0, 2 * h); ctx.scale(1, -1); ctx.drawImage(motif, 0, 0, w, h); ctx.restore();
      ctx.save(); ctx.translate(2 * w, 2 * h); ctx.scale(-1, -1); ctx.drawImage(motif, 0, 0, w, h); ctx.restore();
      return { w: 2 * w, h: 2 * h };
    }
  }
}
