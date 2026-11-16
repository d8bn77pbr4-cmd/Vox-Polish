import { useEffect, useRef, useState } from 'react'
import type { Nav } from '../App'
import { BoxEditor } from '../components/BoxEditor'
import { Sheet } from '../components/Sheet'
import { analyzePhoto } from '../lib/analyze'
import { usageToday, type ItemImages } from '../lib/api'
import { padBox } from '../lib/crop'
import { clothesMap, onModelProgress, removeBackground } from '../lib/cutout/client'
import { labelsFor, maskFromLabelMap, type LabelMap } from '../lib/cutout/labels'
import { applyMask, cropFromWork, finalize, photoCanvas, workCopy } from '../lib/images'
import { ACCESSORY_TYPES, CATEGORIES, isoDate, type Box, type ItemAttrs } from '../lib/types'
import { useStore } from '../store'

type Built = ItemImages & { preview: string; avgHex: string }

interface Draft {
  key: string
  attrs: ItemAttrs
  box: Box
  worn: boolean
  cutout: boolean
  images: Built | null
  busy: boolean
  note: string | null
}

interface Photo {
  key: string
  work: Blob
  src: string
  status: 'analyzing' | 'ready' | 'error'
  error: string | null
  drafts: Draft[]
}

interface Edit {
  photoKey: string
  draftKey: string | null // null = neues Teil von Hand
  box: Box
  worn: boolean
}

const BLANK: ItemAttrs = {
  name: '',
  category: 'top',
  subcategory: '',
  length: 'mid',
  accessory_type: null,
  colors: [],
  pattern: 'uni',
  material: '',
  warmth: 3,
  formality: 2,
  seasons: ['spring', 'summer', 'autumn', 'winter'],
  tags: [],
}

let counter = 0
const newKey = () => `k${++counter}`

// Das Kleidungs-Modell läuft einmal pro Foto; alle getragenen Teile nutzen dasselbe Ergebnis.
const clothesCache = new Map<string, Promise<LabelMap>>()
function clothesOf(photo: Pick<Photo, 'key' | 'work'>): Promise<LabelMap> {
  let found = clothesCache.get(photo.key)
  if (!found) {
    found = photoCanvas(photo.work).then(clothesMap)
    clothesCache.set(photo.key, found)
  }
  return found
}

/** Schneidet ein Teil aus und stellt es frei. Klappt das Freistellen nicht, bleibt der Ausschnitt. */
async function build(photo: Pick<Photo, 'key' | 'work'>, d: Pick<Draft, 'box' | 'worn' | 'cutout' | 'attrs'>): Promise<{ images: Built; note: string | null }> {
  const plain = async (note: string | null) => ({ images: await finalize(await cropFromWork(photo.work, d.box)), note })
  if (!d.cutout) return plain(null)
  try {
    const padded = padBox(d.box)
    const canvas = await cropFromWork(photo.work, padded)
    const wanted = labelsFor(d.attrs.category, d.attrs.accessory_type)
    const fromClothes = async () => (wanted.length ? maskFromLabelMap(await clothesOf(photo), padded, wanted, canvas.width, canvas.height) : null)
    // Am Körper getragen: nur das Kleidungs-Modell – Hintergrund entfernen würde die ganze Person ausschneiden.
    const mask = d.worn ? await fromClothes() : ((await removeBackground(canvas)) ?? (await fromClothes()))
    if (mask) return { images: await finalize(applyMask(canvas, mask)), note: null }
    return plain('Hier ließ sich nichts freistellen – das Teil wird als Ausschnitt gespeichert.')
  } catch (err) {
    console.warn('Freistellen fehlgeschlagen:', err)
    return plain('Freistellen ist gerade nicht verfügbar – das Teil wird als Ausschnitt gespeichert.')
  }
}

