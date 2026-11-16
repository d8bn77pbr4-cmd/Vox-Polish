import { useEffect, useMemo, useRef, useState } from 'react'
import type { Nav } from '../App'
import { DollFigure } from '../components/DollFigure'
import { ItemCard, tint } from '../components/ItemCard'
import { addInvite, removeInvite, signOut } from '../lib/api'
import { clampMeasurements, MEASURE_LABELS, MEASURE_RANGES } from '../lib/doll'
import { isoDate, type Measurements } from '../lib/types'
import { searchPlace, type Place } from '../lib/weather'
import { neglected } from '../lib/wear'
import { useStore } from '../store'

const SKINS = ['#f6dcc6', '#e6c3a5', '#d1a17c', '#b07d55', '#8a5a3a', '#5c3b26', '#d9d5cf']
const WEEKDAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So']

export function Me({ nav }: { nav: Nav }) {
  const store = useStore()
  const { profile, items, outfits } = store
  const today = isoDate(new Date())

  // --- Maße: sofort an der Puppe sichtbar, gespeichert wird kurz nach der letzten Änderung.
  const [m, setM] = useState<Measurements>(() => clampMeasurements(profile.measurements))
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const changeMeasure = (key: keyof Measurements, value: number) => {
    const next = { ...m, [key]: value }
    setM(next)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      store.setProfile({ measurements: next }).catch(() => store.toast('Maße konnten nicht gespeichert werden.'))
    }, 600)
  }
  useEffect(() => () => clearTimeout(timer.current), [])

  // --- Ort
  const [query, setQuery] = useState('')
  const [places, setPlaces] = useState<Place[] | null>(null)
  const [placeBusy, setPlaceBusy] = useState(false)
  const find = async () => {
    if (!query.trim()) return
    setPlaceBusy(true)
    try {
      setPlaces(await searchPlace(query.trim()))
    } catch {
      store.toast('Die Ortssuche ist gerade nicht erreichbar.')
    }
    setPlaceBusy(false)
  }
  const choose = (p: Place) => {
    void store.setProfile({ place_name: p.name, lat: p.lat, lon: p.lon })
    setPlaces(null)
    setQuery('')
  }
  const locate = () => {
    if (!navigator.geolocation) return store.toast('Dein Browser gibt keinen Standort frei.')
    navigator.geolocation.getCurrentPosition(
      (pos) => choose({ name: 'Mein Standort', lat: pos.coords.latitude, lon: pos.coords.longitude }),
      () => store.toast('Standort nicht freigegeben. Such deinen Ort stattdessen.'),
    )
  }

  // --- Tagebuch
  const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1))
  const [day, setDay] = useState<string | null>(null)
  const wornByDay = useMemo(() => {
    const map = new Map<string, typeof outfits>()
    for (const o of outfits) if (o.worn) map.set(o.date, [...(map.get(o.date) ?? []), o])
    return map
  }, [outfits])
  const cells = useMemo(() => {
    const first = (month.getDay() + 6) % 7 // Montag = 0
    const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate()
    return [...Array(first).fill(null), ...Array.from({ length: days }, (_, i) => isoDate(new Date(month.getFullYear(), month.getMonth(), i + 1)))] as (string | null)[]
  }, [month])
  const shift = (by: number) => setMonth(new Date(month.getFullYear(), month.getMonth() + by, 1))
  const itemOf = (id: string) => items.find((i) => i.id === id)

  const idle = useMemo(() => neglected(items, outfits, today), [items, outfits, today])

  // --- Einladungen
  const [mail, setMail] = useState('')
  const invite = async () => {
    try {
      await addInvite(mail, store.userId)
      setMail('')
      await store.reloadInvites()
    } catch (err) {
      store.toast(err instanceof Error ? err.message : 'Einladen hat nicht geklappt.')
    }
  }
  const share = async (email: string, code: string) => {
    const link = `${location.origin}/?einladung=${code}&email=${encodeURIComponent(email)}`
    try {
      if (navigator.share) await navigator.share({ title: 'Garderobe', text: 'Deine Einladung zu Garderobe:', url: link })
      else {
        await navigator.clipboard.writeText(link)
        store.toast('Einladungs-Link kopiert')
      }
    } catch {
      prompt('Einladungs-Link zum Kopieren:', link)
    }
  }

  return (
    <div className="page">
      <header className="page-head">
        <h1>Ich</h1>
        <span className="muted">{store.email}</span>
      </header>

      <section className="panel">
        <h2>Meine Maße</h2>
        <p className="muted">Die Puppe nimmt deine Proportionen an. Sie zeigt, wie Teile zusammen aussehen – nicht, ob eine Größe passt.</p>
        <div className="measure">
          <div className="measure-doll">
            <DollFigure measurements={m} skin={profile.skin_tone} items={[]} url={store.url} />
          </div>
          <div className="measure-fields">
            {(Object.keys(MEASURE_LABELS) as (keyof Measurements)[]).map((key) => (
              <label key={key} className="field">
                <span>
                  {MEASURE_LABELS[key]}: <b>{m[key]} cm</b>
                </span>
                <input type="range" min={MEASURE_RANGES[key][0]} max={MEASURE_RANGES[key][1]} step="1" value={m[key]} onChange={(e) => changeMeasure(key, Number(e.target.value))} />
              </label>
            ))}
            <div className="field">
              <span>Hautton</span>
              <div className="swatches">
                {SKINS.map((hex) => (
                  <button key={hex} className={`swatch ${profile.skin_tone === hex ? 'on' : ''}`} style={{ background: hex }} onClick={() => store.setProfile({ skin_tone: hex })} aria-label={`Hautton ${hex}`} aria-pressed={profile.skin_tone === hex} />
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="panel">
        <h2>Ort für das Wetter</h2>
        <p className="muted">{profile.place_name ? `Aktuell: ${profile.place_name}` : 'Noch kein Ort – das Outfit des Tages wird dann ohne Wetter gewählt.'}</p>
        <form
          className="inline-form"
          onSubmit={(e) => {
            e.preventDefault()
            void find()
          }}
        >
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Stadt suchen" aria-label="Stadt suchen" />
          <button className="btn" disabled={placeBusy}>
            Suchen
          </button>
          <button type="button" className="btn" onClick={locate} aria-label="Meinen Standort verwenden">
            📍
          </button>
        </form>
        {places && (places.length === 0 ? <p className="muted">Nichts gefunden.</p> : places.map((p) => (
          <button key={`${p.lat},${p.lon}`} className="row-btn" onClick={() => choose(p)}>
            {p.name}
          </button>
        )))}
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>Tagebuch</h2>
          <div className="month-nav">
            <button className="icon-btn" onClick={() => shift(-1)} aria-label="Voriger Monat">
              ‹
            </button>
            <span>{month.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' })}</span>
            <button className="icon-btn" onClick={() => shift(1)} aria-label="Nächster Monat">
              ›
            </button>
          </div>
        </div>
        <div className="calendar">
          {WEEKDAYS.map((w) => (
            <span key={w} className="cal-head">
              {w}
            </span>
          ))}
          {cells.map((date, i) => {
            if (!date) return <span key={`e${i}`} />
            const first = wornByDay.get(date)?.[0]
            const thumb = first && itemOf(first.item_ids[0])
            return (
              <button key={date} className={`cal-day ${date === today ? 'today' : ''} ${day === date ? 'on' : ''}`} onClick={() => setDay(day === date ? null : date)} disabled={!first} aria-label={date}>
                {thumb ? <img src={store.url(thumb.thumb_path)} alt="" style={{ background: tint(thumb) }} /> : <span>{Number(date.slice(8))}</span>}
              </button>
            )
          })}
        </div>
        {day &&
          (wornByDay.get(day) ?? []).map((o) => (
            <div key={o.id} className="diary-row">
              <button className="combo" onClick={() => nav.tryOn(o.item_ids.filter((id) => itemOf(id)), o.adjust)}>
                <span className="combo-thumbs">
                  {o.item_ids.map((id) => {
                    const it = itemOf(id)
                    return it ? <img key={id} src={store.url(it.thumb_path)} alt={it.name} style={{ background: tint(it) }} /> : null
                  })}
                </span>
                <span className="combo-go">{new Date(day).toLocaleDateString('de-DE', { day: 'numeric', month: 'long' })} ›</span>
              </button>
              <button className="icon-btn" onClick={() => store.patchOutfit(o.id, { worn: false })} aria-label="Aus dem Tagebuch entfernen">
                ✕
              </button>
            </div>
          ))}
        {wornByDay.size === 0 && <p className="muted">Tippe bei einem Outfit auf „Heute getragen“, dann füllt sich dein Tagebuch.</p>}
      </section>

      {idle.length > 0 && (
        <section className="panel">
          <h2>Lange nicht getragen</h2>
          <p className="muted">Seit mindestens 3 Monaten nicht getragen. Wieder anziehen oder aussortieren?</p>
          <div className="strip">
            {idle.slice(0, 12).map((item) => (
              <ItemCard key={item.id} item={item} src={store.url(item.thumb_path)} compact onClick={() => nav.openItem(item.id)} />
            ))}
          </div>
        </section>
      )}

      {store.isAdmin && (
        <section className="panel">
          <h2>Einladungen</h2>
          <p className="muted">Nur eingeladene Personen können ein Konto anlegen. Jede bekommt ihren eigenen, privaten Schrank. Schick ihnen ihren Link.</p>
          {store.invites.map((inv) => (
            <div key={inv.email} className="invite">
              <span className="grow">
                {inv.email}
                {inv.is_admin && <small> · du</small>}
              </span>
              {!inv.is_admin && (
                <>
                  <button className="btn small" onClick={() => share(inv.email, inv.code)}>
                    Link teilen
                  </button>
                  <button
                    className="icon-btn"
                    aria-label={`${inv.email} ausladen`}
                    onClick={() => confirm(`${inv.email} ausladen? Die Person kann dann keine Fotos mehr analysieren lassen.`) && removeInvite(inv.email).then(store.reloadInvites)}
                  >
                    ✕
                  </button>
                </>
              )}
            </div>
          ))}
          <form
            className="inline-form"
            onSubmit={(e) => {
              e.preventDefault()
              void invite()
            }}
          >
            <input type="email" value={mail} onChange={(e) => setMail(e.target.value)} placeholder="E-Mail der Person" aria-label="E-Mail der Person" required />
            <button className="btn primary">Einladen</button>
          </form>
        </section>
      )}

      <button className="btn block" onClick={() => signOut()}>
        Abmelden
      </button>
    </div>
  )
}
