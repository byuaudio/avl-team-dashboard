# One-Time Setup Walkthrough

Written for the product owner — no coding required. Do these in order.
Estimated time: 30–45 minutes.

## 1. Create the Supabase project

1. Go to <https://supabase.com>, sign in (create a free account if needed).
2. **New project** → name it `avl-team-dashboard`, pick a strong database
   password (save it in a password manager), region **West US**.
3. Wait for the project to finish provisioning (~2 minutes).

## 2. Apply the database schema

1. In the Supabase dashboard, open **SQL Editor** → **New query**.
2. Open the file `supabase/migrations/0001_initial_schema.sql` from this
   project, copy ALL of it, paste it into the editor, press **Run**.
   ✅ Correct result: "Success. No rows returned".
3. Repeat with `supabase/seed_placeholder_training.sql` (temporary placeholder
   training items — we'll replace these with your real template).

## 3. Lock down sign-ups

1. **Authentication → Sign In / Up → Providers → Email**: leave Email enabled, but turn
   **off** "Allow new users to sign up". (Accounts will be created by
   invitation only.)

## 4. Create your own account and make it a manager

1. **Authentication → Users → Add user → Create new user**: your email +
   a password. ✅ A row for you appears in the users list.
2. **SQL Editor → New query**, run (with your email in the quotes):

   ```sql
   update profiles set role = 'manager', full_name = 'Taylor Glad'
   where id = (select id from auth.users where email = 'taylor_glad@byu.edu');
   ```

   ✅ Correct result: **"Success. No rows returned"**. (That's normal for an
   `update` — it means the statement ran, *not* that nothing changed.)
3. Confirm it actually set your role — run this and check the output:

   ```sql
   select p.full_name, p.role, u.email
   from profiles p
   join auth.users u on u.id = p.id
   where u.email = 'taylor_glad@byu.edu';
   ```

   ✅ Correct result: one row showing `full_name = Taylor Glad` and
   `role = manager`. If you get **zero rows**, your profile is missing (the
   sign-up trigger didn't fire) — ask your AI assistant to help.

## 5. Connect the app locally

1. In Supabase: **Project Settings → API**. Copy the **Project URL** and the
   **anon public** key.
2. In this project folder, duplicate `.env.example` and rename the copy to
   `.env.local`; paste in the two values.
3. In Terminal:

   ```bash
   cd "/Users/macmini2/Documents/Employee Dashboards"
   npm run dev
   ```

4. Open the printed URL (usually <http://localhost:5173>).
   ✅ Correct result: a "BYU Audio for Live Events" sign-in page. Sign in with
   the account from step 4 — you should land on the dashboard and see
   "My Training", and (as a manager) "Team Training" in the nav.

## 6. Invite the rest of the team

Two ways to add people:

- **In the app (recommended):** once you've done step 9, sign in as a manager →
  **Team Training → "Add a team member"** → enter their name, email, a temporary
  password, and role. They can sign in immediately and change the password
  later. (Requires the Edge Function from step 9 to be deployed.)
- **In Supabase:** **Authentication → Users → Add user** (create with a
  temporary password). They start as **Student**. To promote someone later, run
  in SQL Editor:

```sql
update profiles set role = 'student_trainer'
where id = (select id from auth.users where email = 'THEIR-EMAIL');
```

## 7. Publish on GitHub Pages

1. Create a GitHub repository (e.g. `avl-team-dashboard`) and push this
   project to its `main` branch. (Ask your AI assistant to do this step.)
2. On GitHub: **Settings → Pages → Source: GitHub Actions**.
3. **Settings → Secrets and variables → Actions → Variables tab → New
   repository variable**, twice:
   - `VITE_SUPABASE_URL` = the Project URL from step 5
   - `VITE_SUPABASE_ANON_KEY` = the anon key from step 5
4. Push to `main` (or **Actions → Deploy to GitHub Pages → Run workflow**).
   ✅ Correct result: the workflow goes green and the app is live at
   `https://<your-github-username>.github.io/<repo-name>/`.
5. In Supabase: **Authentication → URL Configuration → Site URL** — set it to
   that GitHub Pages URL.

## 8. Smoke-test the pass-off rules (important)

With two accounts (your manager account + one student account, e.g. in a
private browser window):

1. As the student: My Training → **Request pass-off** on an item.
   ✅ Badge changes to "Pass-off requested"; no "Pass off" button anywhere on
   your own sheet.
2. As the manager: Team Training → click the student → **Pass off** the
   requested item. ✅ Badge turns green "Passed off — by <you>".
3. As the student again (refresh): ✅ item shows green with your manager's name.

If anything doesn't match, report exactly what you saw.

## 9. Turn on in-app "Add team member" (deploy the Edge Function)

This deploys the small server function that lets managers add users from inside
the app. **No terminal needed** — do it in the Supabase dashboard:

1. In Supabase, open **Edge Functions** (left sidebar) → **Create a function**
   (or **Deploy a new function → Via Editor**).
2. Name it **exactly** `add-team-member` (the app calls it by this name).
3. Delete the sample code, then paste in the entire contents of
   `supabase/functions/add-team-member/index.ts` from this project (open it in
   VS Code, Select All, Copy).
4. Leave **Verify JWT** / "Enforce JWT verification" **ON** (only signed-in
   users may call it). Click **Deploy**.
   ✅ Correct result: the function shows as deployed with a green/active status.
   No secrets to set — Supabase injects the service key automatically.
5. Test it: in the app, sign in as your manager account → **Team Training →
   "Add a team member"** → add a test student. ✅ They appear in the roster and
   can sign in with the email + temporary password you set.

(Advanced/optional — deploy from your computer instead:
`supabase functions deploy add-team-member --project-ref zpndvbkbhfnxjjlzjiil`,
after installing the Supabase CLI and running `supabase login`.)