export function Import({ nav, wishlist, setWishlist }: { nav: Nav; wishlist: boolean; setWishlist: (w: boolean) => void }) {
  const store = useStore()
  const [photos, setPhotos] = useState<Photo[]>([])
  const [edit, setEdit] = useState<Edit | null>(null)
  const [over, setOver] = useState(false)
  const [saving, setSaving] = useState(false)
  const [modelLoad, setModelLoad] = useState<number | null>(null)
  const [used, setUsed] = useState<number | null>(null)
  const input = useRef<HTMLInputElement>(null)
  const queue = useRef<Promise<void>>(Promise.resolve())

  useEffect(() => {
    onModelProgress((p) => setModelLoad(p >= 99.5 ? null : p))
    usageToday(store.userId, isoDate(new Date())).then(setUsed, () => undefined)
    return () => onModelProgress(null)
  }, [store.userId])

  const patchPhoto = (key: string, fn: (p: Photo) => Photo) => setPhotos((list) => list.map((p) => (p.key === key ? fn(p) : p)))
  const patchDraft = (photoKey: string, draftKey: string, patch: Partial<Draft>) =>
    patchPhoto(photoKey, (p) => ({ ...p, drafts: p.drafts.map((d) => (d.key === draftKey ? { ...d, ...patch } : d)) }))

  const rebuild = async (photo: Pick<Photo, 'key' | 'work'>, draft: Draft) => {
    patchDraft(photo.key, draft.key, { ...draft, busy: true })
    try {
      const { images, note } = await build(photo, draft)
      if (draft.images) URL.revokeObjectURL(draft.images.preview)
      patchDraft(photo.key, draft.key, { images, note, busy: false })
    } catch {
      patchDraft(photo.key, draft.key, { busy: false, note: 'Dieses Teil konnte nicht ausgeschnitten werden.' })
    }
    setModelLoad(null)
  }

  const processFile = async (file: File) => {
    const key = newKey()
    let work: Blob
    try {
      work = (await workCopy(file)).blob
    } catch (err) {
      store.toast(err instanceof Error ? err.message : 'Dieses Bild kann nicht geöffnet werden.')
      return
    }
    const photo: Photo = { key, work, src: URL.createObjectURL(work), status: 'analyzing', error: null, drafts: [] }
    setPhotos((list) => [...list, photo])
    try {
      const found = await analyzePhoto(work)
      const drafts: Draft[] = found.map(({ box, worn, ...attrs }) => ({
        key: newKey(),
        attrs,
        box,
        worn,
        cutout: true,
        images: null,
        busy: true,
        note: null,
      }))
      patchPhoto(key, (p) => ({ ...p, status: 'ready', drafts }))
      setUsed((n) => (n == null ? n : n + 1))
      for (const d of drafts) await rebuild(photo, d)
    } catch (err) {
      patchPhoto(key, (p) => ({ ...p, status: 'error', error: err instanceof Error ? err.message : 'Die Analyse hat nicht geklappt.' }))
    }
  }

  const addFiles = (files: FileList | File[] | null) => {
    const images = Array.from(files ?? []).filter((f) => f.type.startsWith('image/') || /\.(heic|heif)$/i.test(f.name))
    if (images.length === 0) return
    // Nacheinander: schont den Speicher des Handys und das Tageslimit bleibt nachvollziehbar.
    for (const file of images) queue.current = queue.current.then(() => processFile(file))
  }

  const applyEdit = () => {
    if (!edit) return
    const photo = photos.find((p) => p.key === edit.photoKey)
    if (!photo) return
    const old = photo.drafts.find((d) => d.key === edit.draftKey)
    const draft: Draft = old
      ? { ...old, box: edit.box, worn: edit.worn }
      : { key: newKey(), attrs: { ...BLANK }, box: edit.box, worn: edit.worn, cutout: true, images: null, busy: true, note: null }
    if (!old) patchPhoto(photo.key, (p) => ({ ...p, drafts: [...p.drafts, draft] }))
    setEdit(null)
    void rebuild(photo, draft)
  }

  const removeDraft = (photoKey: string, draft: Draft) => {
    if (draft.images) URL.revokeObjectURL(draft.images.preview)
    patchPhoto(photoKey, (p) => ({ ...p, drafts: p.drafts.filter((d) => d.key !== draft.key) }))
  }
  const removePhoto = (photo: Photo) => {
    URL.revokeObjectURL(photo.src)
    clothesCache.delete(photo.key)
    photo.drafts.forEach((d) => d.images && URL.revokeObjectURL(d.images.preview))
    setPhotos((list) => list.filter((p) => p.key !== photo.key))
  }

  const ready = photos.flatMap((p) => p.drafts.filter((d) => d.images && !d.busy).map((d) => ({ photo: p, draft: d })))
  const working = photos.some((p) => p.status === 'analyzing' || p.drafts.some((d) => d.busy))

  const saveAll = async () => {
    setSaving(true)
    let saved = 0
    let failed = 0
    for (const { photo, draft } of ready) {
      const images = draft.images!
      const attrs: ItemAttrs = {
        ...draft.attrs,
        name: draft.attrs.name.trim() || draft.attrs.subcategory || CATEGORIES.find((c) => c.id === draft.attrs.category)!.label,
        colors: draft.attrs.colors.length ? draft.attrs.colors : [{ hex: images.avgHex, name: '' }],
      }
      try {
        await store.addItem(attrs, images, { is_wishlist: wishlist })
        removeDraft(photo.key, draft)
        saved++
      } catch {
        failed++
      }
    }
    setSaving(false)
    if (failed) store.toast(`${failed} ${failed === 1 ? 'Teil konnte' : 'Teile konnten'} nicht gespeichert werden. Versuch es noch einmal.`)
    else {
      store.toast(`${saved} ${saved === 1 ? 'Teil' : 'Teile'} gespeichert`)
      setPhotos((list) => {
        list.forEach((p) => {
          URL.revokeObjectURL(p.src)
          clothesCache.delete(p.key)
        })
        return []
      })
      nav.go('wardrobe')
    }
  }

  const editPhoto = edit && photos.find((p) => p.key === edit.photoKey)

  return (
    <div className="page">
      <header className="page-head">
        <h1>Import</h1>
        {used != null && <span className="muted">{used} / 40 heute</span>}
      </header>

      <div className="seg wide" role="tablist">
        <button className={!wishlist ? 'on' : ''} onClick={() => setWishlist(false)} role="tab" aria-selected={!wishlist}>
          Für meinen Schrank
        </button>
        <button className={wishlist ? 'on' : ''} onClick={() => setWishlist(true)} role="tab" aria-selected={wishlist}>
          Kauf-Kandidat
        </button>
      </div>

      <div
        className={`drop ${over ? 'over' : ''}`}
        onDragOver={(e) => {
          e.preventDefault()
          setOver(true)
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault()
          setOver(false)
          addFiles(e.dataTransfer.files)
        }}
      >
        <p className="drop-title">{wishlist ? 'Screenshot oder Foto vom Teil, das du kaufen willst' : 'Fotos aus deiner Galerie'}</p>
        <p className="muted">Mehrere auf einmal: Selfies, Teile auf dem Bett, Screenshots. Die App findet die Kleidungsstücke selbst.</p>
        <button className="btn primary" onClick={() => input.current?.click()}>
          Fotos auswählen
        </button>
        <input
          ref={input}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(e) => {
            addFiles(e.target.files)
            e.target.value = ''
          }}
        />
      </div>

      {modelLoad != null && <p className="notice">Freistell-Modell wird geladen … {Math.round(modelLoad)} % (nur beim ersten Mal)</p>}

      {photos.map((photo) => (
        <section key={photo.key} className="photo">
          <header className="photo-head">
            <img src={photo.src} alt="Hochgeladenes Foto" />
            <div className="grow">
              {photo.status === 'analyzing' && <p className="pulse">Suche Kleidungsstücke …</p>}
              {photo.status === 'error' && <p className="error">{photo.error}</p>}
              {photo.status === 'ready' && (
                <p>{photo.drafts.length === 0 ? 'Auf diesem Foto wurde nichts gefunden.' : `${photo.drafts.length} ${photo.drafts.length === 1 ? 'Teil' : 'Teile'} gefunden`}</p>
              )}
              {photo.status !== 'analyzing' && (
                <button className="link" onClick={() => setEdit({ photoKey: photo.key, draftKey: null, box: { x: 0.25, y: 0.25, w: 0.5, h: 0.5 }, worn: false })}>
                  + Teil von Hand einrahmen
                </button>
              )}
            </div>
            <button className="icon-btn" onClick={() => removePhoto(photo)} aria-label="Foto verwerfen">
              ✕
            </button>
          </header>

          {photo.drafts.map((draft) => (
            <div key={draft.key} className="draft">
              <div className={`draft-img ${draft.busy ? 'pulse' : ''}`}>{draft.images && <img src={draft.images.preview} alt={draft.attrs.name} />}</div>
              <div className="draft-body">
                <input
                  className="draft-name"
                  value={draft.attrs.name}
                  placeholder="Name"
                  aria-label="Name"
                  onChange={(e) => patchDraft(photo.key, draft.key, { attrs: { ...draft.attrs, name: e.target.value } })}
                />
                <div className="field-row">
                  <select
                    value={draft.attrs.category}
                    aria-label="Kategorie"
                    onChange={(e) => {
                      const category = e.target.value as ItemAttrs['category']
                      const flat = category === 'shoes' || category === 'accessory'
                      const attrs = {
                        ...draft.attrs,
                        category,
                        length: flat ? null : (draft.attrs.length ?? 'mid'),
                        accessory_type: category === 'accessory' ? (draft.attrs.accessory_type ?? 'other') : null,
                      }
                      // Bei getragenen Teilen entscheidet die Kategorie, was freigestellt wird.
                      if (draft.worn && draft.cutout) void rebuild(photo, { ...draft, attrs })
                      else patchDraft(photo.key, draft.key, { attrs })
                    }}
                  >
                    {CATEGORIES.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                  {draft.attrs.category === 'accessory' && (
                    <select
                      value={draft.attrs.accessory_type ?? 'other'}
                      aria-label="Art"
                      onChange={(e) => patchDraft(photo.key, draft.key, { attrs: { ...draft.attrs, accessory_type: e.target.value as ItemAttrs['accessory_type'] } })}
                    >
                      {ACCESSORY_TYPES.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.label}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
                <div className="draft-tools">
                  <button className="btn small" disabled={draft.busy} onClick={() => setEdit({ photoKey: photo.key, draftKey: draft.key, box: draft.box, worn: draft.worn })}>
                    Rahmen
                  </button>
                  <label className="check-label">
                    <input type="checkbox" checked={draft.cutout} disabled={draft.busy} onChange={(e) => void rebuild(photo, { ...draft, cutout: e.target.checked })} />
                    Freistellen
                  </label>
                  <button className="icon-btn" onClick={() => removeDraft(photo.key, draft)} aria-label="Teil entfernen">
                    ✕
                  </button>
                </div>
                {draft.note && <p className="hint">{draft.note}</p>}
              </div>
            </div>
          ))}
        </section>
      ))}

      {photos.length > 0 && (
        <div className="savebar">
          <button className="btn primary block" disabled={saving || working || ready.length === 0} onClick={saveAll}>
            {saving ? 'Speichere …' : working ? 'Teile werden vorbereitet …' : `${ready.length} ${ready.length === 1 ? 'Teil' : 'Teile'} ${wishlist ? 'auf die Wunschliste' : 'in den Schrank'}`}
          </button>
        </div>
      )}

      {edit && editPhoto && (
        <Sheet title="Rahmen anpassen" onClose={() => setEdit(null)}>
          <p className="muted">Zieh den Rahmen eng um das Teil.</p>
          <BoxEditor src={editPhoto.src} box={edit.box} onChange={(box) => setEdit({ ...edit, box })} />
          <label className="check-label pad">
            <input type="checkbox" checked={edit.worn} onChange={(e) => setEdit({ ...edit, worn: e.target.checked })} />
            Das Teil wird auf dem Foto von jemandem getragen
          </label>
          <button className="btn primary block" onClick={applyEdit}>
            Übernehmen
          </button>
        </Sheet>
      )}
    </div>
  )
}
