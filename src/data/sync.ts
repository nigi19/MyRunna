import { activitySchema, storedPlanSchema, type CompletedActivity, type StoredPlan } from './model'
import { changedAtOf, enqueueAll, outboxKey, TABLE_OF } from './outbox'
import type { Store, SyncedKind } from './store'

/** One record as stored in the cloud (`public.records`, see supabase/migrations). */
export interface RemoteRow {
  kind: SyncedKind
  id: string
  /** The full record, or null for a deletion. */
  data: unknown
  /** When the record last changed on a device: last write wins. */
  updated_at: string
  deleted: boolean
}

export interface PulledRow extends RemoteRow {
  /** Set by the server on every write; the pull cursor. */
  server_updated_at: string
}

/** The cloud side of sync. Supabase implements it; tests use an in-memory fake. */
export interface SyncRemote {
  /** Upserts rows; the server keeps whichever version has the newer `updated_at`. */
  push(rows: RemoteRow[]): Promise<void>
  /** Rows written after `cursor` (exclusive), oldest first, at most `limit`. */
  pull(cursor: string | undefined, limit: number): Promise<PulledRow[]>
}

export interface SyncResult {
  pushed: number
  pulled: number
  /** Remote rows ignored because they failed validation. */
  rejected: number
}

const CURSOR = 'sync.cursor'
const ACCOUNT = 'sync.account'
const LAST_SYNC = 'sync.lastSyncedAt'
const PUSH_BATCH = 200
const PULL_PAGE = 500
/** Re-read a little before the cursor each sync: merging is idempotent, missing a row is not. */
const CURSOR_OVERLAP_MS = 60_000

const ms = (iso: string) => Date.parse(iso)

const getMeta = async <T>(store: Store, key: string) => (await store.get('meta', key))?.value as T | undefined
const setMeta = (store: Store, key: string, value: unknown) => store.put('meta', { key, value })

export interface SyncEngine {
  /**
   * Links this device to an account. When the account differs from the last
   * one, all local data is queued for upload and the pull starts from scratch.
   */
  useAccount(accountId: string): Promise<void>
  /** Push local changes, then pull remote ones. */
  sync(): Promise<SyncResult>
  lastSyncedAt(): Promise<string | undefined>
  /** Forget the account link (data stays on the device). */
  signOut(): Promise<void>
}

export function createSyncEngine(store: Store, remote: SyncRemote, now = () => new Date()): SyncEngine {
  async function push(): Promise<number> {
    const entries = await store.all('outbox')
    let pushed = 0
    for (let i = 0; i < entries.length; i += PUSH_BATCH) {
      const batch = entries.slice(i, i + PUSH_BATCH)
      const rows: RemoteRow[] = []
      for (const e of batch) {
        const record = e.deleted ? undefined : await store.get(TABLE_OF[e.kind], e.id)
        rows.push(
          record
            ? { kind: e.kind, id: e.id, data: record, updated_at: changedAtOf(record), deleted: false }
            : { kind: e.kind, id: e.id, data: null, updated_at: e.changedAt, deleted: true },
        )
      }
      await remote.push(rows)
      // Clear only entries that did not change again while we were pushing.
      await store.transaction(async () => {
        for (const e of batch) {
          const current = await store.get('outbox', e.key)
          if (current && current.changedAt === e.changedAt && current.deleted === e.deleted) {
            await store.delete('outbox', e.key)
          }
        }
      })
      pushed += batch.length
    }
    return pushed
  }

  async function apply(row: PulledRow): Promise<'applied' | 'skipped' | 'rejected'> {
    const table = TABLE_OF[row.kind]
    const remoteTime = ms(row.updated_at)
    const pending = await store.get('outbox', outboxKey(row.kind, row.id))
    if (pending && ms(pending.changedAt) > remoteTime) return 'skipped' // our newer change goes up next push
    const local = (await store.get(table, row.id)) as StoredPlan | CompletedActivity | undefined
    if (local && ms(changedAtOf(local)) > remoteTime) return 'skipped'

    if (row.deleted) {
      await store.delete(table, row.id)
    } else {
      const parsed = (row.kind === 'plan' ? storedPlanSchema : activitySchema).safeParse(row.data)
      if (!parsed.success || (parsed.data as { id: string }).id !== row.id) return 'rejected'
      await store.put(table, row.data as StoredPlan & CompletedActivity)
    }
    if (pending) await store.delete('outbox', pending.key)
    return 'applied'
  }

  async function pull(): Promise<{ pulled: number; rejected: number }> {
    const saved = await getMeta<string>(store, CURSOR)
    let cursor = saved ? new Date(ms(saved) - CURSOR_OVERLAP_MS).toISOString() : undefined
    let pulled = 0
    let rejected = 0
    for (;;) {
      const rows = await remote.pull(cursor, PULL_PAGE)
      if (rows.length === 0) break
      await store.transaction(async () => {
        for (const row of rows) {
          const result = await apply(row)
          if (result === 'applied') pulled++
          if (result === 'rejected') rejected++
        }
        cursor = rows[rows.length - 1].server_updated_at
        await setMeta(store, CURSOR, cursor)
      })
      if (rows.length < PULL_PAGE) break
    }
    return { pulled, rejected }
  }

  return {
    async useAccount(accountId) {
      if ((await getMeta<string>(store, ACCOUNT)) === accountId) return
      await store.transaction(async () => {
        await setMeta(store, ACCOUNT, accountId)
        await store.delete('meta', CURSOR)
      })
      await enqueueAll(store)
    },

    async sync() {
      const pushed = await push()
      const { pulled, rejected } = await pull()
      await setMeta(store, LAST_SYNC, now().toISOString())
      return { pushed, pulled, rejected }
    },

    lastSyncedAt: () => getMeta<string>(store, LAST_SYNC),

    async signOut() {
      await store.transaction(async () => {
        await store.delete('meta', ACCOUNT)
        await store.delete('meta', CURSOR)
        await store.delete('meta', LAST_SYNC)
      })
    },
  }
}
