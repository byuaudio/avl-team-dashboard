# BYU Audio for Live Events — Team App
## Security & Architecture Overview for SOC Review

**Prepared:** 2026-07-23 · **Owner:** BYU Audio for Live Events (student team)

**Purpose of this document.** We are building an internal web app for our student
audio crew (training tracking, pay calculation, scheduling, roster). Before we
grow it further, we want the Security Operations Center to evaluate:

1. Whether the data we handle is appropriately protected, and what the **most
   secure** architecture would be.
2. Whether the same capabilities could/should be provided a **different way**
   (e.g., a different database/hosting provider, BYU-hosted infrastructure, BYU
   single sign-on).
3. How to **isolate this project** so a compromise here cannot cause **lateral
   damage** to other BYU systems or projects (and vice-versa).

---

## 1. What the app is

A React single-page web app (static files) backed by a managed cloud database
(Supabase / PostgreSQL). It replaces a set of Google Sheets/Forms the team used
to manage student-employee training, pay, and scheduling. It is currently used
only by our team and is **not** connected to any BYU internal system.

---

## 2. Feature areas & data at a glance

| Feature area | Data it handles | Sensitivity |
| --- | --- | --- |
| **Training checklist** | Who has been trained/passed off on each skill, dates, who signed off | Internal — employment/education record |
| **Scheduling tool** | 1:1 training availability & bookings, times | Internal |
| **User contact information** | Name, BYU ID, NetID, phone, personal + BYU email, building key/card access | **PII (high)** |
| **Employee pay rates** | Base rate, computed rate, raises, pay history, adjustments | **Financial / HR (confidential)** |
| **Performance & soft-skills evaluations** | Self/supervisor scores, star awards, policy penalties, notes | **Confidential HR** |
| **Loyalty / hours** | Maintenance & event hours worked per semester | HR |
| **Roster & roles** | Team members, roles/permissions, active/archived status | Internal |
| **Announcements / resources** (planned) | Notices, reference links | Internal / Public |

---

## 3. Data inventory & classification (detailed)

| Data element | Examples | Classification | Where stored |
| --- | --- | --- | --- |
| Identity & contact | Full name, BYU ID, NetID, personal Gmail, BYU email, phone | PII | Supabase Postgres |
| Physical access | Key/copy numbers, card access (Clyde, ITB, etc.) | Sensitive PII (facility access) | Supabase Postgres |
| Auth credentials | Email + password login | Secret (hashed by Supabase Auth) | Supabase Auth (managed) |
| Training records | Item sign-offs, dates, approver, goals | Employment/education record | Supabase Postgres |
| Pay | Base rate, computed rate, adjustments, submitted/cleared rate, pay history | Financial/HR confidential | Supabase Postgres |
| Evaluations | Soft-skill self/supervisor scores, performance stars, penalties, notes | Confidential HR | Supabase Postgres |
| Hours/loyalty | Per-semester maintenance/event hours | HR | Supabase Postgres |
| Scheduling | Trainer availability, booking requests, times, topics | Internal | Supabase Postgres |
| Photos (optional) | Reference images for training items | Low | Supabase Storage (if used) |

---

## 4. Current architecture & hosting

- **Frontend:** React + Vite + TypeScript compiled to static files. No server-side
  application code.
- **Hosting:** GitHub Pages (public static hosting) at a public URL. Anyone with
  the URL can load the app shell; data access requires login (see §5).
- **Backend:** Supabase — managed PostgreSQL, Supabase Auth, and a few serverless
  "Edge Functions." No self-managed servers.
- **Data location / residency:** the primary project runs in Supabase region
  **ca-central-1 (Canada)**. (A second, unused project exists in us-west-2 — to be
  removed.) *Data residency may need review.*
- **CI/CD:** GitHub Actions builds and deploys automatically on every push to the
  `main` branch. Build-time config (project URL, public key) is stored as GitHub
  Actions variables.
