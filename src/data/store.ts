import type { CompletedActivity, StoredPlan } from './model'

export interface MetaEntry {
  key: string
  value: unknown
}

export interface Tables {
  plans: StoredPlan
  activities: CompletedActivity
  meta: MetaEntry
}

export type TableName = keyof Tables

export type Snapshot = { [T in TableName]: Tables[T][] }

/**
 * Minimal storage backend. The repository holds all logic; a store only
 * reads and writes records. Keys: plans.id, activities.id, meta.key.
 */
export interface Store {
  all<T extends TableName>(table: T): Promise<Tables[T][]>
  get<T extends TableName>(table: T, key: string): Promise<Tables[T] | undefined>
  put<T extends TableName>(table: T, value: Tables[T]): Promise<void>
  delete(table: TableName, key: string): Promise<void>
  /** Runs `fn` atomically across all tables: all of its writes happen, or none. */
  transaction<R>(fn: () => Promise<R>): Promise<R>
  /** Replaces every table's contents (used by backup restore). */
  replaceAll(data: Snapshot): Promise<void>
}

export const keyOf = (table: TableName, value: Tables[TableName]): string =>
  table === 'meta' ? (value as MetaEntry).key : (value as StoredPlan | CompletedActivity).id

/** In-memory store: used in tests and when IndexedDB is unavailable (e.g. private browsing). */
export class MemoryStore implements Store {
  private data: { [T in TableName]: Map<string, Tables[T]> } = {
    plans: new Map(),
    activities: new Map(),
    meta: new Map(),
  }

  async all<T extends TableName>(table: T) {
    return [...this.data[table].values()].map((v) => structuredClone(v)) as Tables[T][]
  }

  async get<T extends TableName>(table: T, key: string) {
    const value = this.data[table].get(key)
    return value === undefined ? undefined : (structuredClone(value) as Tables[T])
  }

  async put<T extends TableName>(table: T, value: Tables[T]) {
    ;(this.data[table] as Map<string, Tables[T]>).set(keyOf(table, value), structuredClone(value))
  }

  async delete(table: TableName, key: string) {
    this.data[table].delete(key)
  }

  async transaction<R>(fn: () => Promise<R>): Promise<R> {
    const before = structuredClone(this.data)
    try {
      return await fn()
    } catch (e) {
      this.data = before
      throw e
    }
  }

  async replaceAll(snapshot: Snapshot) {
    this.data = {
      plans: new Map(snapshot.plans.map((p) => [p.id, structuredClone(p)])),
      activities: new Map(snapshot.activities.map((a) => [a.id, structuredClone(a)])),
      meta: new Map(snapshot.meta.map((m) => [m.key, structuredClone(m)])),
    }
  }
}
