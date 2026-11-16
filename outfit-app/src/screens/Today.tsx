import { useEffect, useMemo, useState } from 'react'
import type { Nav } from '../App'
import { DollFigure } from '../components/DollFigure'
import { ItemCard } from '../components/ItemCard'
import { dailyOutfit } from '../lib/daily'
import { buildAffinity, type Ctx } from '../lib/generator'
import { isoDate, seasonOf, type Weather } from '../lib/types'
import { fetchWeather, needsOuterwear, weatherIcon, weatherText } from '../lib/weather'
import { recentIds } from '../lib/wear'
import { useStore } from '../store'

export const sameIds = (a: string[], b: string[]) => a.length === b.length && [...a].sort().join() === [...b].sort().join()

function greeting(): string {
  const h = new Date().getHours()
  return h < 11 ? 'Guten Morgen' : h < 18 ? 'Hallo' : 'Guten Abend'
}

export function Today({ nav }: { nav: Nav }) {
  const store = useStore()
  const { profile, items, outfits, userId } = store
  const today = isoDate(new Date())
  const [weather, setWeather] = useState<Weather | null>(null)
  const rerollKey = `garderobe.reroll.${today}`
  const [reroll, setReroll] = useState(() => Number(localStorage.getItem(rerollKey) ?? 0) || 0)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (profile.lat == null || profile.lon == null) return
    const key = `garderobe.wetter.${today}.${profile.lat.toFixed(2)},${profile.lon.toFixed(2)}`
    const cached = sessionStorage.getItem(key)
    if (cached) {
      setWeather(JSON.parse(cached))
      return
    }
    let alive = true
    fetchWeather(profile.lat, profile.lon)
      .then((w) => {
        if (!alive) return
        setWeather(w)
        sessionStorage.setItem(key, JSON.stringify(w))
      })
      .catch(() => undefined) // ohne Wetter gibt es trotzdem ein Outfit
    return () => {
      alive = false
    }
  }, [profile.lat, profile.lon, today])

  // Bewertungen von heute fließen erst morgen ein, sonst springt der Vorschlag beim Antippen um.
  const ctx = useMemo<Ctx>(() => {
    const before = outfits.filter((o) => o.date < today)
    return { weather, season: seasonOf(new Date()), recentIds: recentIds(before, today), affinity: buildAffinity(before) }
  }, [outfits, weather, today])

  const pick = useMemo(() => dailyOutfit(items, ctx, userId, today, reroll), [items, ctx, userId, today, reroll])
  const ids = pick?.items.map((i) => i.id) ?? []
  const row = outfits.find((o) => o.date === today && sameIds(o.item_ids, ids))

  const save = async (patch: { rating?: -1 | 0 | 1; worn?: boolean }) => {
    if (!pick || busy) return
    setBusy(true)
    try {
      if (row) await store.patchOutfit(row.id, patch)
      else await store.addOutfit({ date: today, item_ids: ids, source: 'daily', ...patch })
    } catch {
      store.toast('Speichern hat nicht geklappt. Prüfe dein Internet.')
    }
    setBusy(false)
  }
  const again = () => {
    const next = reroll + 1
    setReroll(next)
    localStorage.setItem(rerollKey, String(next))
  }
  const owned = items.filter((i) => !i.is_wishlist)

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <p className="eyebrow">{new Date().toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
          <h1>
            {greeting()}
            {profile.display_name ? `, ${profile.display_name}` : ''}
          </h1>
        </div>
        {weather ? (
          <div className="weather" title={profile.place_name ?? ''}>
            <span className="weather-icon">{weatherIcon(weather)}</span>
            <span>
              <b>{weather.tMax}°</b> / {weather.tMin}°<small>{weatherText(weather)}</small>
            </span>
          </div>
        ) : (
          profile.lat == null && (
            <button className="chip" onClick={() => nav.go('me')}>
              📍 Ort festlegen
            </button>
          )
        )}
      </header>

      {owned.length === 0 ? (
        <div className="empty">
          <h2>Dein Schrank ist noch leer</h2>
          <p>Lade ein paar Fotos hoch – die App findet die Kleidungsstücke darauf und legt sie einzeln an.</p>
          <button className="btn primary" onClick={() => nav.startImport(false)}>
            Fotos hochladen
          </button>
        </div>
      ) : !pick ? (
        <div className="empty">
          <h2>Noch kein Outfit möglich</h2>
          <p>Für einen Vorschlag braucht es mindestens ein Oberteil, ein Unterteil oder ein Kleid.</p>
          <button className="btn primary" onClick={() => nav.startImport(false)}>
            Mehr Teile hinzufügen
          </button>
        </div>
      ) : (
        <>
          <section className="today-card">
            <div className="today-doll">
              <DollFigure measurements={profile.measurements} skin={profile.skin_tone} items={pick.items} url={store.url} />
            </div>
            <div className="today-side">
              <p className="eyebrow">Outfit des Tages</p>
              <p className="score">
                <b>{Math.round(pick.score)}</b>
                <span>von 100 Punkten</span>
              </p>
              <ul className="reasons">
                {weather && <li>{needsOuterwear(weather) ? 'Kühl oder nass: mit Jacke' : `Passend für ${weather.tMax}°`}</li>}
                {!weather && <li>Ohne Wetter gewählt</li>}
                {pick.partial && <li>Für ganze Outfits fehlt noch ein Ober- oder Unterteil</li>}
              </ul>
              <div className="today-actions">
                <button className="btn" onClick={again}>
                  🎲 Neu würfeln
                </button>
                <button className="btn" onClick={() => nav.tryOn(ids)}>
                  Anpassen
                </button>
              </div>
            </div>
          </section>

          <div className="rate-row">
            <button className={`btn round ${row?.rating === 1 ? 'on' : ''}`} onClick={() => save({ rating: row?.rating === 1 ? 0 : 1 })} aria-label="Gefällt mir" aria-pressed={row?.rating === 1}>
              👍
            </button>
            <button className={`btn round ${row?.rating === -1 ? 'on' : ''}`} onClick={() => save({ rating: row?.rating === -1 ? 0 : -1 })} aria-label="Gefällt mir nicht" aria-pressed={row?.rating === -1}>
              👎
            </button>
            <button className={`btn grow ${row?.worn ? 'primary' : ''}`} onClick={() => save({ worn: !row?.worn })} aria-pressed={!!row?.worn}>
              {row?.worn ? '✓ Heute getragen' : 'Heute getragen'}
            </button>
          </div>

          <h2 className="section-title">Die Teile</h2>
          <div className="strip">
            {pick.items.map((item) => (
              <ItemCard key={item.id} item={item} src={store.url(item.thumb_path)} onClick={() => nav.openItem(item.id)} />
            ))}
          </div>
        </>
      )}
    </div>
  )
}
