# Project

## Vision

One web app where the BYU Audio for Live Events student team finds the
information they need (dashboard) and tracks student training with a trustworthy
pass-off workflow — replacing the current Google Sheets training spreadsheets.

## Target users

- **Students** — see the dashboard, work through their training sheet, request
  pass-offs.
- **Student trainers** — everything a student can do, plus grant pass-offs on
  other employees' sheets (never their own).
- **Managers** (full-time staff, e.g. Taylor) — everything above, plus manage
  the roster/roles, edit the training template, post announcements, and correct
  mistakes (reset pass-offs).

## Core features (built)

- Per-employee email/password login (Supabase Auth), roles enforced by
  row-level security in the database.
- Dashboard: announcements, team roster, personal training progress, pending
  pass-off request count for trainers.
- Training sheet per employee: sections → items, statuses
  not started → pass-off requested → passed off (with who/when/notes).
- Pass-off workflow: students request on their own sheet; trainers/managers
  grant on others' sheets; nobody can pass off their own items; managers can
  reset.

## Roadmap

1. **Now:** replace placeholder training content with the real template
   (waiting on the template spreadsheet + Chase Smith's filled example).
2. Google Sheets sync (one-way export Supabase → Sheets) so existing
   spreadsheets stay current during the transition.
3. In-app admin UI for managers (edit template, roles, announcements) — today
   these are done in the Supabase dashboard.
4. More dashboard content (schedules, links, resources — TBD with the team).
5. Retire the Google Sheets entirely.

## Current priorities

Get a Supabase project created, the migration applied, and 2–3 real users
testing the pass-off flow end to end.

## Known limitations

- No password reset flow in the UI yet (managers can reset passwords from the
  Supabase dashboard).
- Managing the roster, template, and announcements requires the Supabase
  dashboard (no admin UI yet).
- Single shared training template for everyone; no per-position variants yet.
- Training content in `supabase/seed_placeholder_training.sql` is PLACEHOLDER,
  not the real template.
