# MyRunna — Plan (v0.2)

A personal, transparent, rules-based running-plan app to replace a Runna subscription.

**Decisions (from Q&A):**

| Topic     | Answer                                                                                |
| --------- | ------------------------------------------------------------------------------------- |
| Device    | Phone only, activities recorded in Strava (**paid Strava subscription** → API usable) |
| Goal race | Half marathon, Sunday 28 February 2027 (see §11)                                      |
| App type  | PWA, English, km                                                                      |
| Hosting   | Cloudflare Pages (or Vercel), Supabase free tier for data/auth                        |
| Intensity | Pace + RPE only (no heart rate)                                                       |

---

## 1. Technology choices (options, cost, recommendation)

Prices as of Oct 2026, personal-use scale (1 user).

### 1.1 App type

| Option                       | Pros                                                                            | Cons                                                                                    | Cost                                         |
| ---------------------------- | ------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | -------------------------------------------- |
| **PWA** ✅                   | One codebase; install to home screen; offline; instant updates; no store review | No Apple Watch / HealthKit; background GPS not reliable (fine — Strava records the run) | €0                                           |
| Native (Expo / React Native) | HealthKit / Health Connect, WorkoutKit, notifications                           | Two platforms, store review, more work                                                  | Apple Developer $99/yr; Google Play $25 once |
| Desktop web only             | Simplest                                                                        | "What do I run today?" belongs on the phone                                             | €0                                           |

**Recommendation: PWA.** The core engine is plain TypeScript, so a native wrapper (Capacitor) can be added later if you ever want HealthKit.

### 1.2 Frontend framework

| Option                           | Pros                                                                               | Cons                                                   | Cost |
| -------------------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------ | ---- |
| **React + Vite + TypeScript** ✅ | Biggest ecosystem; `vite-plugin-pwa`; easy to port to React Native/Capacitor later | Slightly more boilerplate                              | €0   |
| SvelteKit                        | Less code, fast                                                                    | Smaller ecosystem                                      | €0   |
| Next.js                          | SSR, API routes                                                                    | SSR is unnecessary for a single-user offline-first PWA | €0   |

Supporting libs (all free): Tailwind CSS, Dexie (IndexedDB), Zod (validating config/inputs), date-fns, Vitest.

### 1.3 Backend / database / hosting

| Option                                                                        | Pros                                                                                            | Cons                                                                                                         | Cost                                                          |
| ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------- |
| **Supabase (free) + Cloudflare Pages or Vercel Hobby** ✅                     | Postgres, auth (magic link), row-level security, Edge Functions for Strava OAuth/webhooks later | Free projects pause after ~1 week of no activity (fine with daily use; the app keeps working offline anyway) | €0 (Pro is $25/mo — not needed)                               |
| Firebase Spark                                                                | Mature, real-time, offline SDK                                                                  | NoSQL; Cloud Functions need the paid Blaze plan                                                              | €0 (Blaze pay-as-you-go ≈ €0 at this scale, but needs a card) |
| Azure: Static Web Apps (Free) + Functions (consumption) + Cosmos DB free tier | Generous free tiers; doubles as hands-on practice for your AI-200 study                         | More setup/config; Cosmos DB modelling more work than Postgres                                               | €0                                                            |
| Local-only (IndexedDB)                                                        | No account, fully private                                                                       | No cross-device sync, no webhook sync                                                                        | €0                                                            |

**Recommendation: local-first + Supabase.** All data lives in IndexedDB first (the app works offline and with no backend at all); Supabase is a sync target behind a `Repository` interface. The MVP can ship without Supabase and add it in step 7. If you'd rather practise Azure, the same interface lets us swap Supabase for Azure.

### 1.4 Getting completed runs back (phone + Strava)

