import { createContext, useContext } from 'react'
import type { ISODate } from '../core/dates'
import type { PlanInputs } from '../core/plan/types'
import type { CompletedActivity, NewActivity, Repository, StoredPlan } from '../data'
import type { CloudState } from './useCloudSync'

export interface AppState {
  repo: Repository
  /** False when data lives only in memory (e.g. private browsing). */
  persistent: boolean
  loading: boolean
  error?: string
  active?: StoredPlan
  activities: CompletedActivity[]
  today: ISODate
  createPlan(inputs: PlanInputs): Promise<StoredPlan>
  logRun(run: NewActivity): Promise<CompletedActivity>
  deleteRun(id: string): Promise<void>
  /** Re-reads everything from storage (e.g. after a backup import) and schedules a sync. */
  reload(): Promise<void>
  /** Cloud sync; undefined when this build has no Supabase settings. */
  cloud?: CloudState
}

export const AppContext = createContext<AppState | null>(null)

export function useApp(): AppState {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be used inside <AppProvider>')
  return ctx
}
