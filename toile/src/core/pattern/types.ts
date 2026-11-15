import type { Vec2 } from '../geometry/vec';
import type { PathNode } from '../geometry/path';
import type { Measurements } from '../sizing/measurements';

export type Zone = 'torsoFront' | 'torsoBack' | 'arm' | 'legFront' | 'legBack' | 'head' | 'neck' | 'waist' | 'hem' | 'scarf' | 'none';
export interface Placement { zone: Zone; angle?: number; wrap?: number; drop?: number; radiusAdd?: number; mode?: 'cyl' | 'sphere' }
export interface InternalLine { id: string; kind: 'stitch' | 'yoke' | 'pocket' | 'pleat' | 'guide' | 'fold'; pts: Vec2[]; closed?: boolean }
export interface Notch { id: string; at: string; offset: number; double?: boolean }
export interface PatternPiece {
  id: string; name: string; nodes: PathNode[];
  grain: number; internal: InternalLine[]; notches: Notch[];
  sa: number; saEdges?: Record<string, number>;
  cut: { count: 1 | 2; fold?: boolean };
  placement: Placement;
  role?: 'main' | 'rib' | 'contrast' | 'trim';
}
export type Side = 'C' | 'L' | 'R';
export interface EdgeRef { piece: string; side?: 'L' | 'R'; from: string; to: string }
export interface Seam { id: string; a: EdgeRef; b: EdgeRef; flip?: boolean; ease?: number; kind?: 'join' | 'rib' | 'gather' }
export interface Pom { id: string; label: string; value: number }
export interface TemplateOutput { pieces: PatternPiece[]; seams: Seam[]; pom: Pom[] }
export interface ParamDef { key: string; label: string; min: number; max: number; step: number; unit: 'mm' | 'deg' | '%' | 'n'; group: string; default: number }
export interface Silhouette { id: string; name: string; description: string; params: Record<string, number> }
export type Family = 'top' | 'bottom' | 'accessory';
export interface GarmentTemplate {
  id: string; category: string; family: Family; name: string; kind: 'cloth' | 'belt' | 'sneaker';
  silhouettes: Silhouette[]; params: ParamDef[]; defaultMaterial: string; ribMaterial?: string;
  gradeKeys: { x: keyof Measurements; y: keyof Measurements };
  build(m: Measurements, p: Record<string, number>): TemplateOutput;
}