| Option                                                                                        | Access requirements                                                                                                                             | Cost                                       | Verdict                                                                                                                                                                              |
| --------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Manual logging**                                                                            | none                                                                                                                                            | €0                                         | MVP                                                                                                                                                                                  |
| **GPX/FIT/TCX file import** (export from Strava: activity → ⋯ → Export GPX / Export Original) | none                                                                                                                                            | €0                                         | Later fallback — parsed in the browser                                                                                                                                               |
| **Strava API** (OAuth + webhooks)                                                             | Register an app; self-service capacity 1 → 10 athletes (enough for you). **Since June 2026 the Standard Tier needs a paid Strava subscription** | Strava sub ≈ $11.99/mo (varies by country) | ✅ v1.1 — you already pay for Strava. Read-only: Strava **cannot** push structured workouts to anything                                                                              |
| intervals.icu API                                                                             | Free API key                                                                                                                                    | Free (supporter optional)                  | ❌ for you: activities that came in from Strava are filtered out of its API due to Strava's terms. Useful only if you buy a Garmin/Coros later (it pushes workouts to them for free) |
| Garmin Connect / Training API                                                                 | Garmin Connect Developer Program — business application + approval                                                                              | Free if approved                           | ❌ no Garmin; not realistic for a hobby app anyway                                                                                                                                   |
| Health Connect / HealthKit                                                                    | Native app needed                                                                                                                               | $99/yr (Apple)                             | Later, only if we go native                                                                                                                                                          |
| Structured workout → watch (.FIT workout export)                                              | none                                                                                                                                            | €0                                         | Later — only relevant if you get a watch                                                                                                                                             |

There's no watch to push workouts to, so the phone shows the workout itself. A later feature can add a "workout mode" with a big rep counter, a timer and audio/vibration cues, while Strava records GPS in the background.

**Sync design:** an `ActivitySource` interface (`manual`, `fileImport`, `strava`, later `intervalsIcu`/`garmin`), and a `WorkoutTarget` interface for pushing workouts later. No vendor logic in the core engine.

### 1.5 Total cost vs Runna

|                                | Monthly                               | Yearly                                   |
| ------------------------------ | ------------------------------------- | ---------------------------------------- |
| Runna (eurozone)               | €19.99                                | €119.99                                  |
| Runna (US)                     | $19.99                                | $119.99                                  |
| **MyRunna, recommended setup** | **€0**                                | **€0** (optional custom domain ≈ €10/yr) |
| MyRunna + Strava API auto-sync | €0 extra (you already pay for Strava) | €0 extra                                 |
| MyRunna as native iOS          | €0                                    | $99 Apple fee                            |

---

## 2. Architecture overview

```
┌──────────────────────── PWA (React + Vite + TS) ─────────────────────────┐
│  UI: Today · Plan (calendar) · Log run · Setup wizard · Suggestions ·    │
│      Settings (rules viewer)                                             │
│                                                                          │
│  ┌────────────── core/ (pure TypeScript, no UI, 100% unit-tested) ─────┐ │
│  │ paces/      PaceModel interface → VdotPaceModel (Daniels)           │ │
│  │ plan/       generatePlan(inputs, rules, paceModel, events) → Plan   │ │
│  │ workouts/   session builders (easy, long, T, I, R, HMP, strides)    │ │
│  │ adapt/      compare actual vs target → Suggestion[] (never auto)    │ │
│  │ schedule/   missed runs, holidays, light weeks → re-plan future     │ │
│  │ config/     planRules.ts   ← the ONE file with all the rules        │ │
│  └─────────────────────────────────────────────────────────────────────┘ │
│                                                                          │
│  data/   Repository interface → DexieRepo (IndexedDB, offline)           │
│                               → SupabaseSync (later)                     │
│  sync/   ActivitySource: manual | fileImport (GPX/FIT) | strava (later)  │
└──────────────────────────────────────────────────────────────────────────┘
                │ (optional, step 7+)
                ▼
     Supabase: Postgres + Auth + Edge Functions (Strava OAuth/webhook)
```

Key principles:

- **Deterministic engine:** same inputs + rules → same plan. Every generated session stores a `reason` (e.g. _"Week 6 build: volume +8% (cap 10%), long run 16 km (cap 30% of 52 km)"_) so the logic stays visible.
- **History is frozen; only the future is regenerated.** Any regeneration produces a diff the user approves.
- **Swappable pace model:** `PaceModel { fitnessFromRace(distance, time) → Fitness; zones(fitness) → PaceZones; predict(fitness, distance) → time }`.

---

## 3. Data model

