import { useRef, useState } from 'react'
import { rules } from '../../core/config'
import { rulesHash } from '../../core/config/hash'
import { backupFileName, backupToJson, BackupError } from '../../data'
import { useApp } from '../appContext'
import { Button, Card } from '../components/ui'
import { formatDate } from '../lib/labels'

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  URL.revokeObjectURL(url)
}

export function SettingsScreen({ onNewPlan }: { onNewPlan: () => void }) {
  const { repo, active, activities, persistent, reload } = useApp()
  const fileInput = useRef<HTMLInputElement>(null)
  const [message, setMessage] = useState<{ ok: boolean; text: string }>()
  const currentHash = rulesHash(rules)

  async function exportBackup() {
    const backup = await repo.exportBackup()
    download(backupFileName(backup), backupToJson(backup))
    setMessage({
      ok: true,
      text: `Exported ${backup.plans.length} plan(s) and ${backup.activities.length} run(s).`,
    })
  }

  async function importBackup(file: File) {
    if (!confirm('Replace ALL data in this app with the backup?')) return
    try {
      const result = await repo.importBackup(await file.text())
      await reload()
      setMessage({ ok: true, text: `Restored ${result.plans} plan(s) and ${result.activities} run(s).` })
    } catch (e) {
      const text = e instanceof BackupError ? e.issues.join('; ') : e instanceof Error ? e.message : String(e)
      setMessage({ ok: false, text: `Nothing changed. ${text}` })
    }
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Settings</h1>

      {active && (
        <Card className="space-y-3">
          <h2 className="font-semibold">Plan</h2>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Created {formatDate(active.createdAt.slice(0, 10))} · race {formatDate(active.plan.raceDate)} ·
            rules <code>{active.rulesHash}</code>
          </p>
          {active.rulesHash !== currentHash && (
            <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-100">
              planRules.ts has changed since this plan was made (now <code>{currentHash}</code>). Make a new
              plan to apply the new rules.
            </p>
          )}
          <Button variant="secondary" onClick={onNewPlan}>
            New plan / change setup
          </Button>
        </Card>
      )}

      <Card className="space-y-3">
        <h2 className="font-semibold">Backup</h2>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Your data lives on this device only. {activities.length} run(s) stored.
          {!persistent && ' ⚠️ Storage is temporary in this browser mode: export a backup!'}
        </p>
        <div className="flex gap-3">
          <Button variant="secondary" onClick={exportBackup}>
            Export backup
          </Button>
          <Button variant="secondary" onClick={() => fileInput.current?.click()}>
            Import backup
          </Button>
          <input
            ref={fileInput}
            type="file"
            accept="application/json,.json"
            className="hidden"
            aria-label="Backup file"
            onChange={(e) => {
              const file = e.target.files?.[0]
              e.target.value = ''
              if (file) void importBackup(file)
            }}
          />
        </div>
        {message && (
          <p
            role="status"
            className={`text-sm ${message.ok ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-600'}`}
          >
            {message.text}
          </p>
        )}
      </Card>

      <Card className="space-y-2">
        <details>
          <summary className="cursor-pointer select-none font-semibold">Rules in use</summary>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
            From <code>src/core/config/planRules.ts</code> (fingerprint <code>{currentHash}</code>). Edit that
            file to change how plans are built.
          </p>
          <pre className="mt-2 max-h-96 overflow-auto rounded-xl bg-zinc-50 p-3 text-xs dark:bg-zinc-950">
            {JSON.stringify(rules, null, 2)}
          </pre>
        </details>
      </Card>
    </div>
  )
}
