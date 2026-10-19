# MyRunna

A personal, transparent, rules-based running-plan PWA. See [docs/PLAN.md](docs/PLAN.md) for the full plan.

```bash
npm install
npm run dev        # start the app
npm test           # unit tests (Vitest)
npm run typecheck
npm run lint
```

- `src/core/` — pure TypeScript engine (pace model, plan rules), no UI dependencies
- `src/core/config/planRules.ts` — every tunable training rule in one file
