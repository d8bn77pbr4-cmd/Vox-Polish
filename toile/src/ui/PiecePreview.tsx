import { useMemo } from 'react';
import type { GarmentTemplate } from '../core/pattern/types';
import { defaultParams } from '../core/templates/registry';
import { defaultAvatar } from '../core/sizing/charts';
import { piecePolygon } from '../core/pattern/piece';
import { bbox } from '../core/geometry/path';

/** Miniature of a template's pattern pieces. */
export function PiecePreview({ t, silId, profile = 'women' }: { t: GarmentTemplate; silId: string; profile?: 'women' | 'men' }) {
  const svg = useMemo(() => {
    const sil = t.silhouettes.find((s) => s.id === silId) ?? t.silhouettes[0];
    const out = t.build(defaultAvatar(profile), { ...defaultParams(t), ...sil.params });
    const pieces = out.pieces.filter((p) => p.role !== 'rib' && p.id !== 'laces').slice(0, 6);
    let x = 0; const parts: string[] = []; let H = 0;
    for (const p of pieces) {
      const poly = piecePolygon(p, 1.5), b = bbox(poly);
      parts.push(`<polygon points="${poly.map((q) => `${(q.x - b.minX + x).toFixed(1)},${(q.y - b.minY).toFixed(1)}`).join(' ')}" />`);
      x += b.maxX - b.minX + 40; H = Math.max(H, b.maxY - b.minY);
    }
    return { vb: `-30 -30 ${x + 20} ${H + 60}`, body: parts.join('') };
  }, [t, silId, profile]);
  return <svg viewBox={svg.vb} preserveAspectRatio="xMidYMid meet" style={{ fill: 'rgba(216,195,160,.14)', stroke: '#d8c3a0', strokeWidth: 6, strokeLinejoin: 'round' }} dangerouslySetInnerHTML={{ __html: svg.body }} />;
}