```ts
type Units = 'km' | 'mi'

interface AthleteProfile {
  id: string
  units: Units
  experience: 'beginner' | 'intermediate' | 'advanced'
  currentWeeklyKm: number
  longestRecentRunKm: number
  daysPerWeek: 3 | 4 | 5 | 6 | 7
  preferredLongRunDay: Weekday // 0=Mon … 6=Sun
  unavailableWeekdays: Weekday[]
}

interface RaceResult {
  // the fitness anchor(s)
  id: string
  date: ISODate
  distanceM: number
  timeS: number
  source: 'race' | 'estimate' | 'time-trial'
}

interface Plan {
  id: string
  goal: { distanceM: number; raceDate: ISODate; targetTimeS?: number }
  startDate: ISODate
  paceModelId: 'vdot' | string
  fitness: { vdot: number; anchorResultId: string }
  rulesVersion: string // hash of planRules used
  status: 'active' | 'archived'
  createdAt: string
}

interface PlanWeek {
  id: string
  planId: string
  index: number
  startDate: ISODate
  phase: 'base' | 'build' | 'peak' | 'taper'
  isDownWeek: boolean
  targetKm: number
  targetLongRunKm: number
  hardMinutesShare: number // computed, must be ≤ rules.intensity.maxHardShare
  reason: string[]
}

type SessionType =
  | 'rest'
  | 'easy'
  | 'long'
  | 'recovery'
  | 'threshold'
  | 'interval'
  | 'repetition'
  | 'racePace'
  | 'strides'
  | 'race'

interface PlannedSession {
  id: string
  weekId: string
  date: ISODate
  type: SessionType
  totalKm: number
  estDurationMin: number
  steps: WorkoutStep[] // warm-up, reps, recoveries, cool-down
  status: 'planned' | 'done' | 'missed' | 'skipped' | 'moved'
  completedActivityId?: string
  reason: string
}

interface WorkoutStep {
  kind: 'warmup' | 'work' | 'recovery' | 'cooldown' | 'steady'
  repeat?: number // e.g. 5 × (work + recovery)
  children?: WorkoutStep[]
  distanceM?: number
  durationS?: number
  paceZone: PaceZoneId // resolved to a pace at display time
}

type PaceZoneId = 'E' | 'M' | 'T' | 'I' | 'R' | 'HMP' | 'jog'
interface PaceZones {
  // seconds per km, [fast, slow]
  modelId: string
  fitnessValue: number
  validFrom: ISODate
  zones: Record<PaceZoneId, { minSPerKm: number; maxSPerKm: number }>
}

interface CompletedActivity {
  id: string
  date: ISODate
  source: 'manual' | 'gpx' | 'fit' | 'strava'
  externalId?: string
  distanceM: number
  movingTimeS: number
  avgHr?: number
  rpe?: number // 1–10, asked after the run
  laps?: { distanceM: number; timeS: number; avgHr?: number }[]
  notes?: string
  matchedSessionId?: string
}

interface ScheduleEvent {
  // missed runs, holidays, light weeks
  id: string
  type: 'holiday' | 'sick' | 'lightWeek' | 'unavailableDay'
  from: ISODate
  to: ISODate
  note?: string
}

interface Suggestion {
  // nothing changes until approved
  id: string
  createdAt: string
  kind: 'paceUpdate' | 'reschedule' | 'volumeReduce' | 'replan'
  summary: string
  evidence: string[]
  proposedChange: unknown // e.g. { vdot: 47.1 → 48.0 } or a plan diff
  status: 'pending' | 'accepted' | 'rejected'
}
```

Pace zones are stored as a history (`validFrom`), so accepted suggestions are auditable and past sessions keep the paces they were planned with.

---

## 4. Pace model — Jack Daniels' VDOT

Daniels & Gilbert formulas (v = metres/min, t = minutes):

```
VO2(v)       = -4.60 + 0.182258·v + 0.000104·v²
%max(t)      = 0.8 + 0.1894393·e^(-0.012778·t) + 0.2989558·e^(-0.1932605·t)
VDOT         = VO2(raceDist / t) / %max(t)

velocityAt(f) : solve 0.000104·v² + 0.182258·v − (4.60 + f·VDOT) = 0
predict(dist) : solve for t where VO2(dist/t) / %max(t) = VDOT   (bisection)
```

