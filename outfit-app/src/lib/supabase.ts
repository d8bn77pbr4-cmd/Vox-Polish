import { createClient } from '@supabase/supabase-js'

// Adresse und öffentlicher Schlüssel des Supabase-Projekts „kleiderschrank“. Der Schlüssel darf
// im Browser stehen: Was jemand damit lesen oder schreiben darf, regeln die Zugriffsregeln (RLS).
export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL ?? 'https://hsrlutussqelcskbqarj.supabase.co'
export const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_KEY ?? 'sb_publishable_JN_rTUswpDu9y3h5b5lYWw_hDgIAh8E'

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)
