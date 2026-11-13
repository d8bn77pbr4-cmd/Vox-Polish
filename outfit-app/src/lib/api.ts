import { supabase } from './supabase'
import type { Item, ItemAttrs, Outfit, Profile } from './types'

const BUCKET = 'items'

function fail(error: { message: string } | null): void {
  if (error) throw new Error(error.message)
}

/** Liest den Fehlercode einer Edge Function aus. */
export async function functionErrorCode(error: unknown): Promise<string> {
  const ctx = (error as { context?: Response })?.context
  if (ctx && typeof ctx.json === 'function') {
    try {
      const body = await ctx.clone().json()
      if (typeof body?.error === 'string') return body.error
    } catch {
      /* keine JSON-Antwort */
    }
    return 'failed'
  }
  return 'offline'
}

const REGISTER_ERRORS: Record<string, string> = {
  not_invited: 'Diese E-Mail ist nicht eingeladen oder der Einladungs-Code stimmt nicht.',
  exists: 'Für diese E-Mail gibt es schon ein Konto. Melde dich einfach an.',
  weak_password: 'Das Passwort braucht mindestens 8 Zeichen.',
  bad_email: 'Das ist keine gültige E-Mail-Adresse.',
  offline: 'Keine Verbindung. Prüfe dein Internet und versuch es noch einmal.',
}

export async function register(email: string, password: string, displayName: string, code: string) {
  const { error } = await supabase.functions.invoke('register', {
    body: { email, password, display_name: displayName, code },
  })
  if (error) {
    const key = await functionErrorCode(error)
    throw new Error(REGISTER_ERRORS[key] ?? 'Das Konto konnte nicht angelegt werden. Versuch es später noch einmal.')
  }
  await signIn(email, password)
}

export async function signIn(email: string, password: string) {
  const { error } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password })
  if (error) {
    throw new Error(
      error.message.includes('Invalid') ? 'E-Mail oder Passwort stimmt nicht.' : 'Anmelden hat nicht geklappt. Prüfe dein Internet.',
    )
  }
}

export const signOut = () => supabase.auth.signOut()

export async function loadProfile(userId: string): Promise<Profile> {
  const { data, error } = await supabase.from('profiles').select('*').eq('user_id', userId).single()
  fail(error)
  return data as Profile
}

export async function saveProfile(userId: string, patch: Partial<Profile>): Promise<void> {
  const { error } = await supabase.from('profiles').update(patch).eq('user_id', userId)
  fail(error)
}

function toItem(row: any): Item {
  return { ...row, price: row.price == null ? null : Number(row.price), colors: row.colors ?? [] }
}

export async function loadItems(): Promise<Item[]> {
  const { data, error } = await supabase.from('items').select('*').order('created_at', { ascending: false })
  fail(error)
  return (data ?? []).map(toItem)
}

export interface ItemImages {
  full: Blob
  thumb: Blob
  aspect: number
}

const ext = (b: Blob) => (b.type === 'image/webp' ? 'webp' : b.type === 'image/png' ? 'png' : 'jpg')

export async function insertItem(
  userId: string,
  attrs: ItemAttrs,
  images: ItemImages,
  extra: { is_wishlist: boolean; price?: number | null },
): Promise<Item> {
  const id = crypto.randomUUID()
  const image_path = `${userId}/${id}.${ext(images.full)}`
  const thumb_path = `${userId}/${id}_t.${ext(images.thumb)}`
  const opts = (b: Blob) => ({ contentType: b.type, cacheControl: '31536000' })
  fail((await supabase.storage.from(BUCKET).upload(image_path, images.full, opts(images.full))).error)
  fail((await supabase.storage.from(BUCKET).upload(thumb_path, images.thumb, opts(images.thumb))).error)
  const row = {
    id,
    image_path,
    thumb_path,
    aspect: images.aspect,
    ...attrs,
    is_wishlist: extra.is_wishlist,
    price: extra.price ?? null,
  }
  const { data, error } = await supabase.from('items').insert(row).select().single()
  if (error) {
    await supabase.storage.from(BUCKET).remove([image_path, thumb_path])
    throw new Error(error.message)
  }
  return toItem(data)
}

