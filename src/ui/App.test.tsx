// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../App'
import { rules } from '../core/config'
import { exampleHalfMarathon } from '../core/plan/examples'
import { generatePlan } from '../core/plan/generatePlan'
import { createRepository, type Repository } from '../data'
import { MemoryStore } from '../data/store'
import { AppProvider } from './AppProvider'

afterEach(cleanup)
beforeEach(() => {
  vi.stubGlobal('confirm', () => true)
  window.scrollTo = () => {}
})

async function renderApp(today: string, seed = true, setup?: (repo: Repository) => Promise<unknown>) {
  const repo: Repository = createRepository(new MemoryStore())
  if (seed) await repo.savePlan(generatePlan(exampleHalfMarathon), rules)
  await setup?.(repo)
  render(
    <AppProvider repo={repo} today={today}>
      <App />
    </AppProvider>,
  )
  return repo
}

async function nav(name: string) {
  const bar = await screen.findByRole('navigation', { name: 'Main' })
  fireEvent.click(within(bar).getByRole('button', { name: new RegExp(name) }))
}

describe('first launch', () => {
  it('shows the setup wizard and creates a plan', async () => {
    const repo = await renderApp('2026-10-19', false)
    expect(await screen.findByRole('heading', { name: 'Set up your plan' })).toBeTruthy()

    fireEvent.change(screen.getByLabelText('Race date'), { target: { value: '2027-02-28' } })
    fireEvent.change(screen.getByLabelText(/Finish time/), { target: { value: '65:00' } })
    fireEvent.change(screen.getByLabelText('Weekly km now'), { target: { value: '15' } })
    fireEvent.click(
      within(screen.getByRole('radiogroup', { name: 'Long-run day' })).getByRole('radio', { name: 'Sat' }),
    )

    const preview = screen.getByLabelText('Plan preview')
    expect(preview.textContent).toContain('VDOT 29.3')
    expect(preview.textContent).toContain('19 weeks')

    fireEvent.click(screen.getByRole('button', { name: 'Create plan' }))
    expect(await screen.findByRole('heading', { name: 'What do I run today?' })).toBeTruthy()
    expect((await repo.getActivePlan())?.plan.inputs.longRunDay).toBe(5)
  })

  it('blocks invalid input with a readable message', async () => {
    await renderApp('2026-10-19', false)
    fireEvent.change(await screen.findByLabelText(/Finish time/), { target: { value: 'fast' } })
    expect(screen.getByRole('alert').textContent).toMatch(/Race time must look like/)
    expect((screen.getByRole('button', { name: 'Create plan' }) as HTMLButtonElement).disabled).toBe(true)
  })
})

describe('today screen', () => {
  it("shows today's session with structure and paces", async () => {
    await renderApp('2026-11-03') // Tue, week 2
    expect(await screen.findByRole('heading', { name: 'Threshold: 3 × 5 min @ T, 1 min jog' })).toBeTruthy()
    const structure = screen.getByRole('list', { name: 'Workout structure' })
    expect(structure.textContent).toContain('Warm-up 12 min')
    expect(structure.textContent).toContain('6:28–6:34/km')
    expect(structure.textContent).toContain('Cool-down 10 min')
    expect(screen.getByText(/Base · week 2\/18/)).toBeTruthy()
  })

  it('shows rest days with the next run', async () => {
    await renderApp('2026-11-04') // Wed
    expect(await screen.findByRole('heading', { name: 'Rest' })).toBeTruthy()
    expect(screen.getByText('Next run')).toBeTruthy()
    expect(screen.getByRole('heading', { name: /Easy 3.5 km/ })).toBeTruthy()
  })

  it('counts down before the plan starts', async () => {
    await renderApp('2026-10-20')
    expect(await screen.findByRole('heading', { name: 'Your plan starts in 6 days' })).toBeTruthy()
  })
})

describe('logging a run', () => {
  it('logs the planned session and marks it done', async () => {
    const repo = await renderApp('2026-11-03')
    fireEvent.click(await screen.findByRole('button', { name: 'Log this run' }))

    expect(await screen.findByRole('heading', { name: 'Log a run' })).toBeTruthy()
    expect(screen.getByText(/Counts for:/).textContent).toContain('Threshold')
    expect((screen.getByLabelText('Distance (km)') as HTMLInputElement).value).not.toBe('')

    fireEvent.change(screen.getByLabelText(/^Time/), { target: { value: '40:00' } })
    fireEvent.click(
      within(screen.getByRole('radiogroup', { name: 'Effort' })).getByRole('radio', { name: '7' }),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Save run' }))
    expect((await screen.findByRole('status')).textContent).toMatch(/Saved/)

    const [run] = await repo.listActivities()
    expect(run).toMatchObject({ date: '2026-11-03', durationS: 2400, rpe: 7, source: 'manual' })
    expect(run.plannedSession?.date).toBe('2026-11-03')

    await nav('Today')
    expect(await screen.findByText('✓ Done')).toBeTruthy()
  })

  it('rejects a run without a valid time', async () => {
    const repo = await renderApp('2026-11-03')
    await nav('Log')
    fireEvent.change(await screen.findByLabelText('Distance (km)'), { target: { value: '5' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save run' }))
    expect((await screen.findByRole('alert')).textContent).toMatch(/Time must look like/)
    expect(await repo.listActivities()).toEqual([])
  })

  it('deletes a run', async () => {
    const repo = await renderApp('2026-11-03', true, (r) =>
      r.addActivity({ date: '2026-11-01', source: 'manual', distanceKm: 4, durationS: 1800 }),
    )
    await nav('Log')
    fireEvent.click(await screen.findByRole('button', { name: 'Delete run on 2026-11-01' }))
    await waitFor(async () => expect(await repo.listActivities()).toEqual([]))
  })
})

describe('other screens', () => {
  it('lists every week and expands the current one', async () => {
    await renderApp('2026-11-03')
    await nav('Plan')
    const weeks = await screen.findAllByRole('button', { name: /^Week \d+/ })
    expect(weeks).toHaveLength(18)
    expect(weeks[1].getAttribute('aria-expanded')).toBe('true')
    expect(weeks[0].getAttribute('aria-expanded')).toBe('false')
  })

  it('shows training paces', async () => {
    await renderApp('2026-11-03')
    await nav('Paces')
    expect(await screen.findByText(/VDOT 29.3/)).toBeTruthy()
    expect(screen.getAllByText('6:28–6:34/km').length).toBeGreaterThan(0)
  })

  it('refuses an invalid backup and keeps the data', async () => {
    const repo = await renderApp('2026-11-03')
    await nav('Settings')
    const input = await screen.findByLabelText('Backup file')
    const file = new File(['{"app":"other"}'], 'bad.json', { type: 'application/json' })
    fireEvent.change(input, { target: { files: [file] } })
    expect((await screen.findByRole('status')).textContent).toMatch(/Nothing changed/)
    expect(await repo.getActivePlan()).toBeDefined()
  })
})
