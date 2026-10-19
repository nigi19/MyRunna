// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../App'
import type { Cloud, CloudAuth } from '../cloud'
import { rules } from '../core/config'
import { exampleHalfMarathon } from '../core/plan/examples'
import { generatePlan } from '../core/plan/generatePlan'
import { createRepository } from '../data'
import { MemoryStore } from '../data/store'
import { createSyncEngine } from '../data/sync'
import { FakeRemote } from '../data/testing/fakeRemote'
import { AppProvider } from './AppProvider'

afterEach(cleanup)
beforeEach(() => {
  vi.stubGlobal('confirm', () => true)
  window.scrollTo = () => {}
})

/** Accepts code 123456 for any email. */
function fakeAuth(): CloudAuth & { sent: string[] } {
  let user: { id: string; email?: string } | undefined
  const listeners = new Set<(u: typeof user) => void>()
  return {
    sent: [],
    current: async () => user,
    async sendCode(email) {
      this.sent.push(email)
    },
    async verifyCode(email, code) {
      if (code !== '123456') throw new Error('Token has expired or is invalid')
      user = { id: 'user-1', email }
      listeners.forEach((l) => l(user))
      return user
    },
    async signOut() {
      user = undefined
      listeners.forEach((l) => l(user))
    },
    onChange(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}

async function renderDevice(remote: FakeRemote, seedPlan: boolean) {
  const store = new MemoryStore()
  const repo = createRepository(store)
  if (seedPlan) await repo.savePlan(generatePlan(exampleHalfMarathon), rules)
  const auth = fakeAuth()
  const cloud: Cloud = { auth, engine: createSyncEngine(store, remote) }
  const view = render(
    <AppProvider repo={repo} today="2026-11-03" cloud={cloud} syncDelayMs={10}>
      <App />
    </AppProvider>,
  )
  return { repo, auth, view }
}

async function openSettings() {
  const bar = await screen.findByRole('navigation', { name: 'Main' })
  fireEvent.click(within(bar).getByRole('button', { name: /Settings/ }))
}

async function signIn(code = '123456') {
  fireEvent.change(await screen.findByLabelText('Email'), { target: { value: 'me@example.com' } })
  fireEvent.click(screen.getByRole('button', { name: 'Send code' }))
  fireEvent.change(await screen.findByLabelText(/Code from the email/), { target: { value: code } })
  fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
}

describe('cloud sync in the app', () => {
  it('signs in with an emailed code and uploads existing data', async () => {
    const remote = new FakeRemote()
    const { auth } = await renderDevice(remote, true)
    await openSettings()
    await signIn()

    expect(auth.sent).toEqual(['me@example.com'])
    expect(await screen.findByText('me@example.com')).toBeTruthy()
    await waitFor(() => expect(screen.getByRole('status').textContent).toMatch(/Synced just now/))
    expect(remote.rows.size).toBe(1)
  })

  it('shows a wrong code as an error', async () => {
    await renderDevice(new FakeRemote(), true)
    await openSettings()
    await signIn('000000')
    expect((await screen.findByRole('alert')).textContent).toMatch(/invalid/)
  })

  it('syncs a logged run up, and down to a second device', async () => {
    const remote = new FakeRemote()
    const phone = await renderDevice(remote, true)
    await openSettings()
    await signIn()
    await waitFor(() => expect(remote.rows.size).toBe(1))

    await phone.repo.addActivity({ date: '2026-11-03', source: 'manual', distanceKm: 5, durationS: 2400 })
    // Changes made through the UI schedule a sync; trigger one explicitly here.
    fireEvent.click(screen.getByRole('button', { name: 'Sync now' }))
    await waitFor(() => expect(remote.rows.size).toBe(2))
    phone.view.unmount()

    const laptop = await renderDevice(remote, false)
    expect(await screen.findByRole('heading', { name: 'Set up your plan' })).toBeTruthy()
    // A fresh device has no plan yet; sync it from the cloud via the API the Settings screen uses.
    await laptop.auth.verifyCode('me@example.com', '123456')
    await waitFor(async () => expect(await laptop.repo.listActivities()).toHaveLength(1))
    expect(await screen.findByRole('heading', { name: 'What do I run today?' })).toBeTruthy()
  })

  it('signs out but keeps the data on the device', async () => {
    const remote = new FakeRemote()
    const { repo } = await renderDevice(remote, true)
    await openSettings()
    await signIn()
    fireEvent.click(await screen.findByRole('button', { name: 'Sign out' }))
    expect(await screen.findByRole('button', { name: 'Send code' })).toBeTruthy()
    expect(await repo.getActivePlan()).toBeDefined()
  })
})
