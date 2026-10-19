import { z } from 'zod'
import { activitySchema, storedPlanSchema } from './model'
import type { Snapshot } from './store'

export const BACKUP_FORMAT = 1

export const backupSchema = z.object({
  app: z.literal('myrunna'),
  format: z.literal(BACKUP_FORMAT),
  exportedAt: z.string(),
  plans: z.array(storedPlanSchema),
  activities: z.array(activitySchema),
  meta: z.array(z.object({ key: z.string(), value: z.unknown() })),
})

export interface Backup extends Snapshot {
  app: 'myrunna'
  format: typeof BACKUP_FORMAT
  exportedAt: string
}

export class BackupError extends Error {
  readonly issues: string[]
  constructor(issues: string[]) {
    super(`Not a valid MyRunna backup:\n${issues.map((i) => `  • ${i}`).join('\n')}`)
    this.name = 'BackupError'
    this.issues = issues
  }
}

export const backupToJson = (backup: Backup) => JSON.stringify(backup, null, 2)

/** Suggested download name, e.g. myrunna-backup-2026-10-19.json */
export const backupFileName = (backup: Backup) => `myrunna-backup-${backup.exportedAt.slice(0, 10)}.json`

/** Parses and validates a backup (JSON text or an already-parsed object). */
export function parseBackup(input: unknown): Backup {
  let data = input
  if (typeof input === 'string') {
    try {
      data = JSON.parse(input)
    } catch {
      throw new BackupError(['file is not valid JSON'])
    }
  }
  const result = backupSchema.safeParse(data)
  if (!result.success) {
    throw new BackupError(
      result.error.issues
        .slice(0, 10)
        .map((i) => `${i.path.length ? i.path.join('.') : '(root)'}: ${i.message}`),
    )
  }
  // Plans are only shape-checked (see model.ts), so the full Plan type is asserted here.
  const backup = result.data as unknown as Backup
  const problems: string[] = []
  const planIds = new Set(backup.plans.map((p) => p.id))
  if (planIds.size !== backup.plans.length) problems.push('plans: duplicate ids')
  if (new Set(backup.activities.map((a) => a.id)).size !== backup.activities.length) {
    problems.push('activities: duplicate ids')
  }
  if (backup.plans.filter((p) => p.status === 'active').length > 1)
    problems.push('plans: more than one active plan')
  backup.activities.forEach((a, i) => {
    if (a.plannedSession && !planIds.has(a.plannedSession.planId)) {
      problems.push(`activities.${i}.plannedSession: unknown plan ${a.plannedSession.planId}`)
    }
  })
  if (problems.length) throw new BackupError(problems)
  return backup
}
