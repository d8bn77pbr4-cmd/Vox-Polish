import type { GarmentTemplate } from '../pattern/types';
import { TOP_TEMPLATES } from './tops';

export const CATEGORIES: { id: string; name: string; family: 'top' | 'bottom' | 'accessory' }[] = [
  { id: 'tshirt', name: 'T-Shirt', family: 'top' }, { id: 'longsleeve', name: 'Longsleeve', family: 'top' },
  { id: 'sweatshirt', name: 'Sweatshirt', family: 'top' }, { id: 'hoodie', name: 'Hoodie', family: 'top' },
  { id: 'tank', name: 'Tanktop', family: 'top' }, { id: 'jacket', name: 'Jacke', family: 'top' },
  { id: 'dress', name: 'Kleid', family: 'top' },
  { id: 'trousers', name: 'Hose & Jeans', family: 'bottom' }, { id: 'shorts', name: 'Shorts', family: 'bottom' },
  { id: 'skirt', name: 'Rock', family: 'bottom' },
  { id: 'beanie', name: 'Mütze', family: 'accessory' }, { id: 'scarf', name: 'Schal', family: 'accessory' },
  { id: 'belt', name: 'Gürtel', family: 'accessory' }, { id: 'sneaker', name: 'Sneaker', family: 'accessory' },
];

export const TEMPLATES: GarmentTemplate[] = [...TOP_TEMPLATES];

export function getTemplate(id: string): GarmentTemplate {
  const t = TEMPLATES.find((x) => x.id === id);
  if (!t) throw new Error(`unknown template ${id}`);
  return t;
}
export function defaultParams(t: GarmentTemplate): Record<string, number> {
  return Object.fromEntries(t.params.map((p) => [p.key, p.default]));
}
