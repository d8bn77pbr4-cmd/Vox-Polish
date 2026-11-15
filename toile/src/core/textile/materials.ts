import type { Material, Weave } from '../model';

const M = (id: string, name: string, color: string, weave: Weave, roughness: number, sheen: number, gsm: number, warp: number, weft: number, bias: number, bend: number, composition: string, repeat = 80): Material =>
  ({ id, name, color, weave, roughness, sheen, gsm, stretch: { warp, weft, bias }, bend, composition, repeat, textureAssetId: null });

export const MATERIAL_PRESETS: Material[] = [
  M('jersey180', 'Single Jersey 180 g/m²', '#f4f1ea', 'jersey', 0.85, 0.1, 180, 0.35, 0.7, 0.55, 0.15, '100 % Baumwolle'),
  M('frenchterry320', 'French Terry 320 g/m²', '#9b9a97', 'knit', 0.9, 0.15, 320, 0.25, 0.5, 0.4, 0.35, '100 % Baumwolle, innen Schlingen'),
  M('rib', 'Rippstrick 1×1', '#8f8e8b', 'rib', 0.9, 0.1, 260, 0.3, 0.9, 0.6, 0.25, '95 % Baumwolle, 5 % Elasthan'),
  M('denim14', 'Denim 14 oz', '#2c3e5c', 'twill', 0.8, 0.05, 475, 0.03, 0.08, 0.3, 0.7, '100 % Baumwolle, Köper 3/1'),
  M('flannel', 'Wollflanell', '#6d6a66', 'plain', 0.9, 0.2, 300, 0.06, 0.08, 0.35, 0.4, '100 % Schurwolle'),
  M('gabardine', 'Gabardine', '#b49a72', 'twill', 0.7, 0.1, 260, 0.04, 0.05, 0.3, 0.5, '100 % Wolle'),
  M('linen', 'Leinen', '#e3d9c6', 'plain', 0.85, 0.05, 190, 0.03, 0.04, 0.3, 0.45, '100 % Leinen'),
  M('satin', 'Seidensatin', '#e8dcc8', 'satin', 0.3, 0.6, 110, 0.04, 0.05, 0.45, 0.12, '100 % Seide'),
  M('crepe', 'Crêpe', '#1b1b1d', 'plain', 0.75, 0.15, 160, 0.05, 0.08, 0.45, 0.2, '100 % Viskose'),
  M('velvet', 'Samt', '#5e1a24', 'velvet', 0.95, 0.9, 330, 0.05, 0.08, 0.35, 0.35, '82 % Baumwolle, 18 % Seide'),
  M('nappa', 'Nappaleder', '#2a1f1a', 'leather', 0.55, 0.2, 900, 0.02, 0.02, 0.05, 0.75, 'Lammnappa, chromfrei gegerbt'),
  M('canvas', 'Canvas', '#efe6d2', 'canvas', 0.9, 0.05, 340, 0.02, 0.03, 0.2, 0.65, '100 % Baumwolle'),
  M('boucle', 'Bouclé', '#e9e1d3', 'boucle', 0.95, 0.1, 420, 0.05, 0.08, 0.3, 0.5, '70 % Wolle, 20 % Polyamid, 10 % Mohair'),
  M('rubber', 'Gummi', '#f4f1ea', 'rubber', 0.7, 0, 1200, 0, 0, 0, 1, 'Naturkautschuk'),
];
