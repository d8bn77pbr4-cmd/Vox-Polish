import type { Project } from '../core/model';
import { uid } from '../core/model';
import type { ProjectStore } from './persistence';

export function assetIdsOf(p: Project): string[] {
  const ids = new Set<string>();
  for (const m of p.materials) if (m.textureAssetId) ids.add(m.textureAssetId);
  for (const g of p.garments) {
    for (const s of Object.values(g.surfaces)) for (const l of s.layers) {
      if (l.kind === 'image') ids.add(l.assetId);
      if (l.kind === 'paint' && l.assetId) ids.add(l.assetId);
      if (l.kind === 'pattern' && l.pattern.motifAssetId) ids.add(l.pattern.motifAssetId);
    }
    for (const t of g.trims) if (t.assetId) ids.add(t.assetId);
  }
  return [...ids];
}

async function toB64(b: Blob): Promise<string> {
  const u = new Uint8Array(await b.arrayBuffer());
  let s = '';
  for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000));
  return btoa(s);
}
function fromB64(s: string, type: string): Blob {
  const bin = atob(s), u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return new Blob([u], { type });
}

export async function exportProjectFile(p: Project, ps: ProjectStore): Promise<Blob> {
  const assets: Record<string, { type: string; data: string }> = {};
  for (const id of assetIdsOf(p)) {
    const b = await ps.getAsset(id);
    if (b) assets[id] = { type: b.type || 'image/png', data: await toB64(b) };
  }
  return new Blob([JSON.stringify({ format: 'toile', version: 1, project: p, assets })], { type: 'application/json' });
}

export async function importProjectFile(blob: Blob, ps: ProjectStore): Promise<Project> {
  const j = JSON.parse(await blob.text());
  if (j.format !== 'toile' || !j.project) throw new Error('Keine TOILE-Projektdatei.');
  for (const [id, a] of Object.entries(j.assets ?? {}) as [string, { type: string; data: string }][]) await ps.putAsset(id, fromB64(a.data, a.type));
  const p: Project = { ...j.project, id: uid('p_'), updatedAt: Date.now() };
  await ps.save(p);
  return p;
}