Zones (fractions in `planRules.paces`, so they're tweakable):

| Zone           | Definition                          |
| -------------- | ----------------------------------- |
| E (easy)       | velocityAt(0.59 … 0.74)             |
| M (marathon)   | predict(42 195 m) → pace            |
| HMP            | predict(21 097 m) → pace            |
| T (threshold)  | velocityAt(0.88)                    |
| I (interval)   | velocityAt(0.975)                   |
| R (repetition) | I pace − 6 s per 400 m (≈ −15 s/km) |

The tests compare these numbers against Daniels' published VDOT tables, within ±2 s/km.

---

## 5. Plan-generation algorithm (pseudocode)

All constants come from `planRules` (shown as `R.*`).

```
function generatePlan(profile, anchorRace, goal, R, paceModel, events, today):
  fitness  = paceModel.fitnessFromRace(anchorRace)
  zones    = paceModel.zones(fitness)
  nWeeks   = weeksBetween(nextMonday(today), goal.raceDate) + 1     # race week included
  assert nWeeks >= R.minWeeks[goal.distance]  else warn("short plan: base/build compressed")

  # 1. Phases
  taperW = R.taper.weeks[goal.distance]                        # HM: 2, M: 3
  rest   = nWeeks - taperW
  baseW  = round(rest * R.phaseSplit.base)                      # e.g. 0.35
  peakW  = round(rest * R.phaseSplit.peak)                      # e.g. 0.25
  buildW = rest - baseW - peakW
  phases = [base]*baseW + [build]*buildW + [peak]*peakW + [taper]*taperW

  # 2. Weekly volume curve
  peakKm = clamp(R.peakVolume[goal.distance][profile.experience],
                 max = profile.currentWeeklyKm * R.maxPeakMultiplier)   # don't overreach
  km = profile.currentWeeklyKm
  cycle = R.downWeek.every[profile.experience]                  # 3 (beginner) or 4
  for w in 0..rest-1:
     if (w+1) % cycle == 0:                                     # down week
        week[w].km = lastBuildKm * R.downWeek.factor            # e.g. 0.75
        week[w].isDown = true
     else:
        km = min(km * (1 + R.progression.maxWeeklyIncrease), peakKm)   # ≤ 10 %
        week[w].km = km; lastBuildKm = km
  for t, factor in enumerate(R.taper.volumeFactors[goal.distance]):  # HM: [0.75, 0.5]
     week[rest+t].km = peakKm * factor

  # 3. Long run per week
  lr = max(profile.longestRecentRunKm, R.longRun.minKm)
  for each week w:
     if not down and not taper: lr = lr + R.longRun.weeklyIncreaseKm      # +1–2 km
     cap = min(R.longRun.maxKm[goal.distance],                            # HM: 21
               week.km * R.longRun.maxShareOfWeek[profile.experience],    # 0.30–0.40
               R.longRun.maxDurationMin / zones.E.slow)
     week.longRunKm = down ? lr * R.downWeek.factor : min(lr, cap)
  race week: long run = race

  # 4. Choose quality sessions per phase
  for each week w:
     q = R.quality.perWeek[profile.experience][week.phase]   # 0–2
     if profile.daysPerWeek <= 3: q = min(q, 1)
     week.quality = R.quality.menu[week.phase][0..q]          # e.g. build: [threshold, interval]
     #   base: strides/hill sprints (R pace), maybe 1× short T
     #   build: T cruise intervals + I intervals
     #   peak: HMP long-run finish / HMP tempo + T
     #   taper: 1 short sharpening session
     each quality session gets a progression index → workout builder picks size
     (e.g. T: 3×8 min → 4×8 → 2×15 → 20 min continuous; I: 5×800 → 6×1000 → 5×1200)

  # 5. 80/20 guard
  for each week:
     hardMin = Σ work-step minutes at T/I/R/HMP
     totalMin = Σ estimated minutes
     while hardMin / totalMin > R.intensity.maxHardShare:   # 0.20
        shrink the largest quality session by one rep (or swap to easier variant)
     week.hardMinutesShare = hardMin / totalMin

  # 6. Place sessions on days
  days = availableWeekdays(profile) minus events
  place long run on preferredLongRunDay (or nearest available)
  place quality sessions: maximise spacing; never the day before/after the long run;
        never on consecutive days; ≥ R.spacing.minHoursBetweenHard (48 h)
  remaining run slots (daysPerWeek − long − quality) = easy runs
  remaining days = rest

  # 7. Distribute easy volume
  easyKm = week.km − longRunKm − Σ qualityKm(incl. warm-up/cool-down)
  split easyKm over easy slots, each within [R.easy.minKm, longRunKm * R.easy.maxShareOfLong]
  if easyKm too small → shorten/merge; if too big → add strides or flag "needs extra day"

  # 8. Annotate
  every week/session gets reason strings referencing the rule that produced it
  return Plan(weeks, sessions, zones)
```

**Re-planning** reuses the same function: `generatePlan(..., startFrom = firstFutureWeek, carryOver = actual recent volume)`. History stays fixed, and only the future weeks are replaced after you approve the diff.

---

## 6. Adaptation, missed runs, holidays

All of these produce **Suggestions** that you accept or reject:

**Pace adjustment**

- Each completed run is matched to the planned session for that day (same date ±1 day, closest distance).
- For quality runs, compare work-lap pace with the target zone. Easy runs get a check for "ran too fast".
- Rule (in `planRules.adapt`): if ≥ 3 of the last 4 quality sessions hit the target with RPE ≤ 6, or ran ≥ 2 % faster, suggest **VDOT +0.5…1**. If ≥ 2 of the last 3 missed the target with RPE ≥ 8, suggest **VDOT −0.5…1**, or a check-in about fatigue.
- Any new race or time-trial result gives an immediate suggestion with the recalculated VDOT.
- Easy runs that are repeatedly too fast get a nudge only. Paces never change from this.

**Missed runs** (`planRules.missed`)

- Missed easy run: dropped, never made up.
- Missed quality session: move it to the next free day if that keeps 48 h around other hard days. Otherwise drop it.
- Missed long run: move it within the same week if possible. Otherwise skip it, and the next long run does not grow.
- Never double up; weekly volume is never pushed above target to catch up.

**Breaks / holidays / sickness**

- Mark a date range. Sessions inside it become `skipped`.
- On return: < 5 days off → continue as planned. 5–10 days → first week back at 80 % volume, quality sessions repeated. > 10 days → replan from actual volume, with a possible re-estimate of VDOT −1…2, and with a warning if the goal looks unrealistic.
- **Light week**: you flag any week → it becomes a down week, and the down-week cycle resets from there.

---

## 7. Config file

`src/core/config/planRules.ts` holds every tunable rule, with comments, in one plain object:

| Section                              | What it controls                                                                                                                     |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| `paces`, `goalPaceZone`              | VDOT fractions per zone; which zone "race pace" means per goal                                                                       |
| `minWeeks`, `maxWeeks`, `phaseSplit` | Plan length limits; base/build/peak proportions                                                                                      |
| `volume`, `downWeek`, `taper`        | Peak km per goal × experience, weekly growth (+10 % / ≥1.5 km / ≤5 km), down-week cycle, taper factors                               |
| `longRun`                            | Growth, max km per goal, max share **by days per week**, 150 min cap                                                                 |
| `intensity`, `quality`               | 80/20 cap, sessions per week by experience × phase (capped by days), menu per phase, strides, warm-up/cool-down, **workout ladders** |
| `spacing`, `easy`                    | 48 h between hard days; easy-run bounds                                                                                              |
| `adapt`, `missed`, `breaks`          | Thresholds for pace suggestions; missed-run handling; return-from-break rules                                                        |

`schema.ts` validates it with Zod: types, ranges, no unknown keys (typos fail), plus cross-checks such as easy < threshold < interval, one taper factor per taper week, base + peak < 1, and min weeks > taper. `config/index.ts` exports the validated `rules`, so an invalid edit fails at startup with a list of every problem, e.g. `intensity.maxHardShare: Too big: expected number to be <=1`.

---

## 8. Scope

**MVP**

1. Setup wizard: goal race, anchor race time, weekly km, longest run, days/week, long-run day, experience
2. VDOT pace model + pace-zone screen
3. Plan generator: phases, progression, down weeks, 80/20, day placement, reasons
4. **Today screen**: session type, distance/duration, step structure, target paces, the reason behind it
5. Plan view: week list/calendar with phase colours and weekly km
6. Manual run logging (distance, time, RPE, optional laps), matched to the planned session
7. Local storage (IndexedDB), installable offline PWA, JSON export/import backup

**v1.1 – v1.x**

- **Strava API sync** (you already pay for Strava): OAuth via a Cloudflare Pages Function (keeps the client secret server-side); pull new activities on app open (no webhook needed, so a paused Supabase project can't lose events)
- Adaptation suggestions (pace updates) with approve/reject
- Missed runs, holidays, light weeks + re-plan diff view
- Supabase sync + login (multi-device)
- Workout mode on the phone (step timer, audio cues)

**Later / optional**

- GPX/FIT/TCX file import (fallback, if Strava access ever changes)
- Alternative pace models (e.g. McMillan-style, critical speed from multiple races)
- Watch support: .FIT workout export / intervals.icu push (if you get a Garmin/Coros)
- Charts: weekly volume vs plan, VDOT trend
- Native wrapper (Capacitor) for HealthKit / Health Connect

---

## 9. Build order

1. ✅ **Scaffold**: Vite + React + TS + Vitest + oxlint/Prettier (Tailwind comes with the UI in step 6); GitHub Actions CI (lint, typecheck, test). Deploy preview to Cloudflare Pages/Vercel.
2. ✅ **Pace model**: `PaceModel` interface + `VdotPaceModel`; tests against Daniels tables.
3. ✅ **Rules config**: `planRules.ts` (all rules, commented) + Zod schema with cross-field checks (`schema.ts`); `config/index.ts` exports the validated `rules`.
4. ✅ **Plan engine** (`src/core/plan/`, `npm run plan` prints the example): phases → volume curve → long runs → quality selection → workout builders → 80/20 guard → day placement → easy distribution → reasons. Golden-file tests for a few profiles (e.g. HM, 4 days, 30 km/week, 12 weeks).
5. **Storage**: Dexie repo behind a `Repository` interface; JSON backup export/import.
6. **UI**: setup wizard → Today screen → Plan view → Log run → Paces screen. PWA manifest + offline service worker.
7. **Supabase**: auth (magic link), tables mirroring the data model with RLS, background sync. _(MVP complete after step 6; step 7 can come any time.)_
8. **Strava sync** (OAuth Pages Function + pull on open) + activity ↔ session matching.
9. **Adaptation + scheduling events** with Suggestions UI and re-plan diff.
10. **Workout mode**, then optional file import / watch export.

---

## 10. Answered questions

Race Sunday 28 February 2027 · 10K at 6:30/km · 15 km/week · longest 10 km · 3 days/week · long run Saturday · intermediate · km · English · Cloudflare/Vercel · pace only · paid Strava.

---

## 11. Your profile and plan preview

**Fitness**: 10K in 65:00, which is **VDOT 29.3**. Predicted half marathon today: **2:23:52** (6:49/km).

| Zone          | Pace /km    |
| ------------- | ----------- |
| Easy          | 7:27 – 8:51 |
| Marathon      | 6:56 – 7:02 |
| Half marathon | 6:46 – 6:52 |
| Threshold     | 6:28 – 6:34 |
| Interval      | 5:58 – 6:04 |
| Repetition    | 5:43 – 5:49 |

**Calendar**: plan starts Mon 26 Oct 2026; race week is week 18, ending with the race on **Sunday 28 Feb 2027**. The Saturday before race day is a rest day or a short shakeout.

**Generated plan**: the full plan, with every reason, is in [`example-plan.md`](example-plan.md). Summary:

| Phase | Weeks | Weekly km  | Long run (Sat) | Quality (Tue)                                           |
| ----- | ----- | ---------- | -------------- | ------------------------------------------------------- |
| Base  | 1–6   | 18 → 25    | 10 → 14 km     | 200–300 m reps alternating with 3–4 × 5 min T           |
| Build | 7–12  | 27 → 32    | 14.5 → 17.5 km | threshold 3 × 8 → 2 × 12 min, 5 × 2 min I               |
| Peak  | 13–16 | ~32        | 17.5 km        | HMP 2–3 × 10 min alternating with T 3 × 10 → 2 × 15 min |
| Taper | 17–18 | 22.5 → 9.7 | 11.5 km → race | HMP 2 × 10 min, then 10 min HMP                         |

Down weeks 4, 8, 12. Hard time 5–15 % of each week (80/20 cap never needed). Base starts at ~18 km rather than 15 because `volume.raiseStartToFitLongestRun` keeps your 10 km long run within the 55 % cap.

**Week template (3 days)**: Tue = quality, Thu = easy (or easy + strides), Sat = long run, the rest are rest days.

**Rule changes driven by 3 days/week** (going into `planRules`):

- Long-run share of weekly volume capped **by days per week**: 3 days → 55 %, 4 → 40 %, 5 → 35 %, 6+ → 30 % (+10 % for marathons). With only 3 runs, the long run is naturally a big share.
- Volume increase per week is the larger of +10 % and +1.5 km, so a low base can still grow.
- At most **one** quality session per week at 3 days. The 80/20 check still applies (about 20 % of weekly time at T/I/R/HMP).
- Long run capped at 150 min. At easy pace, 18 km ≈ 2 h 25 min, which fits.

Peak of ~30 km/week with an 18 km long run is plenty to finish a half strongly from a 15 km/week start. A 4th weekly run would be the biggest single improvement if you ever have time; the setup can simply be changed later.
