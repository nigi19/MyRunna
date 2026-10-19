import { rulesHash } from '../core/config/hash'
import type { ISODate } from '../core/dates'
import type { Plan } from '../core/plan/types'
import { BACKUP_FORMAT, parseBackup, type Backup } from './backup'
import {
  activitySchema,
  newActivitySchema,
  type CompletedActivity,
  type NewActivity,
  type StoredPlan,
} from './model'
import { enqueue, enqueueAll, isLocalMeta } from './outbox'
import type { Store } from './store'

export class NotFoundError extends Error {}

export interface DateRange {
  from?: ISODate
  to?: ISODate
}

/** Everything the app reads and writes goes through this interface. */
export interface Repository {
  getActivePlan(): Promise<StoredPlan | undefined>
  /** Newest first. */
  listPlans(): Promise<StoredPlan[]>
  /** Saves a plan as the active one; the previous active plan is archived, not deleted. */
  savePlan(plan: Plan, rules: unknown): Promise<StoredPlan>
  deletePlan(id: string): Promise<void>

  /** Oldest first; `from` and `to` are inclusive. */
  listActivities(range?: DateRange): Promise<CompletedActivity[]>
  getActivity(id: string): Promise<CompletedActivity | undefined>
  /** Adds a run. An activity with an `externalId` already stored is returned unchanged. */
  addActivity(input: NewActivity): Promise<CompletedActivity>
  updateActivity(id: string, patch: Partial<NewActivity>): Promise<CompletedActivity>
  deleteActivity(id: string): Promise<void>

  getMeta<T>(key: string): Promise<T | undefined>
  setMeta(key: string, value: unknown): Promise<void>

  exportBackup(): Promise<Backup>
  /** Validates the backup first; on any problem nothing is changed. Replaces all data. */
  importBackup(input: unknown): Promise<{ plans: number; activities: number }>
  /** Local changes not yet synced to the cloud. */
  pendingChanges(): Promise<number>
}

export interface RepositoryOptions {
  now?: () => Date
  newId?: () => string
}

export function createRepository(store: Store, options: RepositoryOptions = {}): Repository {
  const now = () => (options.now ?? (() => new Date()))().toISOString()
  const newId = options.newId ?? (() => crypto.randomUUID())

  const byNewest = (a: StoredPlan, b: StoredPlan) =>
    a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0

  return {
    async getActivePlan() {
      return (await store.all('plans')).filter((p) => p.status === 'active').sort(byNewest)[0]
    },

    async listPlans() {
      return (await store.all('plans')).sort(byNewest)
    },

    savePlan(plan, rules) {
      return store.transaction(async () => {
        const timestamp = now()
        for (const p of await store.all('plans')) {
          if (p.status === 'active') {
            await store.put('plans', { ...p, status: 'archived', updatedAt: timestamp })
            await enqueue(store, 'plan', p.id, timestamp)
          }
        }
        const stored: StoredPlan = {
          id: newId(),
          createdAt: timestamp,
          updatedAt: timestamp,
          status: 'active',
          rulesHash: rulesHash(rules),
          plan,
        }
        await store.put('plans', stored)
        await enqueue(store, 'plan', stored.id, timestamp)
        return stored
      })
    },

    deletePlan(id) {
      // Runs are kept; they just no longer count for a planned session.
      return store.transaction(async () => {
        const timestamp = now()
        for (const a of await store.all('activities')) {
          if (a.plannedSession?.planId === id) {
            const { plannedSession: _, ...rest } = a
            await store.put('activities', { ...rest, updatedAt: timestamp })
            await enqueue(store, 'activity', a.id, timestamp)
          }
        }
        await store.delete('plans', id)
        await enqueue(store, 'plan', id, timestamp, true)
      })
    },

    async listActivities(range = {}) {
      return (await store.all('activities'))
        .filter((a) => (!range.from || a.date >= range.from) && (!range.to || a.date <= range.to))
        .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.createdAt < b.createdAt ? -1 : 1))
    },

    getActivity(id) {
      return store.get('activities', id)
    },

    async addActivity(input) {
      const fields = newActivitySchema.parse(input)
      return store.transaction(async () => {
        if (fields.externalId) {
          const existing = (await store.all('activities')).find(
            (a) => a.source === fields.source && a.externalId === fields.externalId,
          )
          if (existing) return existing
        }
        const timestamp = now()
        const activity: CompletedActivity = {
          ...fields,
          id: newId(),
          createdAt: timestamp,
          updatedAt: timestamp,
        }
        await store.put('activities', activity)
        await enqueue(store, 'activity', activity.id, timestamp)
        return activity
      })
    },

    updateActivity(id, patch) {
      return store.transaction(async () => {
        const current = await store.get('activities', id)
        if (!current) throw new NotFoundError(`No activity ${id}`)
        const updated = activitySchema.parse({ ...current, ...patch, id, updatedAt: now() })
        await store.put('activities', updated)
        await enqueue(store, 'activity', id, updated.updatedAt)
        return updated
      })
    },

    deleteActivity(id) {
      return store.transaction(async () => {
        await store.delete('activities', id)
        await enqueue(store, 'activity', id, now(), true)
      })
    },

    async getMeta<T>(key: string) {
      return (await store.get('meta', key))?.value as T | undefined
    },

    async setMeta(key, value) {
      await store.put('meta', { key, value })
    },

    async exportBackup() {
      const [plans, activities, meta] = await Promise.all([
        store.all('plans'),
        store.all('activities'),
        store.all('meta'),
      ])
      return {
        app: 'myrunna',
        format: BACKUP_FORMAT,
        exportedAt: now(),
        plans,
        activities,
        meta: meta.filter((m) => !isLocalMeta(m.key)),
      }
    },

    async pendingChanges() {
      return (await store.all('outbox')).length
    },

    async importBackup(input) {
      const backup = parseBackup(input)
      await store.transaction(async () => {
        // Records that disappear in the restore are deleted in the cloud too.
        const timestamp = now()
        const keepPlans = new Set(backup.plans.map((p) => p.id))
        const keepRuns = new Set(backup.activities.map((a) => a.id))
        const [plans, activities, meta] = await Promise.all([
          store.all('plans'),
          store.all('activities'),
          store.all('meta'),
        ])
        await store.replaceAll({
          plans: backup.plans,
          activities: backup.activities,
          // This device's sync state survives a restore.
          meta: [
            ...backup.meta.filter((m) => !isLocalMeta(m.key)),
            ...meta.filter((m) => isLocalMeta(m.key)),
          ],
        })
        for (const p of plans) if (!keepPlans.has(p.id)) await enqueue(store, 'plan', p.id, timestamp, true)
        for (const a of activities)
          if (!keepRuns.has(a.id)) await enqueue(store, 'activity', a.id, timestamp, true)
      })
      await enqueueAll(store)
      return { plans: backup.plans.length, activities: backup.activities.length }
    },
  }
}
