# MyRunna

A personal, transparent, rules-based running-plan PWA. See [docs/PLAN.md](docs/PLAN.md) for the full plan and
[docs/example-plan.md](docs/example-plan.md) for a generated example.

```bash
npm install
npm run dev        # start the app at http://localhost:5173
npm test           # unit + UI tests (Vitest)
npm run typecheck
npm run lint
npm run plan       # print the example plan as Markdown
npm run build      # production build in dist/ (with offline service worker)
```

## Layout

- `src/core/` — pure TypeScript engine: pace model (VDOT), plan generator, no UI dependencies
- `src/core/config/planRules.ts` — every tunable training rule in one file
- `src/data/` — on-device storage (IndexedDB via Dexie) behind a `Repository` interface, JSON backup
- `src/ui/` — React screens: setup, Today, Plan, Log, Paces, Settings

## Deploy (Cloudflare Pages, free)

1. Cloudflare dashboard → Workers & Pages → Create → Pages → Connect to Git → pick this repo.
2. Build command `npm run build`, output directory `dist`.
3. Open the URL on your phone → Share → **Add to Home Screen** (iOS) or **Install app** (Android).

Data lives on the device first. Sign in under Settings → Sync to back it up to Supabase and use it on
other devices, or use Settings → Export backup.

## Cloud sync (Supabase, free)

The public project settings are in `.env` (safe to commit; never add the secret / service_role key).
One-time setup in the Supabase dashboard:

1. **SQL Editor** → New query → paste `supabase/migrations/001_sync.sql` → Run.
2. **Authentication → Emails → Magic Link** template: make the body show the code, e.g.
   `<p>Your MyRunna code: <strong>{{ .Token }}</strong></p>`
3. **Authentication → URL Configuration**: Site URL = your Pages URL.
4. After your first sign-in: **Authentication → Sign In / Providers** → turn off _Allow new users to sign up_.
