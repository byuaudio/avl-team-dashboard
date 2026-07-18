# Conventions

## Load-bearing invariants (do not break)

1. `training_progress` is never written directly from the client — RPC
   functions only. RLS has no insert/update/delete policies on it, so a direct
   write should fail; keep it that way.
2. Role checks in the UI (`canGrantPassoffs`, `isManager`) are conveniences for
   showing/hiding controls. The database must enforce every rule independently.
3. Migrations are append-only: never edit a migration that may have been
   applied; add a new numbered file (`0002_...`, `0003_...`).
4. `src/lib/types.ts` mirrors the schema — update both in the same change.
5. `.env.local` is never committed. Only `VITE_`-prefixed env vars reach the
   browser, and only public values (URL, anon key) may use that prefix.

## Code style

- TypeScript, functional React components, hooks. No classes.
- Named exports for components (`export function DashboardPage()`); the only
  default export is `App`.
- Descriptive full-word names (`fetchProgressForEmployee`, not `fetchProg`).
- One concern per file; pages live in `src/features/<area>/`, shared UI in
  `src/components/`, non-UI logic in `src/lib/`.
- Comments explain intent or non-obvious constraints only.

## UI patterns

- Styling: plain CSS classes in `src/index.css`; design tokens (colors, radius,
  shadow) are CSS variables at the top. No CSS-in-JS, no utility framework.
- Reuse `.card`, `.stack`, `.training-table`, `.badge-*`, `.button-primary`,
  `.button-secondary`, `.muted`, `.error-text` before inventing new classes.
- Loading: render `<div className="page-message">Loading…</div>`.
- Errors: render `<p className="error-text">` with the error message.
- Data pages: fetch in `useEffect`, keep results in local state, re-fetch after
  mutations.

## Database

- snake_case for tables/columns/functions; RPC args prefixed `p_`.
- New tables: enable RLS in the same migration, write policies immediately.
- Business rules that must hold regardless of client behavior go in RPC
  functions (`security definer`, `set search_path = public`).
- After the blanket `revoke execute ... from anon, public` in migration 0001,
  every new function needs an explicit `grant execute` to the right role.
