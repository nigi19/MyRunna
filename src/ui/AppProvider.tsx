import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { rules } from '../core/config'
import type { ISODate } from '../core/dates'
import { generatePlan } from '../core/plan/generatePlan'
import type { CompletedActivity, Repository, StoredPlan } from '../data'
import { AppContext, type AppState } from './appContext'
import { localToday } from './lib/planQueries'

interface Props {
  repo: Repository
  persistent?: boolean
  /** Injectable for tests; defaults to the device's local date. */
  today?: ISODate
  children: ReactNode
}

export function AppProvider({ repo, persistent = true, today: fixedToday, children }: Props) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string>()
  const [active, setActive] = useState<StoredPlan>()
  const [activities, setActivities] = useState<CompletedActivity[]>([])
  const [today, setToday] = useState(fixedToday ?? localToday())

  const reload = useCallback(async () => {
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
        await reload()
        return stored
      },
      async logRun(run) {
        const saved = await repo.addActivity(run)
        await reload()
        return saved
      },
      async deleteRun(id) {
        await repo.deleteActivity(id)
        await reload()
      },
      reload,
    }),
    [repo, persistent, loading, error, active, activities, today, reload],
  )

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}
