import { describe, it, expect } from 'vitest';
import { appStore } from '../src/state/store';
import { newProject } from '../src/core/model';
import { MATERIAL_PRESETS } from '../src/core/textile/materials';
import { addGarment, duplicateGarment, editPiece } from '../src/state/actions';
import { addMaterial, addLayer, duplicateLayer } from '../src/state/designActions';
import { moveNodes } from '../src/core/pattern/edit';

describe('store actions on immer drafts', () => {
  it('duplicate garment, new material, duplicate layer and edits do not throw', () => {
    appStore.getState().openProject(newProject('A', 'women', MATERIAL_PRESETS));
    addGarment('tshirt', 'classic');
    const gid = appStore.getState().ui.garmentId!;
    expect(() => duplicateGarment(gid)).not.toThrow();
    expect(appStore.getState().project!.garments).toHaveLength(2);
    expect(() => addMaterial({ name: 'X' })).not.toThrow();
    const lid = addLayer(gid, 'front:C', 'fill');
    expect(() => duplicateLayer(gid, 'front:C', lid)).not.toThrow();
    editPiece(gid, 'front', (p) => moveNodes(p, ['UA_L'], 5, 0));
    appStore.getState().update('size', (d) => { d.garments[0].size = { system: 'womenEU', label: '44' }; });
    expect(() => editPiece(gid, 'front', (p) => moveNodes(p, ['UA_L'], 5, 0))).not.toThrow();
  });
});
