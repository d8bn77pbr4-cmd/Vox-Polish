import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import * as api from './lib/api'
import type { Item, ItemAttrs, Outfit, Profile } from './lib/types'

export interface Store {
  userId: string
  email: string
  profile: Profile
  items: Item[]
  outfits: Outfit[]
  invites: api.Invite[]
  isAdmin: boolean
  /** Adresse eines gespeicherten Bildes; undefined, solange sie noch geladen wird. */
  url: (path: string) => string | undefined
  setProfile: (patch: Partial<Profile>) => Promise<void>
  addItem: (attrs: ItemAttrs, images: api.ItemImages, extra: { is_wishlist: boolean; price?: number | null }) => Promise<Item>
  patchItem: (id: string, patch: Partial<Item>) => Promise<void>
  removeItem: (item: Item) => Promise<void>
  addOutfit: (o: Pick<Outfit, 'date' | 'item_ids' | 'source'> & Partial<Outfit>) => Promise<Outfit>
  patchOutfit: (id: string, patch: Partial<Outfit>) => Promise<void>
  removeOutfit: (id: string) => Promise<void>
  reloadInvites: () => Promise<void>
  toast: (message: string) => void
}

const Ctx = createContext<Store | null>(null)

export function useStore(): Store {
  const store = useContext(Ctx)
  if (!store) throw new Error('useStore außerhalb von StoreProvider')
  return store
}

export function StoreProvider({ userId, email, children }: { userId: string; email: string; children: ReactNode }) {
  const [profile, setProfileState] = useState<Profile | null>(null)
  const [items, setItems] = useState<Item[]>([])
  const [outfits, setOutfits] = useState<Outfit[]>([])
  const [invites, setInvites] = useState<api.Invite[]>([])
  const [urls, setUrls] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)

  const ensureUrls = useCallback(async (list: Item[]) => {
    if (list.length === 0) return
    try {
      const found = await api.imageUrls(list.flatMap((i) => [i.thumb_path, i.image_path]))
      setUrls((old) => ({ ...old, ...found }))
    } catch {
      /* Bilder erscheinen beim nächsten Laden */
    }
  }, [])

  useEffect(() => {
    let alive = true
    setError(null)
    Promise.all([api.loadProfile(userId), api.loadItems(), api.loadOutfits(), api.loadInvites()])
      .then(([p, i, o, inv]) => {
        if (!alive) return
        setProfileState(p)
        setItems(i)
        setOutfits(o)
        setInvites(inv)
        void ensureUrls(i)
      })
      .catch(() => alive && setError('Deine Daten konnten nicht geladen werden. Prüfe dein Internet.'))
    return () => {
      alive = false
    }
  }, [userId, attempt, ensureUrls])

  useEffect(() => {
    if (!message) return
    const t = setTimeout(() => setMessage(null), 3200)
    return () => clearTimeout(t)
  }, [message])

  const store = useMemo<Store | null>(() => {
    if (!profile) return null
    return {
      userId,
      email,
      profile,
      items,
      outfits,
      invites,
      isAdmin: invites.some((i) => i.is_admin && i.email === email.toLowerCase()),
      url: (path) => urls[path],
      toast: setMessage,
      async setProfile(patch) {
        setProfileState((p) => (p ? { ...p, ...patch } : p))
        await api.saveProfile(userId, patch)
      },
      async addItem(attrs, images, extra) {
        const item = await api.insertItem(userId, attrs, images, extra)
        setItems((list) => [item, ...list])
        void ensureUrls([item])
        return item
      },
      async patchItem(id, patch) {
        const item = await api.updateItem(id, patch)
        setItems((list) => list.map((i) => (i.id === id ? item : i)))
      },
      async removeItem(item) {
        await api.deleteItem(item)
        setItems((list) => list.filter((i) => i.id !== item.id))
      },
      async addOutfit(o) {
        const outfit = await api.insertOutfit(o)
        setOutfits((list) => [outfit, ...list])
        return outfit
      },
      async patchOutfit(id, patch) {
        const outfit = await api.updateOutfit(id, patch)
        setOutfits((list) => list.map((o) => (o.id === id ? outfit : o)))
      },
      async removeOutfit(id) {
        await api.deleteOutfit(id)
        setOutfits((list) => list.filter((o) => o.id !== id))
      },
      async reloadInvites() {
        setInvites(await api.loadInvites())
      },
    }
  }, [userId, email, profile, items, outfits, invites, urls, ensureUrls])

  if (error) {
    return (
      <div className="center-screen">
        <p>{error}</p>
        <button className="btn primary" onClick={() => setAttempt((n) => n + 1)}>
          Noch einmal versuchen
        </button>
      </div>
    )
  }
  if (!store) return <div className="center-screen muted">Schrank wird geöffnet …</div>
  return (
    <Ctx.Provider value={store}>
      {children}
      {message && (
        <div className="toast" role="status">
          {message}
        </div>
      )}
    </Ctx.Provider>
  )
}
