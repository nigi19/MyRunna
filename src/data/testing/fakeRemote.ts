import type { PulledRow, RemoteRow, SyncRemote } from '../sync'

/** Behaves like public.records + sync_upsert: last write wins, server stamps every write. */
export class FakeRemote implements SyncRemote {
  rows = new Map<string, PulledRow>()
  private clock = Date.parse('2026-10-19T08:00:00Z')
  failNext = false

  async push(rows: RemoteRow[]) {
    if (this.failNext) {
      this.failNext = false
      throw new Error('offline')
    }
    for (const r of structuredClone(rows)) {
      const key = `${r.kind}:${r.id}`
      const existing = this.rows.get(key)
      if (existing && Date.parse(r.updated_at) < Date.parse(existing.updated_at)) continue
      this.rows.set(key, { ...r, server_updated_at: new Date((this.clock += 1)).toISOString() })
    }
  }

  async pull(cursor: string | undefined, limit: number) {
    return [...this.rows.values()]
      .filter((r) => !cursor || r.server_updated_at > cursor)
      .sort((a, b) => (a.server_updated_at < b.server_updated_at ? -1 : 1))
      .slice(0, limit)
      .map((r) => structuredClone(r))
  }
}
