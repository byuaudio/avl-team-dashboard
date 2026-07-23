# BYU Audio for Live Events — Team Dashboard

Web app for the BYU Audio for Live Events student team: a team dashboard plus
each employee's training progress sheet with a request/grant pass-off workflow.

React + Vite + TypeScript SPA · Supabase (Postgres + Auth) · GitHub Pages.

## Run / test

```bash
npm install
npm run dev       # local dev server (needs .env.local — see SETUP.md)
npm run build     # type-check + production build (must pass before committing)
npm run lint      # oxlint
```

The product owner (Taylor) is the tester — after changes, give them exact
manual test steps and what a correct result looks like.

## Critical rules

- **Pass-off business rules live in the database**, not the UI. All
  training_progress writes go through Postgres RPC functions
  ([supabase/migrations/0001_initial_schema.sql](supabase/migrations/0001_initial_schema.sql)).
  Never add a client-side write path around them.
- Schema changes = a **new numbered migration file** (never edit an applied
  migration) + update the row types in [src/lib/types.ts](src/lib/types.ts).
- All database queries go through [src/lib/api.ts](src/lib/api.ts).
- Follow the AI-assisted development working agreement: update docs in the same
  change, log architectural decisions in DECISIONS.md, mark ASSUMED vs VERIFIED.

## Docs

- [ONBOARDING.md](ONBOARDING.md) — new-developer setup + collaboration workflow (read first)
- [PROJECT.md](PROJECT.md) — vision, features, roadmap, current priorities
- [ARCHITECTURE.md](ARCHITECTURE.md) — system design, schema, folder map, where to change what
- [CONVENTIONS.md](CONVENTIONS.md) — coding standards and invariants
- [DECISIONS.md](DECISIONS.md) — architecture decision log
- [COMPENSATION.md](COMPENSATION.md) — pay model + formulas
- [AI_NOTES.md](AI_NOTES.md) — context for future AI sessions (assumptions, pitfalls)
- [SETUP.md](SETUP.md) — one-time Supabase / GitHub / local setup walkthrough

## Collaboration

Two developers share ONE Supabase project and the live site. Work on branches;
`main` auto-deploys. Schema changes are shared and immediate — coordinate first,
use a new numbered migration (never edit an applied one), and update
`src/lib/types.ts` to match. See ONBOARDING.md.
