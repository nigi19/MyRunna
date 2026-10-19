import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { rules } from '../core/config'
import { rulesHash } from '../core/config/hash'
import { exampleHalfMarathon } from '../core/plan/examples'
import { generatePlan } from '../core/plan/generatePlan'
import { BackupError, backupFileName, backupToJson, parseBackup } from './backup'
import { DexieStore } from './dexieStore'
import { createRepository, NotFoundError, type Repository } from './repository'
import { MemoryStore, type Store } from './store'

const plan = generatePlan(exampleHalfMarathon)

let dbCounter = 0
const stores: [string, () => Store][] = [
  ['MemoryStore', () => new MemoryStore()],
  ['DexieStore (IndexedDB)', () => new DexieStore(`test-${++dbCounter}`)],
]

/** Deterministic clock and ids: each call moves one second / one id forward. */
function testRepo(store: Store): Repository {
  let t = Date.parse('2026-10-19T08:00:00Z')
  let id = 0
  return createRepository(store, { now: () => new Date((t += 1000)), newId: () => `id-${++id}` })
}

const run = (date: string, extra: object = {}) => ({
  date,
  source: 'manual' as const,
  distanceKm: 5,
  durationS: 40 * 60,
  ...extra,
})

describe.each(stores)('repository on %s', (_name, makeStore) => {
  let repo: Repository
  beforeEach(() => {
    repo = testRepo(makeStore())
  })

  describe('plans', () => {
    it('starts empty', async () => {
      expect(await repo.getActivePlan()).toBeUndefined()
      expect(await repo.listPlans()).toEqual([])
    })

    it('saves a plan as active with the rules fingerprint', async () => {
      const saved = await repo.savePlan(plan, rules)
      expect(saved.status).toBe('active')
      expect(saved.rulesHash).toBe(rulesHash(rules))
      expect(await repo.getActivePlan()).toEqual(saved)
    })

    it('archives the previous plan when a new one is saved', async () => {
      const first = await repo.savePlan(plan, rules)
      const second = await repo.savePlan(plan, rules)
      expect((await repo.getActivePlan())?.id).toBe(second.id)
      const all = await repo.listPlans()
      expect(all.map((p) => [p.id, p.status])).toEqual([
        [second.id, 'active'],
        [first.id, 'archived'],
      ])
    })

    it('unlinks runs when their plan is deleted, keeping the runs', async () => {
      const saved = await repo.savePlan(plan, rules)
      const a = await repo.addActivity(
        run('2026-10-27', { plannedSession: { planId: saved.id, date: '2026-10-27' } }),
      )
      await repo.deletePlan(saved.id)
      expect(await repo.listPlans()).toEqual([])
      expect((await repo.getActivity(a.id))?.plannedSession).toBeUndefined()
    })
  })

  describe('activities', () => {
    it('adds runs with id and timestamps', async () => {
      const a = await repo.addActivity(run('2026-10-27', { rpe: 6, notes: 'felt good' }))
      expect(a.id).toBeTruthy()
      expect(a.createdAt).toBe(a.updatedAt)
      expect(await repo.getActivity(a.id)).toEqual(a)
    })

    it('lists oldest first, filtered by inclusive date range', async () => {
      await repo.addActivity(run('2026-10-31'))
      await repo.addActivity(run('2026-10-27'))
      await repo.addActivity(run('2026-11-03'))
      expect((await repo.listActivities()).map((a) => a.date)).toEqual([
        '2026-10-27',
        '2026-10-31',
        '2026-11-03',
      ])
      expect(
        (await repo.listActivities({ from: '2026-10-27', to: '2026-10-31' })).map((a) => a.date),
      ).toEqual(['2026-10-27', '2026-10-31'])
    })

    it('does not import the same external activity twice', async () => {
      const first = await repo.addActivity(run('2026-10-27', { source: 'strava', externalId: '123' }))
      const again = await repo.addActivity(
        run('2026-10-27', { source: 'strava', externalId: '123', distanceKm: 9 }),
      )
      expect(again).toEqual(first)
      expect(await repo.listActivities()).toHaveLength(1)
    })

    it('rejects invalid runs', async () => {
      await expect(repo.addActivity(run('27-10-2026'))).rejects.toThrow()
      await expect(repo.addActivity(run('2026-10-27', { rpe: 11 }))).rejects.toThrow()
      await expect(repo.addActivity(run('2026-10-27', { distanceKm: -1 }))).rejects.toThrow()
      expect(await repo.listActivities()).toEqual([])
    })

    it('updates and deletes runs', async () => {
      const a = await repo.addActivity(run('2026-10-27'))
      const updated = await repo.updateActivity(a.id, { rpe: 4 })
      expect(updated.rpe).toBe(4)
      expect(updated.updatedAt > a.updatedAt).toBe(true)
      await expect(repo.updateActivity(a.id, { rpe: 0 })).rejects.toThrow()
      expect((await repo.getActivity(a.id))?.rpe).toBe(4)
      await repo.deleteActivity(a.id)
      expect(await repo.getActivity(a.id)).toBeUndefined()
      await expect(repo.updateActivity(a.id, { rpe: 5 })).rejects.toThrow(NotFoundError)
    })
  })

  describe('meta', () => {
    it('stores key/value settings', async () => {
      expect(await repo.getMeta('lastSync')).toBeUndefined()
      await repo.setMeta('lastSync', '2026-10-19T08:00:00Z')
      expect(await repo.getMeta('lastSync')).toBe('2026-10-19T08:00:00Z')
    })
  })

  describe('backup', () => {
    it('round-trips everything through JSON', async () => {
      const saved = await repo.savePlan(plan, rules)
      await repo.addActivity(run('2026-10-27', { plannedSession: { planId: saved.id, date: '2026-10-27' } }))
      await repo.setMeta('units', 'km')
      const backup = await repo.exportBackup()
      const json = backupToJson(backup)

      const restored = testRepo(makeStore())
      expect(await restored.importBackup(json)).toEqual({ plans: 1, activities: 1 })
      expect(await restored.getActivePlan()).toEqual(saved)
      expect(await restored.listActivities()).toEqual(await repo.listActivities())
      expect(await restored.getMeta('units')).toBe('km')
      expect(backupFileName(backup)).toMatch(/^myrunna-backup-\d{4}-\d{2}-\d{2}\.json$/)
    })

    it('replaces existing data on import', async () => {
      await repo.addActivity(run('2026-10-27'))
      const empty = await testRepo(makeStore()).exportBackup()
      await repo.importBackup(empty)
      expect(await repo.listActivities()).toEqual([])
    })

    it('changes nothing when the backup is invalid', async () => {
      const a = await repo.addActivity(run('2026-10-27'))
      await expect(repo.importBackup('{"app":"other"}')).rejects.toThrow(BackupError)
      await expect(repo.importBackup('not json')).rejects.toThrow(/not valid JSON/)
      expect(await repo.listActivities()).toEqual([a])
    })
  })
})

