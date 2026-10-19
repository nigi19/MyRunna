import type { CompletedActivity, StoredPlan } from './model'
import type { Store, SyncedKind } from './store'

export const TABLE_OF = { plan: 'plans', activity: 'activities' } as const satisfies Record<
  SyncedKind,
  string
>

export const outboxKey = (kind: SyncedKind, id: string) => `${kind}:${id}`

/** When a record last changed (plans saved before sync existed have no updatedAt). */
export const changedAtOf = (record: StoredPlan | CompletedActivity) => record.updatedAt ?? record.createdAt

/** Records a local change for the next push. Call inside the same transaction as the change. */
export function enqueue(store: Store, kind: SyncedKind, id: string, changedAt: string, deleted = false) {
  return store.put('outbox', { key: outboxKey(kind, id), kind, id, changedAt, deleted })
}

/** Queues every local record, e.g. when this device first connects to an account. */
export async function enqueueAll(store: Store) {
  await store.transaction(async () => {
    for (const p of await store.all('plans')) await enqueue(store, 'plan', p.id, changedAtOf(p))
    for (const a of await store.all('activities')) await enqueue(store, 'activity', a.id, changedAtOf(a))
  })
}

/** Meta keys that belong to this device only: never exported, synced or overwritten by a restore. */
export const isLocalMeta = (key: string) => key.startsWith('sync.')
