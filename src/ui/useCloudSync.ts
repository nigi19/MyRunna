import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Cloud } from '../cloud'
import type { Repository } from '../data'

export interface CloudUser {
  id: string
  email?: string
}

export interface CloudState {
  user?: CloudUser
  status: 'signedOut' | 'idle' | 'syncing' | 'error'
  lastSyncedAt?: string
  error?: string
  /** Local changes not yet uploaded. */
  pending: number
  sendCode(email: string): Promise<void>
  verifyCode(email: string, code: string): Promise<void>
  signOut(): Promise<void>
  syncNow(): Promise<void>
}

const message = (e: unknown) => (e instanceof Error ? e.message : String(e))

/**
 * Keeps this device in sync while someone is signed in: right after sign-in,
 * shortly after every local change, when the app comes back to the
 * foreground and when the network returns. Never blocks the UI: the device
 * copy is always usable.
 */
export function useCloudSync(
  cloud: Cloud | undefined,
  repo: Repository,
  onPulled: () => Promise<void>,
  delayMs: number,
): { state?: CloudState; schedule: () => void } {
  const [user, setUser] = useState<CloudUser>()
  const [status, setStatus] = useState<CloudState['status']>('signedOut')
  const [lastSyncedAt, setLastSyncedAt] = useState<string>()
  const [error, setError] = useState<string>()
  const [pending, setPending] = useState(0)
  const userRef = useRef<CloudUser>(undefined)
  const running = useRef(false)
  const again = useRef(false)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)

  const syncNow = useCallback(async () => {
    const current = userRef.current
    if (!cloud || !current) return
    if (running.current) {
      again.current = true
      return
    }
    running.current = true
    try {
      do {
        again.current = false
        setStatus('syncing')
        try {
          await cloud.engine.useAccount(current.id)
          const result = await cloud.engine.sync()
          if (result.pulled > 0) await onPulled()
          setLastSyncedAt(await cloud.engine.lastSyncedAt())
          setError(undefined)
          setStatus('idle')
        } catch (e) {
          setError(navigator.onLine === false ? 'Offline: will sync when you are back online.' : message(e))
          setStatus('error')
        }
      } while (again.current)
    } finally {
      running.current = false
      setPending(await repo.pendingChanges())
    }
  }, [cloud, repo, onPulled])

  const schedule = useCallback(() => {
    void repo.pendingChanges().then(setPending)
    if (!cloud || !userRef.current) return
    clearTimeout(timer.current)
    timer.current = setTimeout(() => void syncNow(), delayMs)
  }, [cloud, repo, syncNow, delayMs])

  const applyUser = useCallback(
    (next: CloudUser | undefined) => {
      const changed = next?.id !== userRef.current?.id
      userRef.current = next
      setUser(next)
      if (!next) setStatus('signedOut')
      else if (changed) void syncNow()
    },
    [syncNow],
  )

  // Follow the auth session (an external system): restore it on start, react to sign-in/out and token refresh.
  useEffect(() => {
    if (!cloud) return
    let live = true
    void cloud.auth.current().then((u) => live && applyUser(u))
    void cloud.engine.lastSyncedAt().then((t) => live && setLastSyncedAt(t))
    void repo.pendingChanges().then((n) => live && setPending(n))
    const unsubscribe = cloud.auth.onChange((u) => applyUser(u))
    return () => {
      live = false
      unsubscribe()
    }
  }, [cloud, repo, applyUser])

  // Catch up when the network returns or the app comes back to the foreground.
  useEffect(() => {
    if (!cloud) return
    const onVisible = () => document.visibilityState === 'visible' && void syncNow()
    const onOnline = () => void syncNow()
    window.addEventListener('online', onOnline)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.removeEventListener('online', onOnline)
      document.removeEventListener('visibilitychange', onVisible)
      clearTimeout(timer.current)
    }
  }, [cloud, syncNow])

  const state = useMemo<CloudState | undefined>(
    () =>
      cloud && {
        user,
        status,
        lastSyncedAt,
        error,
        pending,
        sendCode: (email) => cloud.auth.sendCode(email.trim()),
        async verifyCode(email, code) {
          applyUser(await cloud.auth.verifyCode(email.trim(), code))
        },
        async signOut() {
          clearTimeout(timer.current)
          await cloud.auth.signOut()
          await cloud.engine.signOut()
          setLastSyncedAt(undefined)
          applyUser(undefined)
        },
        syncNow,
      },
    [cloud, user, status, lastSyncedAt, error, pending, applyUser, syncNow],
  )

  return { state, schedule }
}
