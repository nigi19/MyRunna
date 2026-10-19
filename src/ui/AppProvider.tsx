import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { rules } from '../core/config'
import type { ISODate } from '../core/dates'
import { generatePlan } from '../core/plan/generatePlan'
import type { Cloud } from '../cloud'
import type { CompletedActivity, Repository, StoredPlan } from '../data'
import { AppContext, type AppState } from './appContext'
import { localToday } from './lib/planQueries'
import { useCloudSync } from './useCloudSync'

interface Props {
  repo: Repository
  persistent?: boolean
  /** Injectable for tests; defaults to the device's local date. */
  today?: ISODate
  cloud?: Cloud
  /** Wait this long after a change before syncing, so quick edits go up together. */
  syncDelayMs?: number
  children: ReactNode
}

export function AppProvider({
  repo,
  persistent = true,
  today: fixedToday,
  cloud,
  syncDelayMs = 2000,
  children,
}: Props) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string>()
  const [active, setActive] = useState<StoredPlan>()
  const [activities, setActivities] = useState<CompletedActivity[]>([])
  const [today, setToday] = useState(fixedToday ?? localToday())

  const load = useCallback(async () => {
    try {
      const [plan, runs] = await Promise.all([repo.getActivePlan(), repo.listActivities()])
      setActive(plan)
      setActivities(runs)
      setError(undefined)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [repo])

  const { state: cloudState, schedule } = useCloudSync(cloud, repo, load, syncDelayMs)

  /** After a local change: refresh the screens and queue a sync. */
  const changed = useCallback(async () => {
    await load()
    schedule()
  }, [load, schedule])

  // Initial load from storage (an external system, hence an effect).
  useEffect(() => {
    let cancelled = false
    Promise.all([repo.getActivePlan(), repo.listActivities()])
      .then(([plan, runs]) => {
        if (cancelled) return
        setActive(plan)
        setActivities(runs)
      })
      .catch((e: unknown) => !cancelled && setError(e instanceof Error ? e.message : String(e)))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [repo])

  // Keep "today" right when the app stays open past midnight or comes back from the background.
  useEffect(() => {
    if (fixedToday) return
    const refresh = () => setToday(localToday())
    const timer = setInterval(refresh, 60_000)
    document.addEventListener('visibilitychange', refresh)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', refresh)
    }
  }, [fixedToday])

  const value = useMemo<AppState>(
    () => ({
      repo,
      persistent,
      loading,
      error,
      active,
      activities,
      today,
      async createPlan(inputs) {
        const stored = await repo.savePlan(generatePlan(inputs, rules), rules)
        await changed()
        return stored
      },
      async logRun(run) {
        const saved = await repo.addActivity(run)
        await changed()
        return saved
      },
      async deleteRun(id) {
        await repo.deleteActivity(id)
        await changed()
      },
      reload: changed,
      cloud: cloudState,
    }),
    [repo, persistent, loading, error, active, activities, today, changed, cloudState],
  )

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}
