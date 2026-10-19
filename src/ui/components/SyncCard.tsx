import { useState } from 'react'
import { useApp } from '../appContext'
import type { CloudState } from '../useCloudSync'
import { Button, Card, Field, inputClass } from './ui'

function ago(iso: string, now = Date.now()) {
  const min = Math.round((now - Date.parse(iso)) / 60_000)
  if (min < 1) return 'just now'
  if (min < 60) return `${min} min ago`
  const h = Math.round(min / 60)
  return h < 24 ? `${h} h ago` : new Date(iso).toLocaleDateString()
}

/** Its own component, so the form starts fresh every time someone signs out. */
function SignInForm({ cloud }: { cloud: CloudState }) {
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [codeSent, setCodeSent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()

  const attempt = async (fn: () => Promise<void>) => {
    setBusy(true)
    setError(undefined)
    try {
      await fn()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card className="space-y-3">
      <h2 className="font-semibold">Sync</h2>
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        Sign in to back up your plan and runs and use them on other devices. Everything keeps working offline.
      </p>
      <Field label="Email">
        <input
          type="email"
          autoComplete="email"
          className={inputClass}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </Field>
      {codeSent && (
        <Field label="Code from the email" hint="Check spam too. The code works for one hour.">
          <input
            className={inputClass}
            inputMode="numeric"
            autoComplete="one-time-code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
        </Field>
      )}
      {error && (
        <p role="alert" className="text-sm text-rose-600">
          {error}
        </p>
      )}
      <div className="flex gap-3">
        <Button
          variant={codeSent ? 'secondary' : 'primary'}
          disabled={busy || !email.includes('@')}
          onClick={() =>
            attempt(async () => {
              await cloud.sendCode(email)
              setCodeSent(true)
            })
          }
        >
          {codeSent ? 'Send again' : 'Send code'}
        </Button>
        {codeSent && (
          <Button
            disabled={busy || code.trim().length < 6}
            onClick={() => attempt(() => cloud.verifyCode(email, code))}
          >
            Sign in
          </Button>
        )}
      </div>
    </Card>
  )
}

export function SyncCard() {
  const { cloud } = useApp()

  if (!cloud) {
    return (
      <Card className="space-y-1">
        <h2 className="font-semibold">Sync</h2>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Cloud sync isn't configured in this build. Data stays on this device.
        </p>
      </Card>
    )
  }

  if (!cloud.user) return <SignInForm cloud={cloud} />

  const status =
    cloud.status === 'syncing'
      ? 'Syncing…'
      : cloud.status === 'error'
        ? `Not synced: ${cloud.error}`
        : cloud.lastSyncedAt
          ? `Synced ${ago(cloud.lastSyncedAt)}`
          : 'Not synced yet'

  return (
    <Card className="space-y-3">
      <h2 className="font-semibold">Sync</h2>
      <p className="text-sm">
        Signed in as <strong>{cloud.user.email}</strong>
      </p>
      <p
        role="status"
        className={`text-sm ${cloud.status === 'error' ? 'text-rose-600' : 'text-zinc-600 dark:text-zinc-400'}`}
      >
        {status}
        {cloud.pending > 0 && cloud.status !== 'syncing' && ` · ${cloud.pending} change(s) waiting`}
      </p>
      <div className="flex gap-3">
        <Button
          variant="secondary"
          disabled={cloud.status === 'syncing'}
          onClick={() => void cloud.syncNow()}
        >
          Sync now
        </Button>
        <Button
          variant="secondary"
          onClick={() => {
            if (confirm('Sign out? Your data stays on this device.')) void cloud.signOut()
          }}
        >
          Sign out
        </Button>
      </div>
    </Card>
  )
}
