import { useMemo, useState } from 'react'
import type { Nav } from '../App'
import { ItemCard } from '../components/ItemCard'
import { colorFamily, FAMILY_SWATCH } from '../lib/color'
import { CATEGORIES, SEASONS, type Category, type Season } from '../lib/types'
import { useStore } from '../store'

type Scope = 'all' | 'wishlist' | Category

export function Wardrobe({ nav }: { nav: Nav }) {
  const { items, url } = useStore()
  const [scope, setScope] = useState<Scope>('all')
  const [family, setFamily] = useState<string | null>(null)
  const [season, setSeason] = useState<Season | ''>('')

  const base = useMemo(
    () => items.filter((i) => (scope === 'wishlist' ? i.is_wishlist : !i.is_wishlist && (scope === 'all' || i.category === scope))),
    [items, scope],
  )
  const families = useMemo(() => {
    const seen = new Set(base.map((i) => (i.colors[0] ? colorFamily(i.colors[0].hex) : '')))
    return Object.keys(FAMILY_SWATCH).filter((f) => seen.has(f))
  }, [base])
  const shown = base.filter(
    (i) => (!family || (i.colors[0] && colorFamily(i.colors[0].hex) === family)) && (!season || i.seasons.includes(season)),
  )
  const wishes = items.filter((i) => i.is_wishlist).length
  const count = (c: Category) => items.filter((i) => !i.is_wishlist && i.category === c).length

  return (
    <div className="page">
      <header className="page-head">
        <h1>Schrank</h1>
        <span className="muted">{shown.length} Teile</span>
      </header>

      <div className="chips" role="tablist" aria-label="Kategorie">
        <button className={`chip ${scope === 'all' ? 'on' : ''}`} onClick={() => setScope('all')}>
          Alle
        </button>
        {CATEGORIES.filter((c) => count(c.id) > 0).map((c) => (
          <button key={c.id} className={`chip ${scope === c.id ? 'on' : ''}`} onClick={() => setScope(c.id)}>
            {c.plural}
          </button>
        ))}
        <button className={`chip ${scope === 'wishlist' ? 'on' : ''}`} onClick={() => setScope('wishlist')}>
          ♡ Wunschliste{wishes ? ` (${wishes})` : ''}
        </button>
      </div>

      {(families.length > 1 || season) && (
        <div className="filters">
          <div className="swatches" aria-label="Farbe">
            {families.map((f) => (
              <button
                key={f}
                className={`swatch ${family === f ? 'on' : ''}`}
                style={{ background: FAMILY_SWATCH[f] }}
                onClick={() => setFamily(family === f ? null : f)}
                aria-label={f}
                aria-pressed={family === f}
                title={f}
              />
            ))}
          </div>
          <select value={season} onChange={(e) => setSeason(e.target.value as Season | '')} aria-label="Saison">
            <option value="">Jede Saison</option>
            {SEASONS.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
      )}

      {shown.length === 0 ? (
        <div className="empty">
          {scope === 'wishlist' ? (
            <>
              <h2>Noch nichts auf der Wunschliste</h2>
              <p>Lade einen Screenshot aus einem Shop hoch und probier das Teil an, bevor du es kaufst.</p>
              <button className="btn primary" onClick={() => nav.startImport(true)}>
                Kauf-Kandidat hinzufügen
              </button>
            </>
          ) : items.length === 0 ? (
            <>
              <h2>Hier landen deine Klamotten</h2>
              <p>Wähle Fotos aus deiner Galerie – Selfies, Teile auf dem Bett, alles geht.</p>
              <button className="btn primary" onClick={() => nav.startImport(false)}>
                Fotos hochladen
              </button>
            </>
          ) : (
            <p>Kein Teil passt zu diesem Filter.</p>
          )}
        </div>
      ) : (
        <div className="masonry">
          {shown.map((item) => (
            <ItemCard key={item.id} item={item} src={url(item.thumb_path)} onClick={() => nav.openItem(item.id)} />
          ))}
        </div>
      )}
    </div>
  )
}