- **External integrations:** **none currently.** Workday, Nowsta, and Rentman are
  referenced by humans but not connected; all data is entered manually. Future
  integrations (e.g., Nowsta event schedule) are on the roadmap and would each add
  a new trust boundary.

**Data flow:** Browser (student/staff) → HTTPS → Supabase API (Auth + Postgres,
protected by row-level security) → responses to browser. Static assets served
separately from GitHub Pages.

---

## 5. Security model (as built)

- **Authentication:** Supabase Auth, email + password, **invite-only** (public
  sign-up disabled). **No MFA and no BYU single sign-on yet.**
- **Authorization:** Every database table has **row-level security (RLS)**.
  Sensitive write operations (pay-off approvals, pay changes, role changes,
  bookings) run through PostgreSQL `SECURITY DEFINER` functions that enforce the
  rules in the database, not the browser. An 8-tier role model
  (Student → Student Trainer → 3/4-Time → Full-Time → Audio Manager, plus
  Freelancer / Non-Audio / Office) with a numeric rank governs who can see/do
  what (e.g., only Full-Time+ can see pay; only the Audio Manager can change pay).
- **Keys/secrets:**
  - The **anon (public) key** is intentionally public — it is embedded in the
    browser app and the public repo. It grants **no** access on its own; RLS is
    what protects data.
  - The **service_role key** (full database bypass) exists **only** in
    server-side Edge Function environment variables (managed by Supabase). It is
    never in the browser or the repo.
  - No other secrets are stored in the client or source.
- **Transport:** HTTPS end-to-end.
- **Net effect:** the confidentiality of all data rests on (a) the correctness of
  the RLS policies and (b) the security of the Supabase account/organization and
  the GitHub account.

---

## 6. Isolation & blast radius (lateral-movement analysis)

**Relative to BYU systems (the main lateral-damage question):**
- The app is **fully external** to BYU: it lives in a team-owned GitHub
  organization and the Supabase cloud. It holds **no credentials to, and has no
  network path into, any BYU system** (no VPN, no database links, no shared
  service accounts). A compromise of this app therefore **cannot pivot into BYU
  infrastructure.**
- The converse is also true: it is **outside BYU's network and identity
  controls**, so it does not benefit from BYU's protections (SSO, MFA,
  monitoring). This is the central trade-off for the SOC to weigh.

**Within our own footprint:**
- **Supabase organization:** two projects currently share one Supabase org. A
  compromise of that account (or its billing/owner login) could affect both
  projects. *Recommend:* remove the unused project, enforce MFA on the Supabase
  account, restrict dashboard access, and consider separate organizations for
  isolation.
- **service_role key:** if leaked, it bypasses all RLS = full data compromise. It
  currently lives only in Supabase-managed function env. Protecting the Supabase
  account is paramount; rotate keys periodically.
- **GitHub:** the repository is **public** and deploys automatically. A
  compromised collaborator account could push code that deploys to the live site.
  *Recommend:* require 2FA for all collaborators, enable branch protection on
  `main`, and keep the collaborator list minimal.
- **Public anon key + public repo:** the database URL and anon key are effectively
  public, so **RLS is the only barrier** to the data. *Recommend* an independent
  RLS review / penetration test.
- **Dependency on third parties:** availability and data integrity depend on
  Supabase and GitHub. No other systems depend on this app, so its failure does
  not cascade elsewhere.

---

## 7. Compliance considerations (for BYU context)

- **FERPA:** training and evaluation records of student employees may constitute
  protected education/employment records. They are stored in a **third-party
  cloud outside BYU governance** — likely warrants BYU OIT / data-governance /
  FERPA review.
- **PII & facility access:** BYU ID, NetID, phone, personal email, and physical
  **key/card access** data are stored; access-control data is especially
  sensitive.
- **Financial/HR:** pay rates, history, and evaluations are confidential.
- **Data residency:** currently Canada (ca-central-1); BYU may require US or
  on-prem storage.
