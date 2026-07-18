import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey)

let client: SupabaseClient | null = null

/**
 * Returns the shared Supabase client. The app checks `isSupabaseConfigured`
 * before rendering anything that talks to the database, so this only throws
 * if a code path skips that guard.
 */
export function getSupabaseClient(): SupabaseClient {
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      'Supabase is not configured. Copy .env.example to .env.local and fill in the values.',
    )
  }
  client ??= createClient(supabaseUrl, supabaseAnonKey)
  return client
}
