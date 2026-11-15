import { nanoid } from 'nanoid';
import type { Vec2 } from './geometry/vec';
import type { PatternPiece, Seam } from './pattern/types';
import type { Measurements, Profile } from './sizing/measurements';
import { defaultAvatar, defaultSize, measurementsFor, type SizeSpec } from './sizing/charts';
import { getTemplate, defaultParams } from './templates/registry';

export type BlendMode = 'normal' | 'multiply' | 'screen' | 'overlay' | 'soft-light' | 'darken' | 'lighten' | 'color' | 'luminosity';
export interface Adjust { hue: number; sat: number; bright: number; contrast: number }
export interface RasterFrame { x0: number; y0: number; pxPerMm: number; w: number; h: number }
export type PatternType = 'stripes' | 'pinstripe' | 'gingham' | 'glencheck' | 'houndstooth' | 'dots' | 'herringbone' | 'camo' | 'motif';
export interface PatternSpec { type: PatternType; colors: string[]; scale: number; angle: number; motifAssetId?: string; repeat?: 'full' | 'half-drop' | 'brick' | 'mirror' }
interface LayerBase { id: string; name: string; visible: boolean; locked: boolean; opacity: number; blend: BlendMode }
export type Layer =
  | (LayerBase & { kind: 'base'; materialId: string })
  | (LayerBase & { kind: 'fill'; color: string })
  | (LayerBase & { kind: 'pattern'; pattern: PatternSpec })
  | (LayerBase & { kind: 'image'; assetId: string; x: number; y: number; w: number; rot: number; adjust: Adjust })
  | (LayerBase & { kind: 'paint'; assetId: string | null; frame: RasterFrame })
  | (LayerBase & { kind: 'text'; text: string; font: string; size: number; color: string; x: number; y: number; rot: number; tracking: number });
export type LayerKind = Layer['kind'];
export interface Surface { layers: Layer[] }
export type Weave = 'jersey' | 'twill' | 'plain' | 'rib' | 'satin' | 'leather' | 'velvet' | 'canvas' | 'knit' | 'boucle' | 'rubber';
export interface Material {
  id: string; name: string; color: string; textureAssetId?: string | null; repeat: number; weave: Weave;
  roughness: number; sheen: number; gsm: number; stretch: { warp: number; weft: number; bias: number }; bend: number; composition: string;
}
export type TrimType = 'button4' | 'button2' | 'shank' | 'snap' | 'rivet' | 'eyelet' | 'zipper' | 'drawcord' | 'label' | 'patch';
export type Finish = 'gold' | 'silver' | 'gunmetal' | 'horn' | 'pearl' | 'plastic' | 'wood' | 'fabric';
export interface Trim { id: string; type: TrimType; key: string; x: number; y: number; size: number; color: string; finish: Finish; rot: number; length?: number; text?: string; assetId?: string }
export interface Garment {
  id: string; name: string; templateId: string; silhouetteId: string; params: Record<string, number>;
  size: SizeSpec; layer: number; visible: boolean;
  overrides: Record<string, PatternPiece>; custom: PatternPiece[]; customSeams: Seam[]; baseMeasurements?: Measurements;
  surfaces: Record<string, Surface>; linkSides: boolean; layout: Record<string, Vec2>; trims: Trim[];
}
export interface Project {
  id: string; name: string; version: 1; profile: Profile; avatar: Measurements; garments: Garment[];
  materials: Material[]; palette: string[]; createdAt: number; updatedAt: number; lastExportAt?: number;
}

export const uid = (p = '') => p + nanoid(10);
export const baseLayer = (materialId: string): Layer => ({ id: uid('l_'), name: 'Grundstoff', kind: 'base', materialId, visible: true, locked: false, opacity: 1, blend: 'normal' });

let presetMaterials: () => Material[] = () => [];
export function registerMaterialPresets(f: () => Material[]) { presetMaterials = f; }

export function newProject(name: string, profile: Profile, materials?: Material[]): Project {
  const now = Date.now();
  return {
    id: uid('p_'), name, version: 1, profile, avatar: defaultAvatar(profile), garments: [],
    materials: (materials ?? presetMaterials()).map((m) => ({ ...m })),
    palette: ['#1b1b1d', '#f4f1ea', '#c8b28e', '#7a2e2a', '#24324a'], createdAt: now, updatedAt: now,
  };
}

/** Default material id for a piece of a template. */
export function defaultMaterialFor(templateId: string, piece: PatternPiece): string {
  const t = getTemplate(templateId);
  return t.pieceMaterials?.[piece.id] ?? (piece.role === 'rib' && t.ribMaterial ? t.ribMaterial : t.defaultMaterial);
}

export function newGarment(templateId: string, silhouetteId: string, project: Project): Garment {
  const t = getTemplate(templateId);
  const sil = t.silhouettes.find((s) => s.id === silhouetteId) ?? t.silhouettes[0];
  const layerByFamily = { bottom: 0, top: 1, accessory: 2 } as const;
  const g: Garment = {
    id: uid('g_'), name: `${t.name} – ${sil.name}`, templateId, silhouetteId: sil.id,
    params: { ...defaultParams(t), ...sil.params }, size: defaultSize(project.profile),
    layer: layerByFamily[t.family] + (t.category === 'jacket' ? 1 : 0), visible: true,
    overrides: {}, custom: [], customSeams: [], surfaces: {}, linkSides: true, layout: {}, trims: [],
  };
  const out = t.build(measurementsOf(g), g.params);
  for (const p of out.pieces) {
    const sides = p.cut.count === 2 ? ['L', 'R'] : ['C'];
    for (const s of sides) g.surfaces[`${p.id}:${s}`] = { layers: [baseLayer(defaultMaterialFor(templateId, p))] };
  }
  return g;
}

export const measurementsOf = (g: Pick<Garment, 'size'>) => measurementsFor(g.size);
