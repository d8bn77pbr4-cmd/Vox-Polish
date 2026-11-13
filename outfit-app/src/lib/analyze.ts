import { functionErrorCode } from './api'
import { clampBox } from './crop'
import { analysisImage } from './images'
import { supabase } from './supabase'
import type { DetectedItem } from './types'

const MESSAGES: Record<string, string> = {
  no_key: 'Die Fotoanalyse ist noch nicht eingerichtet: Der Claude-Schlüssel fehlt. Du kannst Teile solange von Hand einrahmen.',
  bad_key: 'Der Claude-Schlüssel wird abgelehnt. Bitte den Besitzer der App, ihn zu prüfen.',
  limit: 'Du hast heute schon 40 Fotos analysiert. Morgen geht es weiter – oder du rahmst Teile von Hand ein.',
  refused: 'Dieses Foto konnte nicht analysiert werden. Rahme die Teile von Hand ein.',
  too_large: 'Das Foto ist zu groß für die Analyse.',
  busy: 'Die Analyse ist gerade überlastet. Versuch es in einer Minute noch einmal.',
  unauthorized: 'Du bist nicht mehr angemeldet oder nicht mehr eingeladen.',
  offline: 'Keine Verbindung. Prüfe dein Internet und versuch es noch einmal.',
}

export class AnalyzeError extends Error {
  code: string
  constructor(code: string) {
    super(MESSAGES[code] ?? 'Die Analyse hat nicht geklappt. Versuch es noch einmal oder rahme die Teile von Hand ein.')
    this.code = code
  }
}

/** Test-Schalter: `localStorage.garderobe.mock = '1'` liefert feste Ergebnisse statt Claude. */
const mocked = () => {
  try {
    return localStorage.getItem('garderobe.mock') === '1'
  } catch {
    return false
  }
}

const MOCK: DetectedItem[] = [
  {
    box: { x: 0.25, y: 0.16, w: 0.5, h: 0.3 },
    worn: true,
    name: 'Weißes T-Shirt',
    category: 'top',
    subcategory: 'T-Shirt',
    length: 'mid',
    accessory_type: null,
    colors: [{ hex: '#f2f2f2', name: 'Weiß' }],
    pattern: 'uni',
    material: 'Baumwolle',
    warmth: 2,
    formality: 2,
    seasons: ['spring', 'summer', 'autumn'],
    tags: ['basic'],
  },
  {
    box: { x: 0.28, y: 0.44, w: 0.44, h: 0.46 },
    worn: true,
    name: 'Blaue Jeans',
    category: 'bottom',
    subcategory: 'Jeans',
    length: 'long',
    accessory_type: null,
    colors: [{ hex: '#2f4a7a', name: 'Blau' }],
    pattern: 'uni',
    material: 'Denim',
    warmth: 3,
    formality: 2,
    seasons: ['spring', 'summer', 'autumn', 'winter'],
    tags: ['basic'],
  },
]

/** Schickt das Foto an die Analyse und liefert die gefundenen Teile mit geprüften Rahmen. */
export async function analyzePhoto(work: Blob): Promise<DetectedItem[]> {
  if (mocked()) return MOCK.map((m) => ({ ...m }))
  const { data: image, width, height } = await analysisImage(work)
  const { data, error } = await supabase.functions.invoke('analyze', { body: { image, width, height } })
  if (error) throw new AnalyzeError(await functionErrorCode(error))
  const items: unknown[] = Array.isArray(data?.items) ? data.items : []
  const out: DetectedItem[] = []
  for (const raw of items as DetectedItem[]) {
    const box = clampBox(raw?.box)
    if (box) out.push({ ...raw, box })
  }
  return out
}
