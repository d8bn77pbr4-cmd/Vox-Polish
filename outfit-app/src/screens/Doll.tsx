import { useMemo, useState } from 'react'
import type { DollState, Nav } from '../App'
import { DollFigure } from '../components/DollFigure'
import { ItemCard, tint } from '../components/ItemCard'
import { buildAffinity, scoreOutfit, type Ctx } from '../lib/generator'
import { purchaseCheck } from '../lib/purchase'
import { CATEGORIES, isoDate, seasonOf, type Adjust, type Category, type Item } from '../lib/types'
import { useStore } from '../store'
import { sameIds } from './Today'

const NONE: Adjust = { dx: 0, dy: 0, scale: 1 }

/** Was beim Anziehen ausgezogen werden muss: gleiche Kategorie, und Kleid ↔ Oberteil/Unterteil. */
function conflicts(a: Item, b: Item): boolean {
  if (a.category === 'accessory' || b.category === 'accessory') {
    return a.category === b.category && a.accessory_type === b.accessory_type
  }
  if (a.category === b.category) return true
  const core = (c: Category) => c === 'top' || c === 'bottom'
  return (a.category === 'dress' && core(b.category)) || (b.category === 'dress' && core(a.category))
}

export function Doll({ nav, doll, setDoll }: { nav: Nav; doll: DollState; setDoll: (d: DollState) => void }) {
  const store = useStore()
  const { items, outfits, profile } = store
  const [slot, setSlot] = useState<Category>('top')
  const [selected, setSelected] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const today = isoDate(new Date())

  const worn = useMemo(() => doll.ids.map((id) => items.find((i) => i.id === id)).filter((i): i is Item => !!i), [doll.ids, items])
  const ctx = useMemo<Ctx>(
    () => ({ weather: null, season: seasonOf(new Date()), recentIds: new Set(), affinity: buildAffinity(outfits) }),
    [outfits],
  )
  const candidate = worn.find((i) => i.is_wishlist)
  const check = useMemo(() => (candidate ? purchaseCheck(candidate, items, ctx) : null), [candidate, items, ctx])
  const sel = worn.find((i) => i.id === selected)
  const selAdjust = (sel && doll.adjust[sel.id]) || NONE

  const toggle = (item: Item) => {
    if (doll.ids.includes(item.id)) {
      setDoll({ ...doll, ids: doll.ids.filter((id) => id !== item.id) })
      if (selected === item.id) setSelected(null)
      return
    }
    const keep = worn.filter((w) => !conflicts(w, item)).map((w) => w.id)
    setDoll({ ...doll, ids: [...keep, item.id] })
    setSelected(item.id)
  }
  const setAdjust = (id: string, adjust: Adjust) => setDoll({ ...doll, adjust: { ...doll.adjust, [id]: adjust } })

  const save = async (asWorn: boolean) => {
    if (worn.length === 0 || busy) return
    setBusy(true)
    const adjust = Object.fromEntries(Object.entries(doll.adjust).filter(([id]) => doll.ids.includes(id)))
    try {
      const existing = outfits.find((o) => o.date === today && sameIds(o.item_ids, doll.ids))
      if (existing) await store.patchOutfit(existing.id, { adjust, worn: asWorn || existing.worn })
      else await store.addOutfit({ date: today, item_ids: doll.ids, source: 'doll', adjust, worn: asWorn })
      store.toast(asWorn ? 'Im Tagebuch eingetragen' : 'Outfit gespeichert')
    } catch {
      store.toast('Speichern hat nicht geklappt. Prüfe dein Internet.')
    }
    setBusy(false)
  }

  // Gespeicherte Outfits: jede Kombination nur einmal, neueste zuerst.
  const saved = useMemo(() => {
    const seen = new Set<string>()
    return outfits
      .filter((o) => o.item_ids.every((id) => items.some((i) => i.id === id)))
      .filter((o) => {
        const key = [...o.item_ids].sort().join()
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })
      .slice(0, 12)
  }, [outfits, items])

  const inSlot = items.filter((i) => i.category === slot)

  return (
    <div className="page doll-page">
      <header className="page-head">
        <h1>Puppe</h1>
        {worn.length > 1 && (
          <span className="pill">
            <b>{Math.round(scoreOutfit(worn, ctx))}</b> Punkte
          </span>
        )}
      </header>

      <div className="doll-stage">
        <DollFigure
          measurements={profile.measurements}
          skin={profile.skin_tone}
          items={worn}
          url={store.url}
          adjust={doll.adjust}
          editable
          selectedId={selected}
          onSelect={setSelected}
          onAdjust={setAdjust}
        />
        {worn.length === 0 && <p className="doll-hint">Tippe unten auf ein Teil, um es anzuziehen.</p>}
      </div>

      {sel && (
        <div className="adjust">
          <span className="adjust-name">{sel.name || sel.subcategory}</span>
          <label>
            <span>Größe</span>
            <input
              type="range"
              min="0.5"
              max="1.8"
              step="0.01"
              value={selAdjust.scale}
              onChange={(e) => setAdjust(sel.id, { ...selAdjust, scale: Number(e.target.value) })}
            />
          </label>
          <button className="btn small" onClick={() => setAdjust(sel.id, NONE)}>
            Zurücksetzen
          </button>
          <button className="btn small" onClick={() => toggle(sel)}>
            Ausziehen
          </button>
        </div>
      )}

      {check && candidate && (
        <button className="check-inline" onClick={() => nav.openItem(candidate.id)}>
          <span className="eyebrow">Kauf-Check · {candidate.name}</span>
          <span>
            Ergibt <b>{check.count}</b> {check.count === 1 ? 'Outfit' : 'Outfits'} mit deinem Schrank · Farbe passt zu <b>{check.colorFit} %</b>
          </span>
        </button>
      )}

      <div className="chips" role="tablist" aria-label="Kategorie">
        {CATEGORIES.map((c) => (
          <button key={c.id} className={`chip ${slot === c.id ? 'on' : ''}`} onClick={() => setSlot(c.id)}>
            {c.plural}
          </button>
        ))}
      </div>
      {inSlot.length === 0 ? (
        <p className="muted pad">
          In dieser Kategorie ist noch nichts.{' '}
          <button className="link" onClick={() => nav.startImport(false)}>
            Fotos hochladen
          </button>
        </p>
      ) : (
        <div className="strip">
          {inSlot.map((item) => (
            <ItemCard key={item.id} item={item} src={store.url(item.thumb_path)} compact active={doll.ids.includes(item.id)} onClick={() => toggle(item)} />
          ))}
        </div>
      )}

      <div className="rate-row">
        <button className="btn" onClick={() => nav.startImport(true)}>
          + Kauf-Kandidat
        </button>
        <button className="btn grow" disabled={busy || worn.length === 0} onClick={() => save(false)}>
          Speichern
        </button>
        <button className="btn primary grow" disabled={busy || worn.length === 0} onClick={() => save(true)}>
          Heute getragen
        </button>
      </div>

      {saved.length > 0 && (
        <>
          <h2 className="section-title">Gespeicherte Outfits</h2>
          <div className="strip">
            {saved.map((o) => (
              <button key={o.id} className="combo saved" onClick={() => setDoll({ ids: o.item_ids, adjust: o.adjust ?? {} })}>
                <span className="combo-thumbs">
                  {o.item_ids.slice(0, 4).map((id) => {
                    const i = items.find((x) => x.id === id)!
                    return <img key={id} src={store.url(i.thumb_path)} alt={i.name} style={{ background: tint(i) }} />
                  })}
                </span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
