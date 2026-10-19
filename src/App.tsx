import { useState } from 'react'
import type { PlannedSession } from './core/plan/types'
import { useApp } from './ui/appContext'
import { LogScreen, type LogPrefill } from './ui/screens/LogScreen'
import { PacesScreen } from './ui/screens/PacesScreen'
import { PlanScreen } from './ui/screens/PlanScreen'
import { SettingsScreen } from './ui/screens/SettingsScreen'
import { SetupWizard } from './ui/screens/SetupWizard'
import { TodayScreen } from './ui/screens/TodayScreen'

type Tab = 'today' | 'plan' | 'log' | 'paces' | 'settings'

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'today', label: 'Today', icon: '●' },
  { id: 'plan', label: 'Plan', icon: '▦' },
  { id: 'log', label: 'Log', icon: '＋' },
  { id: 'paces', label: 'Paces', icon: '⏱' },
  { id: 'settings', label: 'Settings', icon: '⚙' },
]

export default function App() {
  const { loading, error, active } = useApp()
  const [tab, setTab] = useState<Tab>('today')
  const [wizard, setWizard] = useState(false)
  const [logPrefill, setLogPrefill] = useState<LogPrefill>()

  const go = (next: Tab) => {
    if (next !== 'log') setLogPrefill(undefined)
    setTab(next)
    window.scrollTo?.(0, 0)
  }

  const logSession = (s?: PlannedSession) => {
    setLogPrefill(s ? { date: s.date, distanceKm: s.distanceKm } : undefined)
    setTab('log')
  }

  let content
  if (loading) {
    content = <p className="pt-20 text-center text-zinc-500">Loading…</p>
  } else if (error) {
    content = (
      <p role="alert" className="pt-20 text-center text-rose-600">
        Could not open storage: {error}
      </p>
    )
  } else if (!active || wizard) {
    content = (
      <SetupWizard
        initial={wizard ? active?.plan.inputs : undefined}
        onDone={() => {
          setWizard(false)
          go('today')
        }}
        onCancel={active ? () => setWizard(false) : undefined}
      />
    )
  } else {
    content = {
      today: <TodayScreen onLog={logSession} />,
      plan: <PlanScreen />,
      // Re-mount the form when a different session is being logged.
      log: <LogScreen key={logPrefill?.date ?? 'blank'} prefill={logPrefill} />,
      paces: <PacesScreen />,
      settings: <SettingsScreen onNewPlan={() => setWizard(true)} />,
    }[tab]
  }

  const showNav = !loading && !error && active && !wizard

  return (
    <div className="mx-auto min-h-dvh max-w-md">
      <main className={`px-4 pt-[max(1rem,env(safe-area-inset-top))] ${showNav ? 'pb-28' : 'pb-8'}`}>
        {content}
      </main>
      {showNav && (
        <nav
          aria-label="Main"
          className="fixed inset-x-0 bottom-0 border-t border-zinc-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/95"
        >
          <ul className="mx-auto grid max-w-md grid-cols-5">
            {TABS.map((t) => (
              <li key={t.id}>
                <button
                  type="button"
                  aria-current={tab === t.id ? 'page' : undefined}
                  onClick={() => go(t.id)}
                  className={`flex w-full flex-col items-center gap-0.5 py-2 text-xs ${
                    tab === t.id ? 'font-semibold text-emerald-600 dark:text-emerald-400' : 'text-zinc-500'
                  }`}
                >
                  <span aria-hidden className="text-lg leading-none">
                    {t.icon}
                  </span>
                  {t.label}
                </button>
              </li>
            ))}
          </ul>
        </nav>
      )}
    </div>
  )
}