- **Governance gaps to define:** formal backup/retention policy, audit logging
  beyond Supabase defaults, incident response, and data-subject handling.

---

## 8. Alternatives to evaluate (could this be provided another way?)

| Component | Current | Alternatives to consider | Notes / impact |
| --- | --- | --- | --- |
| Database + backend | Supabase (managed Postgres + Auth + RLS + functions) | BYU-hosted PostgreSQL + custom API; AWS (RDS + Cognito + API Gateway/Amplify); Azure (Postgres Flexible + Entra ID); GCP; Firebase; Neon/PlanetScale + API | Moving off Supabase means re-implementing authentication, an authorization layer equivalent to RLS, and an API tier. Largest lift. |
| Authentication | Supabase email/password (no MFA) | **BYU single sign-on (CAS / SAML / OIDC) + Duo MFA** | Likely the highest-value change: no separate passwords, ties to BYU identity lifecycle (automatic deprovisioning), enforced MFA. |
| Hosting | Public GitHub Pages (static) | BYU web hosting; an access-restricted host; keep static hosting but gate by SSO | The app is a static bundle; data is RLS-gated regardless of where the bundle is served. Restricting the host adds defense-in-depth. |
| Data location | Canada (ca-central-1) | US region, or BYU-controlled storage | Choose to meet BYU data-location policy. |
| Secrets management | Provider-managed env vars | Dedicated secrets manager if architecture grows | Minimal today (one privileged key). |

We are open to migrating any of these if the SOC recommends it; the app is small
enough (early stage) that changing providers now is feasible.

---

## 9. Known limitations & current risks (candid)

- RLS is the sole data barrier (anon key is public) — its correctness is critical
  and unaudited by a third party.
- No MFA and no BYU SSO yet.
- One shared Supabase account/organization currently spans two projects.
- Data is in a third-party cloud, in Canada, outside BYU governance.
- Source repository is public.
- No formal audit-logging, backup, or retention policy defined.
- Planned integrations (e.g., Nowsta) will introduce new credentials/trust
  boundaries to secure.

---

## 10. Full feature roadmap (context for future data & risk)

**Built today:** email/password login; role/permission model; training template &
per-skill sign-off workflow; goals; item detail (photo + explanation); manager
template editor; in-app member management (add, roles, archive, password reset);
pay engine (training %, loyalty, soft-skills, performance stars, policy
penalties, adjustments, payroll-cleared rate + history, CSV export); trainer
availability (scheduling, phase 1).

**Planned:** student booking calendar + approvals + notifications + calendar
export (scheduling phase 2); full soft-skills questionnaire; employee profiles &
team roster with contact info; time-reporting/probation status; scheduling helper
(who is qualified for an event/venue); student resources; announcements; show
reports; event calendar; task center; mini-games; possible integrations with
**Nowsta** (event crewing) and **Rentman** (inventory).

Each planned item that adds contact info, evaluations, or an external integration
increases the data-sensitivity and attack surface noted above.

---

## 11. Questions for the SOC

1. Is a **third-party managed cloud** (Supabase) acceptable for this FERPA/PII/pay
   data, or should it be **BYU-hosted**?
2. What are the **data-residency** requirements (US / Canada / on-prem)?
3. Should we adopt **BYU SSO (CAS/OIDC) + Duo MFA** instead of app-managed
   passwords? Is MFA required for admin accounts at minimum?
4. Is **public static hosting** acceptable, or must the app be access-restricted
   at the host/network level?
5. What **backup, retention, and audit-logging** standards must we meet?
6. Are there **approved/preferred providers** we should target if we migrate?
7. Are there requirements to **isolate this project** from other BYU projects
   (separate accounts/tenancy), and any objection to the current external
   footprint?
8. Would the SOC like to perform (or require) an **RLS/authorization review** or
   penetration test before we store more real data?
