# AI Notes (for future AI sessions, not user-facing)

## Working relationship

Taylor (taylor_glad@byu.edu) is the product owner and tester, not a coder.
Explain changes in plain English, give exact manual test steps with expected
results, and flag judgment calls. The full working agreement was given in the
first session; its durable rules are baked into CLAUDE.md.

## Environment quirks

- Node.js is installed **user-locally** at
  `~/.local/node/node-v24.18.0-darwin-x64/bin` (Intel Mac, no Homebrew). It was
  added to `~/.zshrc` and `~/.bash_profile`, but non-login shells may need
  `export PATH="$HOME/.local/node/node-v24.18.0-darwin-x64/bin:$PATH"` before
  npm commands.
- The project folder name contains a space (`Employee Dashboards`) — quote
  paths in shell commands.

## Assumptions (mark resolved when confirmed)

- **ASSUMED — most important:** the training sheet content in
  `supabase/seed_placeholder_training.sql` is invented. Taylor has a real
  template spreadsheet and a filled-out example (employee Chase Smith) that
  were never received. When they arrive: replace the seed content, and check
  whether the schema needs more fields (e.g. per-item pass-off signature lines,
  dates, section notes, multiple pass-off levels/initials).
- ASSUMED: one shared training template for all employees.
- Account creation: managers add members in-app via the `add-team-member` Edge
  Function (RESOLVED — replaces "dashboard only"). Public signups stay disabled;
  the function is the only creation path besides the dashboard. Temp passwords
  are manager-set; invite-by-email would need SMTP configured in Supabase.
- ASSUMED: BYU navy (#002E5D) branding is welcome. Official BYU branding rules
  were not checked.

## Verification status

- VERIFIED: `npm run build` and `npm run lint` pass; the production build
  serves via `vite preview` and shows the correct title.
- NOT YET VERIFIED: the `add-team-member` Edge Function end-to-end (deploy,
  manager-only rejection for non-managers, account creation, role assignment).
  Deploy via the dashboard Edge Functions editor or `supabase functions deploy`,
  then test per SETUP.md step 9.
- NOT YET VERIFIED (no Supabase project existed when built): the migration SQL
  applying cleanly, login, RLS visibility rules, all four RPC functions, the
  signup trigger, and the GitHub Pages workflow. Treat all of these as untested
  until Taylor completes SETUP.md and reports results — test them before
  building features on top.

## Pitfalls

- **FullCalendar versions must all match (and 6.1.21 supports React 19).** Use
  `@fullcalendar/core`, `react`, `daygrid`, `timegrid`, `interaction` ALL at
  `6.1.21`. `@fullcalendar/react@6.1.21` already supports React 19 (peer allows
  `^19`). Do NOT mix `@fullcalendar/react@7` with core@6 — react@7 depends on
  core@7, so the mix loads two incompatible core copies and throws at runtime
  ("Class constructor DayTimeColsView cannot be invoked without 'new'"). v7 of
  core/plugins is partly pre-release; stay on 6.1.21 across the board. CalendarPage
  casts `plugins`/`events`/`eventClick` `as never` (harmless leftover; types are
  consistent at 6.1.21). `temporal-polyfill` is installed (was a react@7 peer) —
  harmless to keep. After changing FullCalendar versions, do a **clean reinstall**
  (`rm -rf node_modules package-lock.json && npm install`): the react@7→6 switch
  left `@full-ui/headless-calendar` (a react@7 dep) carrying a 2nd copy of
  `@fullcalendar/core@7`, and two cores throw the same error. `vite.config.ts` sets
  `build.target: 'esnext'` so native classes aren't down-leveled.


- Migration 0001 ends with a blanket
  `revoke execute on all functions in schema public from anon, public` —
  any function added later needs an explicit grant (see CONVENTIONS.md).
- RLS policies call `current_employee_role()` / `is_trainer_or_manager()`,
  which are `security definer` specifically to avoid infinite recursion when
  reading `profiles` from a `profiles` policy. Don't "simplify" them into
  inline subqueries.
- `request_passoff` silently no-ops its update path when the item is already
  passed off, then raises — the raise-after-upsert shape is deliberate but
  worth revisiting if it confuses anyone.
- GitHub Pages serves the app under `/<repo-name>/`, hence HashRouter and the
  `--base` flag in the deploy workflow. BrowserRouter will 404 on refresh.
- The first manager account must be promoted manually with SQL (SETUP.md step);
  the signup trigger creates everyone as `student`.
