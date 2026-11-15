import { describe, it, expect } from 'vitest';
import { MATERIAL_PRESETS } from '../src/core/textile/materials';
import { repeatOffset, PATTERN_PRESETS } from '../src/core/textile/patterns';
import { BASE_COLORS, SEASON_PALETTES, TRIM_CATALOG, ligneToMm, LAYER_PRESETS } from '../src/core/textile/catalog';
import { getTemplate, TEMPLATES } from '../src/core/templates/registry';

describe('textile', () => {
  it('lignes convert to mm', () => { expect(ligneToMm(24)).toBeCloseTo(15.24, 6); });
  it('20 base colours with valid hex', () => {
    expect(BASE_COLORS).toHaveLength(20);
    for (const c of BASE_COLORS) expect(c.hex).toMatch(/^#[0-9a-f]{6}$/i);
    for (const p of SEASON_PALETTES) for (const c of p.colors) expect(c).toMatch(/^#[0-9a-f]{6}$/i);
  });
  it('repeat offsets', () => {
    expect(repeatOffset('half-drop', 1, 0, 40, 60)).toEqual({ x: 40, y: 30 });
    expect(repeatOffset('brick', 0, 1, 40, 60)).toEqual({ x: 20, y: 60 });
    expect(repeatOffset('full', 2, 3, 40, 60)).toEqual({ x: 80, y: 180 });
  });
  it('material presets are sane and cover every template default', () => {
    const ids = MATERIAL_PRESETS.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const m of MATERIAL_PRESETS) {
      expect(m.gsm).toBeGreaterThan(0);
      for (const v of [m.stretch.warp, m.stretch.weft, m.stretch.bias, m.bend]) { expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThanOrEqual(1); }
    }
    for (const t of TEMPLATES) {
      expect(ids).toContain(t.defaultMaterial);
      if (t.ribMaterial) expect(ids).toContain(t.ribMaterial);
      for (const v of Object.values(t.pieceMaterials ?? {})) expect(ids).toContain(v);
    }
    expect(getTemplate('jacket').defaultMaterial).toBe('boucle');
  });
  it('catalogue entries', () => {
    expect(PATTERN_PRESETS.length).toBeGreaterThanOrEqual(10);
    expect(LAYER_PRESETS.map((l) => l.name)).toEqual(expect.arrayContaining(['Brustdruck mittig', 'Rückendruck groß', 'Ärmelstreifen', 'Saumbordüre']));
    expect(TRIM_CATALOG.map((t) => t.type).sort()).toEqual(['button2', 'button4', 'drawcord', 'eyelet', 'label', 'patch', 'rivet', 'shank', 'snap', 'zipper']);
  });
});
