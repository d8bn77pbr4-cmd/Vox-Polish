import { createStore } from 'zustand/vanilla';
import { useStore } from 'zustand';
export const cursorStore = createStore<{ x: number | null; y: number | null; zoom: number; hint: string }>(() => ({ x: null, y: null, zoom: 1, hint: '' }));
export const useCursor = <T,>(sel: (s: { x: number | null; y: number | null; zoom: number; hint: string }) => T) => useStore(cursorStore, sel);
