import type { TrimType, Finish } from '../model';

export const BASE_COLORS: { name: string; hex: string }[] = [
  { name: 'Optisch Weiß', hex: '#f7f6f2' }, { name: 'Ecru', hex: '#efe6d2' }, { name: 'Kreide', hex: '#e6e0d4' }, { name: 'Sand', hex: '#d7c4a3' },
  { name: 'Kamel', hex: '#b88a55' }, { name: 'Tabak', hex: '#7b5232' }, { name: 'Schokolade', hex: '#4a3022' }, { name: 'Bordeaux', hex: '#5e1a24' },
  { name: 'Rost', hex: '#a2462b' }, { name: 'Senf', hex: '#c99a2e' }, { name: 'Salbei', hex: '#9aa58c' }, { name: 'Flaschengrün', hex: '#1f3d2d' },
  { name: 'Petrol', hex: '#1d4e5a' }, { name: 'Marine', hex: '#1c2541' }, { name: 'Kobalt', hex: '#2b4fa8' }, { name: 'Puder', hex: '#e7c8c0' },
  { name: 'Taupe', hex: '#8b7d70' }, { name: 'Grau meliert', hex: '#9b9a97' }, { name: 'Anthrazit', hex: '#36363a' }, { name: 'Schwarz', hex: '#121214' },
];
export const SEASON_PALETTES: { name: string; colors: string[] }[] = [
  { name: 'Riviera (Frühjahr/Sommer)', colors: ['#f7f6f2', '#d9c9a8', '#7fa7b5', '#1d4e5a', '#e2a46b', '#b0262f'] },
  { name: 'Atelier (Herbst/Winter)', colors: ['#2a1f1a', '#5e1a24', '#7b5232', '#b88a55', '#36363a', '#e6e0d4'] },
  { name: 'Resort', colors: ['#efe6d2', '#c8b28e', '#9aa58c', '#2b4fa8', '#e7c8c0', '#121214'] },
  { name: 'Monochrom', colors: ['#121214', '#36363a', '#6d6a66', '#9b9a97', '#e6e0d4', '#f7f6f2'] },
];
export const LAYER_PRESETS: { id: string; name: string; kind: 'image' | 'band'; x: number; y: number; w: number; vertical?: boolean }[] = [
  { id: 'chest', name: 'Brustdruck mittig', kind: 'image', x: 0, y: 0.26, w: 0.32 },
  { id: 'chestLeft', name: 'Logo Brust links', kind: 'image', x: 0.2, y: 0.22, w: 0.12 },
  { id: 'back', name: 'Rückendruck groß', kind: 'image', x: 0, y: 0.3, w: 0.62 },
  { id: 'sleeveStripe', name: 'Ärmelstreifen', kind: 'band', x: 0, y: 0, w: 0.12, vertical: true },
  { id: 'hemBorder', name: 'Saumbordüre', kind: 'band', x: 0, y: 0.9, w: 1 },
];
export const ligneToMm = (l: number) => l * 0.635;
export const FINISH_NAMES: Record<Finish, string> = { gold: 'Metall gold', silver: 'Metall silber', gunmetal: 'Gunmetal', horn: 'Horn', pearl: 'Perlmutt', plastic: 'Kunststoff', wood: 'Holz', fabric: 'Stoff' };
export const TRIM_CATALOG: { type: TrimType; name: string; unit: 'L' | 'mm'; sizes: number[]; finishes: Finish[]; color: string }[] = [
  { type: 'button4', name: 'Knopf 4-Loch', unit: 'L', sizes: [14, 18, 20, 24, 28, 32, 36, 40], finishes: ['horn', 'pearl', 'plastic', 'wood', 'gold', 'silver', 'gunmetal'], color: '#3a2c22' },
  { type: 'button2', name: 'Knopf 2-Loch', unit: 'L', sizes: [14, 18, 20, 24, 28, 32], finishes: ['horn', 'pearl', 'plastic', 'wood'], color: '#efe6d2' },
  { type: 'shank', name: 'Ösenknopf', unit: 'L', sizes: [18, 24, 28, 32, 36], finishes: ['gold', 'silver', 'gunmetal', 'horn', 'fabric'], color: '#c9a45a' },
  { type: 'snap', name: 'Druckknopf', unit: 'mm', sizes: [10, 12, 15, 17], finishes: ['silver', 'gold', 'gunmetal', 'plastic'], color: '#bfbfbf' },
  { type: 'rivet', name: 'Niete', unit: 'mm', sizes: [6, 8, 9, 10], finishes: ['gold', 'silver', 'gunmetal'], color: '#b0743c' },
  { type: 'eyelet', name: 'Öse', unit: 'mm', sizes: [5, 8, 10, 12, 14], finishes: ['silver', 'gold', 'gunmetal'], color: '#bfbfbf' },
  { type: 'zipper', name: 'Reißverschluss', unit: 'mm', sizes: [5, 8, 10], finishes: ['silver', 'gold', 'gunmetal', 'plastic'], color: '#121214' },
  { type: 'drawcord', name: 'Kordel mit Endstück', unit: 'mm', sizes: [5, 8, 10], finishes: ['fabric'], color: '#f4f1ea' },
  { type: 'label', name: 'Webetikett', unit: 'mm', sizes: [40, 60, 80], finishes: ['fabric'], color: '#121214' },
  { type: 'patch', name: 'Patch / Aufnäher', unit: 'mm', sizes: [50, 70, 90, 120], finishes: ['fabric'], color: '#d8c3a0' },
];
