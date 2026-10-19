import { DexieStore } from './dexieStore'
import { createRepository, type Repository } from './repository'
import { MemoryStore, type Store } from './store'

export * from './backup'
export * from './model'
export * from './repository'
export { requestPersistentStorage } from './dexieStore'

/**
 * The app's repository: IndexedDB when available, otherwise in-memory
 * (data then lasts only for this tab; `persistent` tells the UI to warn).
 */
export function openRepository(): { repo: Repository; store: Store; persistent: boolean } {
  const persistent = typeof indexedDB !== 'undefined'
  const store: Store = persistent ? new DexieStore() : new MemoryStore()
  return { repo: createRepository(store), store, persistent }
}
