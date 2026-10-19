import type { Store } from '../data/store'
import { createSyncEngine, type SyncEngine } from '../data/sync'
import { cloudConfigFromEnv } from './config'
import { createCloudClient, supabaseAuth, supabaseRemote, type CloudAuth } from './supabase'

export type { CloudAuth } from './supabase'

/** Everything the app needs for cloud sync: who is signed in, and the engine that syncs. */
export interface Cloud {
  auth: CloudAuth
  engine: SyncEngine
}

/** Cloud sync via Supabase, or undefined when the build has no Supabase settings. */
export function createCloud(store: Store): Cloud | undefined {
  const config = cloudConfigFromEnv()
  if (!config) return undefined
  const client = createCloudClient(config)
  return { auth: supabaseAuth(client), engine: createSyncEngine(store, supabaseRemote(client)) }
}