export async function updateItem(id: string, patch: Partial<Item>): Promise<Item> {
  const { data, error } = await supabase.from('items').update(patch).eq('id', id).select().single()
  fail(error)
  return toItem(data)
}

export async function deleteItem(item: Item): Promise<void> {
  fail((await supabase.from('items').delete().eq('id', item.id)).error)
  await supabase.storage.from(BUCKET).remove([item.image_path, item.thumb_path])
}

export async function loadOutfits(): Promise<Outfit[]> {
  const { data, error } = await supabase.from('outfits').select('*').order('date', { ascending: false }).limit(500)
  fail(error)
  return (data ?? []) as Outfit[]
}

export async function insertOutfit(o: Pick<Outfit, 'date' | 'item_ids' | 'source'> & Partial<Outfit>): Promise<Outfit> {
  const { data, error } = await supabase.from('outfits').insert(o).select().single()
  fail(error)
  return data as Outfit
}

export async function updateOutfit(id: string, patch: Partial<Outfit>): Promise<Outfit> {
  const { data, error } = await supabase.from('outfits').update(patch).eq('id', id).select().single()
  fail(error)
  return data as Outfit
}

export async function deleteOutfit(id: string): Promise<void> {
  fail((await supabase.from('outfits').delete().eq('id', id)).error)
}

export interface Invite {
  email: string
  is_admin: boolean
  code: string
}

/** Nur Admins bekommen hier Zeilen zurück; für alle anderen ist die Liste leer. */
export async function loadInvites(): Promise<Invite[]> {
  const { data, error } = await supabase.from('invites').select('email,is_admin,code').order('created_at')
  if (error) return []
  return (data ?? []) as Invite[]
}

export async function addInvite(email: string, invitedBy: string): Promise<void> {
  const clean = email.trim().toLowerCase()
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(clean)) throw new Error('Das ist keine gültige E-Mail-Adresse.')
  const { error } = await supabase.from('invites').insert({ email: clean, invited_by: invitedBy })
  if (error) throw new Error(error.code === '23505' ? 'Diese E-Mail ist schon eingeladen.' : error.message)
}

export async function removeInvite(email: string): Promise<void> {
  fail((await supabase.from('invites').delete().eq('email', email)).error)
}

export async function usageToday(userId: string, day: string): Promise<number> {
  const { data } = await supabase.from('analysis_usage').select('count').eq('user_id', userId).eq('day', day).maybeSingle()
  return data?.count ?? 0
}

// --- Bild-Adressen -------------------------------------------------------------------------
// Der Speicher ist privat. Bilder gibt es nur über signierte Adressen, die 7 Tage gelten.
// Wir merken sie uns, damit der Browser die Bilder aus seinem Cache nehmen kann.

const URL_TTL = 60 * 60 * 24 * 7
const URL_KEY = 'garderobe.urls'
type UrlCache = Record<string, { url: string; exp: number }>

function readCache(): UrlCache {
  try {
    return JSON.parse(localStorage.getItem(URL_KEY) ?? '{}')
  } catch {
    return {}
  }
}

export async function imageUrls(paths: string[]): Promise<Record<string, string>> {
  const now = Date.now() / 1000
  const cache = readCache()
  const out: Record<string, string> = {}
  const missing: string[] = []
  for (const p of new Set(paths)) {
    const hit = cache[p]
    if (hit && hit.exp - now > 86_400) out[p] = hit.url
    else missing.push(p)
  }
  for (let i = 0; i < missing.length; i += 200) {
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrls(missing.slice(i, i + 200), URL_TTL)
    fail(error)
    for (const d of data ?? []) {
      if (d.path && d.signedUrl) {
        out[d.path] = d.signedUrl
        cache[d.path] = { url: d.signedUrl, exp: now + URL_TTL }
      }
    }
  }
  if (missing.length) {
    for (const key of Object.keys(cache)) if (cache[key].exp < now) delete cache[key]
    try {
      localStorage.setItem(URL_KEY, JSON.stringify(cache))
    } catch {
      /* Speicher voll oder gesperrt: dann eben ohne Merken */
    }
  }
  return out
}
