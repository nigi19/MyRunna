import { DexieStore } from './dexieStore'
import { createRepository, type Repository } from './repository'
import { MemoryStore } from './store'

export * from './backup'
export * from './model'
export * from './repository'
export { requestPersistentStorage } from './dexieStore'

/**
 * The app's repository: IndexedDB when available, otherwise in-memory
 * (data then lasts only for this tab; `persistent` tells the UI to warn).
 */
export function openRepository(): { repo: Repository; persistent: boolean } {
  if (typeof indexedDB !== 'undefined') return { repo: createRepository(new DexieStore()), persistent: true }
  return { repo: createRepository(new MemoryStore()), persistent: false }
}
