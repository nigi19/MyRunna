import { beforeEach, describe, expect, it } from 'vitest'
import { rules } from '../core/config'
import { exampleHalfMarathon } from '../core/plan/examples'
import { generatePlan } from '../core/plan/generatePlan'
import { createRepository, type Repository } from './repository'
import { MemoryStore } from './store'
import { createSyncEngine, type SyncEngine, type SyncRemote } from './sync'
import { FakeRemote } from './testing/fakeRemote'

interface Device {
  repo: Repository
  sync: SyncEngine
}

/** A device with its own store and clock; clocks advance one second per call. */
function device(remote: SyncRemote, startIso: string, idPrefix: string): Device {
  const store = new MemoryStore()
  let t = Date.parse(startIso)
  let id = 0
  const now = () => new Date((t += 1000))
  return {
    repo: createRepository(store, { now, newId: () => `${idPrefix}-${++id}` }),
    sync: createSyncEngine(store, remote, now),
  }
}

const run = (date: string, km = 5) => ({
  date,
  source: 'manual' as const,
  distanceKm: km,
  durationS: km * 400,
})
const plan = generatePlan(exampleHalfMarathon)

describe('sync', () => {
  let remote: FakeRemote
  let phone: Device
  let laptop: Device

  beforeEach(async () => {
    remote = new FakeRemote()
    phone = device(remote, '2026-10-19T09:00:00Z', 'phone')
    laptop = device(remote, '2026-10-19T10:00:00Z', 'laptop')
    await phone.sync.useAccount('user-1')
    await laptop.sync.useAccount('user-1')
  })

  it('uploads existing local data when a device first connects', async () => {
    const solo = device(remote, '2026-10-19T09:00:00Z', 'solo')
    await solo.repo.savePlan(plan, rules)
    await solo.repo.addActivity(run('2026-10-27'))
    await solo.sync.useAccount('user-1')
    const result = await solo.sync.sync()
    expect(result.pushed).toBe(2)
    expect(remote.rows.size).toBe(2)
    expect(await solo.repo.pendingChanges()).toBe(0)
  })

  it('copies plans and runs to another device', async () => {
    const saved = await phone.repo.savePlan(plan, rules)
    const a = await phone.repo.addActivity(run('2026-10-27'))
    await phone.sync.sync()

    const result = await laptop.sync.sync()
    expect(result.pulled).toBe(2)
    expect(await laptop.repo.getActivePlan()).toEqual(saved)
    expect(await laptop.repo.listActivities()).toEqual([a])
  })

  it('propagates deletions instead of resurrecting them', async () => {
    const a = await phone.repo.addActivity(run('2026-10-27'))
    await phone.sync.sync()
    await laptop.sync.sync()

    await laptop.repo.deleteActivity(a.id)
    await laptop.sync.sync()
    await phone.sync.sync()

    expect(await phone.repo.listActivities()).toEqual([])
    expect(await laptop.repo.listActivities()).toEqual([])
  })

  it('keeps the newest edit when both devices change the same run', async () => {
    const a = await phone.repo.addActivity(run('2026-10-27'))
    await phone.sync.sync()
    await laptop.sync.sync()

    await phone.repo.updateActivity(a.id, { notes: 'phone edit' }) // earlier clock
    await laptop.repo.updateActivity(a.id, { notes: 'laptop edit' }) // later clock
    await laptop.sync.sync()
    await phone.sync.sync()
    await laptop.sync.sync()

    expect((await phone.repo.getActivity(a.id))?.notes).toBe('laptop edit')
    expect((await laptop.repo.getActivity(a.id))?.notes).toBe('laptop edit')
  })

  it('archives the old plan on every device when a new plan is made', async () => {
    const first = await phone.repo.savePlan(plan, rules)
    await phone.sync.sync()
    await laptop.sync.sync()
    const second = await laptop.repo.savePlan(plan, rules)
    await laptop.sync.sync()
    await phone.sync.sync()

    expect((await phone.repo.getActivePlan())?.id).toBe(second.id)
    const archived = (await phone.repo.listPlans()).find((p) => p.id === first.id)
    expect(archived?.status).toBe('archived')
  })

  it('keeps changes queued when the upload fails, and sends them later', async () => {
    await phone.repo.addActivity(run('2026-10-27'))
    remote.failNext = true
    await expect(phone.sync.sync()).rejects.toThrow('offline')
    expect(await phone.repo.pendingChanges()).toBe(1)

    await phone.sync.sync()
    expect(await phone.repo.pendingChanges()).toBe(0)
    await laptop.sync.sync()
    expect(await laptop.repo.listActivities()).toHaveLength(1)
  })

  it('does not let an older remote copy overwrite a newer unsynced local change', async () => {
    const a = await phone.repo.addActivity(run('2026-10-27'))
    await phone.sync.sync()
    await laptop.sync.sync()
    await laptop.repo.updateActivity(a.id, { rpe: 8 })
    // Pull only (push would send it first): simulate by syncing the phone, which writes nothing new.
    await phone.sync.sync()
    await laptop.sync.sync()
    expect((await laptop.repo.getActivity(a.id))?.rpe).toBe(8)
    await phone.sync.sync()
    expect((await phone.repo.getActivity(a.id))?.rpe).toBe(8)
  })

  it('ignores remote rows that fail validation', async () => {
    await remote.push([
      {
        kind: 'activity',
        id: 'bad',
        data: { id: 'bad', date: 'yesterday' },
        updated_at: '2026-10-20T00:00:00Z',
        deleted: false,
      },
    ])
    const result = await phone.sync.sync()
    expect(result.rejected).toBe(1)
    expect(await phone.repo.listActivities()).toEqual([])
  })

  it('pulls large histories in pages', async () => {
    for (let i = 0; i < 1200; i++) await phone.repo.addActivity(run('2026-10-27', 1 + (i % 10)))
    await phone.sync.sync()
    const result = await laptop.sync.sync()
    expect(result.pulled).toBe(1200)
    expect(await laptop.repo.listActivities()).toHaveLength(1200)
  })

  it('starts over when a different account signs in', async () => {
    await phone.repo.addActivity(run('2026-10-27'))
    await phone.sync.sync()
    expect(await phone.repo.pendingChanges()).toBe(0)
    await phone.sync.useAccount('user-2')
    expect(await phone.repo.pendingChanges()).toBe(1)
  })

  it('syncs a backup restore, including records it removes', async () => {
    const keep = await phone.repo.addActivity(run('2026-10-27'))
    const backup = await phone.repo.exportBackup()
    const extra = await phone.repo.addActivity(run('2026-10-28'))
    await phone.sync.sync()
    await laptop.sync.sync()

    await phone.repo.importBackup(backup)
    await phone.sync.sync()
    await laptop.sync.sync()
    expect((await laptop.repo.listActivities()).map((a) => a.id)).toEqual([keep.id])
    expect(await laptop.repo.getActivity(extra.id)).toBeUndefined()
  })

  it('never exports or restores device sync state', async () => {
    await phone.sync.sync()
    const backup = await phone.repo.exportBackup()
    expect(backup.meta.some((m) => m.key.startsWith('sync.'))).toBe(false)
    const before = await phone.sync.lastSyncedAt()
    await phone.repo.importBackup(backup)
    expect(await phone.sync.lastSyncedAt()).toBe(before)
  })
})
