import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { PulledRow, RemoteRow, SyncRemote } from '../data/sync'
import type { CloudConfig } from './config'

export const createCloudClient = (config: CloudConfig): SupabaseClient =>
  createClient(config.url, config.publishableKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
  })

/** `public.records` + `sync_upsert`, as created by supabase/migrations/001_sync.sql. */
export function supabaseRemote(client: SupabaseClient): SyncRemote {
  return {
    async push(rows: RemoteRow[]) {
      const { error } = await client.rpc('sync_upsert', { rows })
      if (error) throw new Error(`Sync upload failed: ${error.message}`)
    },

    async pull(cursor, limit) {
      let query = client
        .from('records')
        .select('kind, id, data, updated_at, deleted, server_updated_at')
        .order('server_updated_at', { ascending: true })
        .limit(limit)
      if (cursor) query = query.gt('server_updated_at', cursor)
      const { data, error } = await query
      if (error) throw new Error(`Sync download failed: ${error.message}`)
      return (data ?? []) as PulledRow[]
    },
  }
}

export interface CloudAuth {
  /** The signed-in user, if any. */
  current(): Promise<{ id: string; email?: string } | undefined>
  /** Emails a 6-digit sign-in code (and a link). */
  sendCode(email: string): Promise<void>
  verifyCode(email: string, code: string): Promise<{ id: string; email?: string }>
  signOut(): Promise<void>
  onChange(listener: (user: { id: string; email?: string } | undefined) => void): () => void
}

export function supabaseAuth(client: SupabaseClient): CloudAuth {
  const toUser = (u: { id: string; email?: string } | null | undefined) =>
    u ? { id: u.id, email: u.email } : undefined
  return {
    async current() {
      const { data } = await client.auth.getSession()
      return toUser(data.session?.user)
    },
    async sendCode(email) {
      const { error } = await client.auth.signInWithOtp({
        email,
        options: { shouldCreateUser: true, emailRedirectTo: window.location.origin },
      })
      if (error) throw new Error(error.message)
    },
    async verifyCode(email, code) {
      const { data, error } = await client.auth.verifyOtp({ email, token: code.trim(), type: 'email' })
      if (error || !data.user) throw new Error(error?.message ?? 'Sign-in failed')
      return toUser(data.user)!
    },
    async signOut() {
      await client.auth.signOut()
    },
    onChange(listener) {
      const { data } = client.auth.onAuthStateChange((_event, session) => listener(toUser(session?.user)))
      return () => data.subscription.unsubscribe()
    },
  }
}
