import type { Weather } from './types'

/** Wie warm die Kleidung sein sollte: 1 (luftig) bis 5 (sehr warm). */
export function targetWarmth(tempC: number): number {
  if (tempC >= 26) return 1
  if (tempC >= 20) return 2
  if (tempC >= 13) return 3
  if (tempC >= 5) return 4
  return 5
}

export function needsOuterwear(w: Weather): boolean {
  return w.tMax < 15 || w.rainProb >= 50
}

export function weatherText(w: Weather): string {
  const c = w.code
  if (c === 0) return 'Sonnig'
  if (c <= 2) return 'Heiter'
  if (c === 3) return 'Bewölkt'
  if (c <= 48) return 'Nebel'
  if (c <= 67) return 'Regen'
  if (c <= 77) return 'Schnee'
  if (c <= 82) return 'Schauer'
  if (c <= 86) return 'Schneeschauer'
  return 'Gewitter'
}

export function weatherIcon(w: Weather): string {
  const c = w.code
  if (c === 0) return '☀️'
  if (c <= 2) return '🌤️'
  if (c === 3) return '☁️'
  if (c <= 48) return '🌫️'
  if (c <= 67) return '🌧️'
  if (c <= 77) return '❄️'
  if (c <= 82) return '🌦️'
  if (c <= 86) return '🌨️'
  return '⛈️'
}

export async function fetchWeather(lat: number, lon: number): Promise<Weather> {
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(3)}&longitude=${lon.toFixed(3)}` +
    '&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,weather_code' +
    '&timezone=auto&forecast_days=1'
  const res = await fetch(url)
  if (!res.ok) throw new Error('Wetter nicht erreichbar')
  const d = (await res.json()).daily
  return {
    tMax: Math.round(d.temperature_2m_max[0]),
    tMin: Math.round(d.temperature_2m_min[0]),
    rainProb: d.precipitation_probability_max?.[0] ?? 0,
    code: d.weather_code?.[0] ?? 0,
  }
}

export interface Place {
  name: string
  lat: number
  lon: number
}

export async function searchPlace(query: string): Promise<Place[]> {
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=5&language=de`
  const res = await fetch(url)
  if (!res.ok) throw new Error('Ortssuche nicht erreichbar')
  const json = await res.json()
  return (json.results ?? []).map((r: any) => ({
    name: [r.name, r.admin1, r.country_code].filter(Boolean).join(', '),
    lat: r.latitude,
    lon: r.longitude,
  }))
}