describe('backup validation', () => {
  const valid = async () => {
    const repo = testRepo(new MemoryStore())
    const saved = await repo.savePlan(plan, rules)
    await repo.addActivity(run('2026-10-27', { plannedSession: { planId: saved.id, date: '2026-10-27' } }))
    return JSON.parse(backupToJson(await repo.exportBackup()))
  }

  it('accepts a fresh export', async () => {
    expect(parseBackup(await valid()).plans).toHaveLength(1)
  })

  it.each([
    ['a newer format', (b: any) => (b.format = 2), 'format'],
    ['a broken activity', (b: any) => (b.activities[0].date = 'yesterday'), 'activities.0.date'],
    [
      'invalid plan inputs',
      (b: any) => (b.plans[0].plan.inputs.daysPerWeek = 9),
      'plans.0.plan.inputs.daysPerWeek',
    ],
    [
      'a run linked to a missing plan',
      (b: any) => (b.activities[0].plannedSession.planId = 'gone'),
      'activities.0.plannedSession',
    ],
    [
      'two active plans',
      (b: any) => b.plans.push({ ...b.plans[0], id: 'other' }),
      'plans: more than one active',
    ],
    ['duplicate activity ids', (b: any) => b.activities.push(b.activities[0]), 'activities: duplicate ids'],
  ])('rejects %s', async (_label, edit, issue) => {
    const backup = await valid()
    edit(backup)
    try {
      parseBackup(backup)
      expect.unreachable()
    } catch (e) {
      expect(e).toBeInstanceOf(BackupError)
      expect((e as BackupError).issues.some((i) => i.startsWith(issue))).toBe(true)
    }
  })
})

describe('rulesHash', () => {
  it('ignores key order and changes with any value', () => {
    expect(rulesHash({ a: 1, b: [1, 2] })).toBe(rulesHash({ b: [1, 2], a: 1 }))
    expect(rulesHash({ ...rules, intensity: { maxHardShare: 0.25 } })).not.toBe(rulesHash(rules))
  })
})
