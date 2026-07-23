# Onboarding & Collaboration Guide

For team members developing this app with VS Code + the Claude plugin
("vibe-coding"). Read this first; it points you at everything else.

## What this project is

The BYU Audio for Live Events team dashboard + training/pay app. React + Vite +
TypeScript, talking to Supabase (Postgres + Auth), hosted on GitHub Pages.

**Where the knowledge lives (read these; Claude reads them too):**

- [CLAUDE.md](CLAUDE.md) — the rules Claude follows; start here.
- [PROJECT.md](PROJECT.md) — vision, roles, the full roadmap.
- [ARCHITECTURE.md](ARCHITECTURE.md) — how it's built, folder map, where to change what.
- [CONVENTIONS.md](CONVENTIONS.md) — coding standards & invariants.
- [DECISIONS.md](DECISIONS.md) — why things are the way they are (decision log).
- [COMPENSATION.md](COMPENSATION.md) — the pay model + formulas.
- [AI_NOTES.md](AI_NOTES.md) — gotchas for AI sessions.
- [SETUP.md](SETUP.md) — the original one-time Supabase/GitHub walkthrough.

> Note: Claude's per-machine "memory" is NOT shared. Anything important must go
> into these repo docs so both developers (and both Claude sessions) have it.

## One-time setup (each developer, on your own computer)

1. **Get access** (ask the Audio Manager): be added as a **collaborator** on the
   GitHub repo `byuaudio/avl-team-dashboard`, and get the Supabase **database
   password** + a Supabase account on the project.
2. **Install** [Node.js](https://nodejs.org) 20+ and [VS Code](https://code.visualstudio.com)
   with the Claude plugin. (`git` and the `gh` CLI help too.)
3. **Clone & install:**
   ```bash
   gh repo clone byuaudio/avl-team-dashboard   # or: git clone https://github.com/byuaudio/avl-team-dashboard
   cd avl-team-dashboard
   npm install
   ```
4. **Local env:** copy `.env.example` to `.env.local` and fill in the Supabase
   **Project URL** and **anon key** (Supabase dashboard → Project Settings →
   Data API / API, or ask a teammate). This file is gitignored — never commit it.
5. **Run it:** `npm run dev` → open the printed URL, sign in.
6. **(For DB/function work) authenticate the CLIs:**
   ```bash
   gh auth login                                   # GitHub push access
   npx supabase login                              # paste a token from supabase.com/dashboard/account/tokens
   npx supabase link --project-ref zpndvbkbhfnxjjlzjiil   # enter the DB password
   ```

## Daily workflow

1. **Start fresh:** `git checkout main && git pull`.
2. **Branch:** `git checkout -b your-feature` (don't build directly on `main`).
3. **Develop** with `npm run dev`. Let Claude help — it will read the docs above.
4. **Before merging, it must build:** `npm run build` has to pass (this is what
   deploys). Also `npm run lint`.
5. **Commit & push** your branch, then open a **Pull Request** on GitHub (or
   merge to `main` when green). **Pushing to `main` auto-deploys** to
   https://byuaudio.github.io/avl-team-dashboard/, so only merge working code.
6. **Update the docs in the same change** — see "Keeping docs current" below.

## ⚠️ The shared database (most important collaboration rule)

There is **one** Supabase project, shared by everyone and by the live site. A
schema change takes effect **immediately for all of you**. So:

- **Coordinate before changing the schema.** Tell the other dev first.
- **Migrations are numbered and append-only.** Add a NEW file
  `supabase/migrations/0011_*.sql` (next number); **never edit an applied
  migration.** If you both add `0011`, rename one to `0012` before pushing.
- **Apply with** `npx supabase db push`. Only one person applies at a time.
- **Row types** in `src/lib/types.ts` must be updated to match any schema change.
- **Edge Functions** (`supabase/functions/*`) are also shared; redeploy with
  `npx supabase functions deploy <name>`.
- Business rules (pass-offs, pay ceilings) live in Postgres functions, NOT the
  UI. Don't add a client-side path around them.

(If schema conflicts become common, we can give each dev their own Supabase
project for development — ask and we'll set it up.)

## Keeping docs current (so we both stay unblocked)

When you make a meaningful change, update docs in the **same** commit:

- New architecture/decision → add an entry to [DECISIONS.md](DECISIONS.md)
  (newest first) and adjust [ARCHITECTURE.md](ARCHITECTURE.md) if the structure changed.
- New feature/scope change → reflect it in [PROJECT.md](PROJECT.md).
- New convention or invariant → [CONVENTIONS.md](CONVENTIONS.md).
- Pay-model changes → [COMPENSATION.md](COMPENSATION.md).

Because Claude's memory is per-machine, treat these docs as the shared brain: if
it's not in the code or these docs, the other developer won't know it.

## Handy commands

```bash
npm run dev      # local dev server
npm run build    # type-check + production build (must pass before merging)
npm run lint     # oxlint
npx supabase db push                       # apply new migrations (shared DB!)
npx supabase functions deploy <name>       # redeploy an Edge Function
```
