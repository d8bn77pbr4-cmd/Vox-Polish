import { useEffect, useMemo, useState } from 'react'
import { TabBar, type Tab } from './components/TabBar'
import { supabase } from './lib/supabase'
import type { Adjust } from './lib/types'
import { Doll } from './screens/Doll'
import { Import } from './screens/Import'
import { ItemSheet } from './screens/ItemSheet'
import { Login } from './screens/Login'
import { Me } from './screens/Me'
import { Today } from './screens/Today'
import { Wardrobe } from './screens/Wardrobe'
import { StoreProvider, useStore } from './store'

export interface DollState {
  ids: string[]
  adjust: Record<string, Adjust>
}

/** Wege, auf denen ein Bildschirm zu einem anderen führt. */
export interface Nav {
  go: (tab: Tab) => void
  openItem: (id: string) => void
  /** Zieht der Puppe diese Teile an und wechselt zur Puppe. */
  tryOn: (ids: string[], adjust?: Record<string, Adjust>) => void
  startImport: (wishlist: boolean) => void
}

export default function App() {
  const [user, setUser] = useState<{ id: string; email: string } | null | undefined>(undefined)

  useEffect(() => {
    const apply = (s: { user: { id: string; email?: string } } | null) =>
      setUser((old) => {
        const next = s ? { id: s.user.id, email: s.user.email ?? '' } : null
        return old && next && old.id === next.id ? old : next
      })
    supabase.auth.getSession().then(({ data }) => apply(data.session))
    const { data } = supabase.auth.onAuthStateChange((_event, session) => apply(session))
    return () => data.subscription.unsubscribe()
  }, [])

  if (user === undefined) return <div className="center-screen muted">Garderobe</div>
  if (!user) return <Login />
  return (
    <StoreProvider key={user.id} userId={user.id} email={user.email}>
      <Shell />
    </StoreProvider>
  )
}

function Shell() {
  const store = useStore()
  const [tab, setTab] = useState<Tab>('today')
  const [doll, setDoll] = useState<DollState>({ ids: [], adjust: {} })
  const [openId, setOpenId] = useState<string | null>(null)
  const [wishlistImport, setWishlistImport] = useState(false)

  const nav = useMemo<Nav>(
    () => ({
      go: setTab,
      openItem: setOpenId,
      tryOn(ids, adjust = {}) {
        setDoll({ ids, adjust })
        setOpenId(null)
        setTab('doll')
      },
      startImport(wishlist) {
        setWishlistImport(wishlist)
        setOpenId(null)
        setTab('import')
      },
    }),
    [],
  )
  const open = store.items.find((i) => i.id === openId)

  return (
    <div className="app">
      <main className="screen">
        {tab === 'today' && <Today nav={nav} />}
        {tab === 'wardrobe' && <Wardrobe nav={nav} />}
        {/* Der Import bleibt geladen, damit laufende Fotos beim Tab-Wechsel nicht verloren gehen. */}
        <div hidden={tab !== 'import'}>
          <Import nav={nav} wishlist={wishlistImport} setWishlist={setWishlistImport} />
        </div>
        {tab === 'doll' && <Doll nav={nav} doll={doll} setDoll={setDoll} />}
        {tab === 'me' && <Me nav={nav} />}
      </main>
      <TabBar tab={tab} onChange={setTab} />
      {open && <ItemSheet item={open} nav={nav} onClose={() => setOpenId(null)} />}
    </div>
  )
}
