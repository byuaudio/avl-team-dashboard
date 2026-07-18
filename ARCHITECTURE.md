# Architecture

## System overview

```
Browser (React SPA, GitHub Pages) ──supabase-js──▶ Supabase
                                                    ├─ Auth (email/password sessions)
                                                    └─ Postgres (data + ALL security rules)
```

There is **no application server**. The SPA talks to Supabase directly with the
public anon key; row-level security (RLS) and RPC functions in Postgres are the
only security boundary. The anon key being visible in the browser is expected
and safe *only because* of that — which is why the security rules must never be
enforced UI-side only.

## Data model

Defined in [supabase/migrations/0001_initial_schema.sql](supabase/migrations/0001_initial_schema.sql);
row types mirrored in [src/lib/types.ts](src/lib/types.ts).

| Table | Purpose |
| --- | --- |
| `profiles` | One row per employee (name, role, active flag), 1:1 with `auth.users`, auto-created by trigger on signup/invite |
| `training_sections` | Training sheet template: section headings |
| `training_items` | Training sheet template: individual pass-off items within a section |
| `training_progress` | Per-employee status per item (missing row = not started) |
| `announcements` | Dashboard announcements |

Enums: `employee_role` = student / student_trainer / manager;
`training_status` = not_started / passoff_requested / passed_off.

### Access rules (enforced in Postgres)

- Reads: everyone signed in sees the roster, template, and announcements.
  Students see only their own progress; trainers/managers see everyone's.
- Writes to `training_progress` happen **only** via RPC functions:
  - `request_passoff(item)` — caller's own sheet only
  - `cancel_passoff_request(item)` — caller's own sheet, while still requested
  - `grant_passoff(employee, item, notes)` — trainers/managers, never their own sheet
  - `reset_passoff(employee, item)` — managers only
- Template, roster, announcements writes: managers only (RLS policies).

## Frontend structure

```
src/
  main.tsx                     entry point
  App.tsx                      routes (HashRouter) + Supabase-not-configured screen
  index.css                    all styling; design tokens at the top
  lib/
    supabaseClient.ts          Supabase client singleton + configured check
    types.ts                   DB row types (keep in sync with migrations)
    api.ts                     ALL database reads/writes
  components/
    Layout.tsx                 header, nav, sign-out (routes render in <Outlet>)
    StatusBadge.tsx            colored training-status pill
  features/
    auth/AuthContext.tsx       session + profile state, useAuth() hook, role flags
    auth/LoginPage.tsx         email/password sign-in
    auth/RequireAuth.tsx       route guard (redirect to /login, block inactive)
    dashboard/DashboardPage.tsx
    training/TrainingSheet.tsx      one employee's sheet + all pass-off actions
    training/MyTrainingPage.tsx     own sheet (wraps TrainingSheet)
    training/TeamTrainingPage.tsx   trainer/manager roster + progress overview
    training/EmployeeTrainingPage.tsx  trainer/manager view of one employee
```

Routes: `/login`, `/` (dashboard), `/training`, `/team`, `/team/:employeeId`.

## Data flow

Pages load data in `useEffect` via `src/lib/api.ts`, hold it in local state, and
re-fetch after a mutation. No client cache/state library yet — add one only if
staleness becomes a real problem (log it in DECISIONS.md).

## Deployment

Push to `main` → [.github/workflows/deploy.yml](.github/workflows/deploy.yml)
builds with `--base=/<repo-name>/` and publishes `dist/` to GitHub Pages.
Supabase URL/anon key come from GitHub Actions **variables** at build time.

## Where to change what

| Change | File(s) |
| --- | --- |
| Add/modify a database query | `src/lib/api.ts` (+ `src/lib/types.ts` if shape changes) |
| Change pass-off rules | new migration with `create or replace function` |
| Schema change | new file in `supabase/migrations/` + `src/lib/types.ts` |
| New page | `src/features/<area>/`, route in `App.tsx`, link in `components/Layout.tsx` |
| Look & feel | `src/index.css` (tokens at top for colors/spacing) |
| Training sheet UI/actions | `src/features/training/TrainingSheet.tsx` |
| Login/session/role logic | `src/features/auth/` |
| Deploy pipeline | `.github/workflows/deploy.yml` |
