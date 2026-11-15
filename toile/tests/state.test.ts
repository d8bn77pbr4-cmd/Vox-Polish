import { describe, it, expect } from 'vitest';
import { createAppStore } from '../src/state/store';
import { memoryStore } from '../src/state/persistence';
import { exportProjectFile, importProjectFile } from '../src/state/projectFile';
import { newProject, newGarment } from '../src/core/model';

describe('history via store', () => {
  it('undo restores and redo re-applies', () => {
    const s = createAppStore();
    s.getState().openProject(newProject('A', 'women', []));
    const before = JSON.stringify(s.getState().project!.garments);
    s.getState().update('add', (d) => { d.garments.push(newGarment('tshirt', 'classic', d)); });
    expect(s.getState().project!.garments).toHaveLength(1);
    s.getState().undo();
    expect(JSON.stringify(s.getState().project!.garments)).toBe(before);
    s.getState().redo();
    expect(s.getState().project!.garments).toHaveLength(1);
  });
  it('coalesces updates with the same key inside 600 ms', () => {
    const s = createAppStore();
    s.getState().openProject(newProject('A', 'women', []));
    s.getState().update('n1', (d) => { d.name = 'B'; }, 'name');
    s.getState().update('n2', (d) => { d.name = 'C'; }, 'name');
    s.getState().undo();
    expect(s.getState().project!.name).toBe('A');
    expect(s.getState().canUndo()).toBe(false);
  });
  it('keeps at most 150 steps', () => {
    const s = createAppStore();
    s.getState().openProject(newProject('A', 'women', []));
    for (let i = 0; i < 160; i++) s.getState().update('p', (d) => { d.palette.push('#000000'); });
    let n = 0; while (s.getState().canUndo()) { s.getState().undo(); n++; }
    expect(n).toBe(150);
    expect(s.getState().project!.palette.length).toBe(5 + 10);
  });
});

describe('persistence', () => {
  it('memory store round-trips projects and assets', async () => {
    const ps = memoryStore();
    const p = newProject('A', 'men', []);
    await ps.save(p);
    expect((await ps.load(p.id))!.name).toBe('A');
    expect((await ps.list()).map((m) => m.id)).toEqual([p.id]);
    await ps.putAsset('a1', new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' }));
    expect(new Uint8Array(await (await ps.getAsset('a1'))!.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
    await ps.remove(p.id);
    expect(await ps.load(p.id)).toBeNull();
  });
  it('project file export → import round-trip', async () => {
    const ps = memoryStore();
    const p = newProject('Look', 'women', []);
    const g = newGarment('tshirt', 'classic', p);
    g.surfaces['front:C'].layers.push({ id: 'l1', name: 'Druck', kind: 'image', assetId: 'img1', x: 0, y: 100, w: 200, rot: 0, adjust: { hue: 0, sat: 0, bright: 0, contrast: 0 }, visible: true, locked: false, opacity: 1, blend: 'normal' });
    p.garments.push(g);
    await ps.putAsset('img1', new Blob([new Uint8Array([9, 8, 7, 6])], { type: 'image/png' }));
    const blob = await exportProjectFile(p, ps);
    const ps2 = memoryStore();
    const q = await importProjectFile(blob, ps2);
    expect(q.id).not.toBe(p.id);
    expect({ ...q, id: p.id, updatedAt: p.updatedAt }).toEqual({ ...p });
    expect(new Uint8Array(await (await ps2.getAsset('img1'))!.arrayBuffer())).toEqual(new Uint8Array([9, 8, 7, 6]));
  });
});
