# Architecture Decision Log

Newest entries first. Routine changes get a one-line note under "History";
entries here are decisions that shape the architecture.

---

## 2026-07-17 — Static SPA on GitHub Pages, no application server

**Decision:** Build a React + Vite + TypeScript single-page app hosted on
GitHub Pages, talking directly to Supabase from the browser.

**Reasoning:** Taylor specified GitHub hosting and Supabase. GitHub Pages only
serves static files, so any server-rendered framework (Next.js etc.) would need
different hosting. Supabase is designed for direct-from-browser use with RLS.

**Alternatives considered:** Next.js on Vercel (rejected: different host than
requested, more moving parts); adding a small API server (rejected: nothing
requires one yet; Sheets sync can run as a GitHub Action or Supabase Edge
Function later).

**Benefits:** Free hosting, trivial deploys, minimal infrastructure.
**Tradeoffs:** All security must live in the database (see next entry); no
server-side secrets; HashRouter URLs (`/#/training`).

---

## 2026-07-17 — Pass-off rules enforced in Postgres via RPC functions

**Decision:** Clients never insert/update/delete `training_progress` directly.
All writes go through `security definer` RPC functions (`request_passoff`,
`cancel_passoff_request`, `grant_passoff`, `reset_passoff`) that enforce:
students act only on their own sheet; only trainers/managers grant; no one
grants their own; only managers reset.

**Reasoning:** With no app server, the browser is untrusted — anyone can call
the Supabase API directly with their own session. Rules in RPC functions hold
no matter what the UI does, and the training record is the thing that must be
trustworthy.

**Alternatives considered:** RLS-only with column checks (rejected: cannot
cleanly express "may set status to requested but not to passed_off" per role);
UI-only enforcement (rejected: trivially bypassable).

**Benefits:** Single authoritative home for business rules; UI stays simple.
**Tradeoffs:** Rule changes need a migration; RPCs are less discoverable than
plain table writes (mitigated by CLAUDE.md critical rules).

---

## 2026-07-17 — Roles as an enum on profiles (student / student_trainer / manager)

**Decision:** One `role` column, auto-provisioned profile row via trigger on
auth signup, invite-only account creation, first manager promoted via SQL.

**Reasoning:** Matches the described team structure exactly; small team, no
need for a permissions matrix.

**Alternatives considered:** Separate roles/permissions tables (rejected:
overkill); Supabase custom claims in JWT (rejected: harder to inspect and
change; profile row is visible and editable by managers).

**Tradeoffs:** A person with two hats needs the higher role; fine at this scale.

---

## 2026-07-17 — Single shared training template; progress rows created lazily

**Decision:** `training_sections` + `training_items` form one global template;
`training_progress` rows exist only once an item has activity (missing row =
not started).

**Reasoning:** The team described one training sheet for all student
employees. Lazy rows mean adding a template item never requires backfilling
every employee. **ASSUMED** until the real template arrives — revisit if
different positions have different sheets.

**Tradeoffs:** Multi-template support would need a `templates` table and an
assignment column later; the lazy-row convention must be understood by
every consumer (documented in ARCHITECTURE.md).

---

## 2026-07-17 — Google Sheets sync deferred to phase 2

**Decision:** Build the app as the source of truth from day one; add a one-way
export (Supabase → Google Sheets) later if the team still needs the
spreadsheets during transition.

**Reasoning:** Two-way sync is a large source of complexity and conflict bugs.
Taylor's stated end state is everything living in the web app, so investment
in sync should be minimal and disposable.

---

## History

- 2026-07-17 — Project scaffolded (Vite react-ts template), plain CSS design
  tokens instead of a CSS framework, placeholder training seed data created.
