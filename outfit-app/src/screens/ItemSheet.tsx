import { useMemo, useState } from 'react'
import type { Nav } from '../App'
import { Sheet } from '../components/Sheet'
import { tint } from '../components/ItemCard'
import { buildAffinity } from '../lib/generator'
import { purchaseCheck } from '../lib/purchase'
import { ACCESSORY_TYPES, CATEGORIES, LENGTHS, SEASONS, seasonOf, type Item, type Season } from '../lib/types'
import { wearStats } from '../lib/wear'
import { useStore } from '../store'

const WARMTH = ['', 'sehr luftig', 'leicht', 'mittel', 'warm', 'sehr warm']
const FORMALITY = ['', 'Sport & Zuhause', 'Alltag', 'gepflegt', 'schick', 'festlich']
const euro = (n: number) => n.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })

/** Felder zum Bearbeiten eines Teils – auch im Import genutzt. */
export function ItemFields({ value, onChange }: { value: Item; onChange: (patch: Partial<Item>) => void }) {
  const toggleSeason = (s: Season) =>
    onChange({ seasons: value.seasons.includes(s) ? value.seasons.filter((x) => x !== s) : [...value.seasons, s] })
  return (
    <div className="fields">
      <label className="field">
        <span>Name</span>
        <input value={value.name} onChange={(e) => onChange({ name: e.target.value })} maxLength={80} />
      </label>
      <div className="field-row">
        <label className="field">
          <span>Kategorie</span>
          <select
            value={value.category}
            onChange={(e) => {
              const category = e.target.value as Item['category']
              const flat = category === 'shoes' || category === 'accessory'
              onChange({
                category,
                length: flat ? null : (value.length ?? 'mid'),
                accessory_type: category === 'accessory' ? (value.accessory_type ?? 'other') : null,
              })
            }}
          >
            {CATEGORIES.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
        {value.category === 'accessory' ? (
          <label className="field">
            <span>Art</span>
            <select value={value.accessory_type ?? 'other'} onChange={(e) => onChange({ accessory_type: e.target.value as Item['accessory_type'] })}>
              {ACCESSORY_TYPES.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.label}
                </option>
              ))}
            </select>
          </label>
        ) : value.category !== 'shoes' ? (
          <label className="field">
            <span>Länge</span>
            <select value={value.length ?? 'mid'} onChange={(e) => onChange({ length: e.target.value as Item['length'] })}>
              {LENGTHS.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.label}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>
      <div className="field-row">
        <label className="field">
          <span>Hauptfarbe</span>
          <input
            type="color"
            value={value.colors[0]?.hex ?? '#888888'}
            onChange={(e) => onChange({ colors: [{ hex: e.target.value, name: '' }, ...value.colors.slice(1)] })}
          />
        </label>
        <label className="field">
          <span>Preis in €</span>
          <input
            type="number"
            inputMode="decimal"
            min="0"
            step="0.01"
            value={value.price ?? ''}
            placeholder="optional"
            onChange={(e) => onChange({ price: e.target.value === '' ? null : Math.max(0, Number(e.target.value)) })}
          />
        </label>
      </div>
      <label className="field">
        <span>
          Wärme: <b>{WARMTH[value.warmth]}</b>
        </span>
        <input type="range" min="1" max="5" step="1" value={value.warmth} onChange={(e) => onChange({ warmth: Number(e.target.value) })} />
      </label>
      <label className="field">
        <span>
          Anlass: <b>{FORMALITY[value.formality]}</b>
        </span>
        <input type="range" min="1" max="5" step="1" value={value.formality} onChange={(e) => onChange({ formality: Number(e.target.value) })} />
      </label>
      <div className="field">
        <span>Saison</span>
        <div className="chips wrap">
          {SEASONS.map((s) => (
            <button type="button" key={s.id} className={`chip ${value.seasons.includes(s.id) ? 'on' : ''}`} onClick={() => toggleSeason(s.id)} aria-pressed={value.seasons.includes(s.id)}>
              {s.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

export function ItemSheet({ item, nav, onClose }: { item: Item; nav: Nav; onClose: () => void }) {
  const store = useStore()
  const [draft, setDraft] = useState<Item>(item)
  const [busy, setBusy] = useState(false)
  const dirty = JSON.stringify(draft) !== JSON.stringify(item)
  const stat = useMemo(() => wearStats([item], store.outfits).get(item.id)!, [item, store.outfits])
  const check = useMemo(
    () =>
      item.is_wishlist
        ? purchaseCheck(item, store.items, {
            weather: null,
            season: seasonOf(new Date()),
            recentIds: new Set(),
            affinity: buildAffinity(store.outfits),
          })
        : null,
    [item, store.items, store.outfits],
  )

  const run = async (work: () => Promise<void>, done?: string) => {
    setBusy(true)
    try {
      await work()
      if (done) store.toast(done)
    } catch {
      store.toast('Das hat nicht geklappt. Prüfe dein Internet.')
    }
    setBusy(false)
  }
  const save = () =>
    run(async () => {
      const { id: _id, user_id: _u, created_at: _c, image_path: _i, thumb_path: _t, aspect: _a, ...patch } = draft
      await store.patchItem(item.id, patch)
    }, 'Gespeichert')
  const remove = () => {
    if (!confirm(`„${item.name || 'Dieses Teil'}“ wirklich löschen?`)) return
    void run(async () => {
      await store.removeItem(item)
      onClose()
    }, 'Gelöscht')
  }

  const verdict = !check ? '' : check.count >= 5 ? 'Lohnt sich: passt zu vielem in deinem Schrank.' : check.count >= 1 ? 'Geht, aber mit wenig Auswahl.' : 'Passt bisher zu nichts in deinem Schrank.'

  return (
    <Sheet title={item.is_wishlist ? 'Kauf-Kandidat' : 'Teil'} onClose={onClose}>
      <div className="item-hero" style={{ background: tint(item) }}>
        {store.url(item.image_path) && <img src={store.url(item.image_path)} alt={item.name} />}
      </div>

      {check && (
        <section className="check">
          <p className="eyebrow">Kauf-Check</p>
          <div className="check-nums">
            <p>
              <b>{check.count}</b>
              <span>{check.count === 1 ? 'Outfit' : 'Outfits'} mit deinem Schrank</span>
            </p>
            <p>
              <b>{check.colorFit} %</b>
              <span>Farbe passt</span>
            </p>
          </div>
          <p className="verdict">{verdict}</p>
          {check.top.map((combo, n) => (
            <button key={n} className="combo" onClick={() => nav.tryOn(combo.items.map((i) => i.id))}>
              <span className="combo-thumbs">
                {combo.items.map((i) => (
                  <img key={i.id} src={store.url(i.thumb_path)} alt={i.name} style={{ background: tint(i) }} />
                ))}
              </span>
              <span className="combo-go">Anprobieren ›</span>
            </button>
          ))}
          <button className="btn primary block" disabled={busy} onClick={() => run(() => store.patchItem(item.id, { is_wishlist: false }), 'Im Schrank')}>
            Gekauft – in den Schrank
          </button>
        </section>
      )}

      {!item.is_wishlist && (
        <div className="stats">
          <p>
            <b>{stat.count}×</b>
            <span>getragen</span>
          </p>
          <p>
            <b>{stat.last ? new Date(stat.last).toLocaleDateString('de-DE', { day: 'numeric', month: 'short' }) : '–'}</b>
            <span>zuletzt</span>
          </p>
          <p>
            <b>{stat.costPerWear != null ? euro(stat.costPerWear) : '–'}</b>
            <span>pro Tragen</span>
          </p>
        </div>
      )}

      <button className="btn block" onClick={() => nav.tryOn([item.id])}>
        An der Puppe anprobieren
      </button>

      <ItemFields value={draft} onChange={(patch) => setDraft((d) => ({ ...d, ...patch }))} />

      <div className="sheet-actions">
        <button className="btn danger" disabled={busy} onClick={remove}>
          Löschen
        </button>
        <button className="btn primary grow" disabled={busy || !dirty} onClick={save}>
          Speichern
        </button>
      </div>
    </Sheet>
  )
}
