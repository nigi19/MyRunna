import { Dexie, type Table } from 'dexie'
import type { CompletedActivity, StoredPlan } from './model'
import type { MetaEntry, Snapshot, Store, TableName, Tables } from './store'

class MyRunnaDb extends Dexie {
  plans!: Table<StoredPlan, string>
  activities!: Table<CompletedActivity, string>
  meta!: Table<MetaEntry, string>

  constructor(name: string) {
    super(name)
    // Add a new version() call for every schema change; never edit an old one.
    this.version(1).stores({
      plans: 'id, status, createdAt',
      activities: 'id, date, externalId',
      meta: 'key',
    })
  }
}

/** IndexedDB store via Dexie: the app's offline, on-device database. */
export class DexieStore implements Store {
  readonly db: MyRunnaDb

  constructor(name = 'myrunna') {
    this.db = new MyRunnaDb(name)
  }

  private table<T extends TableName>(table: T): Table<Tables[T], string> {
    return this.db.table(table)
  }

  all<T extends TableName>(table: T) {
    return this.table(table).toArray()
  }

  get<T extends TableName>(table: T, key: string) {
    return this.table(table).get(key)
  }

  async put<T extends TableName>(table: T, value: Tables[T]) {
    await this.table(table).put(value)
  }

  async delete(table: TableName, key: string) {
    await this.table(table).delete(key)
  }

  transaction<R>(fn: () => Promise<R>): Promise<R> {
    return this.db.transaction('rw', this.db.plans, this.db.activities, this.db.meta, fn)
  }

  replaceAll(snapshot: Snapshot) {
    return this.transaction(async () => {
      await Promise.all([this.db.plans.clear(), this.db.activities.clear(), this.db.meta.clear()])
      await this.db.plans.bulkPut(snapshot.plans)
      await this.db.activities.bulkPut(snapshot.activities)
      await this.db.meta.bulkPut(snapshot.meta)
    })
  }
}

/**
 * Asks the browser not to evict our data under storage pressure (Safari can
 * otherwise clear it after weeks of not opening the app). Returns whether
 * storage is persistent.
 */
export async function requestPersistentStorage(): Promise<boolean> {
  if (typeof navigator === 'undefined' || !navigator.storage?.persist) return false
  if (await navigator.storage.persisted()) return true
  return navigator.storage.persist()
}
