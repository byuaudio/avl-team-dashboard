# Project

## Vision

One web app that runs the BYU Audio for Live Events student team: the trustworthy
training pass-off sheet is the core, growing into the team's operations hub
(pay, scheduling, time-reporting, evaluations, resources, roster) — replacing the
current tangle of Google Sheets, Google Forms, and (eventually) some of Asana and
Rentman.

## Roles & access

Roles, from most access to least. Access is a ladder for the top five, plus a few
off-ladder variants. Higher roles can do everything lower roles can.

| Role | Training sheet | Notable access |
| --- | --- | --- |
| **Audio Manager** (Taylor) | yes | Everything. Adjust pay rates/amounts. Assign **any** role (incl. Audio Manager). |
| **Full-Time** | yes | All below + **see pay rates**. Add members & assign roles up to **3/4-Time**. |
| **3/4-Time** | yes | Edit the training template & curriculum. Scheduling helper. Add members & assign roles up to **Student Trainer**. Trains students 1:1. |
| **Student Trainer** | yes | Grant pass-offs / check items off for students. Students book 1:1 training with them. |
| **Student** | yes | Own sheet: request pass-offs, set goals. Pay from training + loyalty. Works events as **A1** (lead) or **A2** (support). |

Off-ladder variants:
- **Freelancer** — may or may not have a training sheet; gets other features.
- **Non-Audio Student** — has a training sheet, but pay is **not** derived from it;
  no soft-skills self-eval or supervisor eval.
- **Office Student** (maybe) — not in audio; could be granted access to flag
  unreported time for students / student trainers / 3-4-Time (and maybe FT/AM).

Design note (for when we build it): replace the current 3-value `employee_role`
enum with this fuller set + a numeric rank for the ladder, so "assign roles up to
X" is a rank comparison; off-ladder roles handled as special cases. This gates
almost every roadmap item, so it's the natural foundation to build first.

## Archiving

Students will be **archived** (not deleted) — possibly for years. Text records
(profiles, progress) are tiny, so keeping them indefinitely is fine; the only real
storage pressure is uploaded **photos**. Plan: an `archived` flag + `archived_at`;
revisit a deletion timeline only if Storage fills. (See "Hosting limits" below.)

## Core features (built)

- Email/password login (Supabase Auth); rules enforced by row-level security +
  Postgres RPC, not the UI.
- Real training template: 8 levels (1–7 + Misc) → categories (Principles /
  Certifications / Venues / Events) → groups → **items**, ~666 items.
- Per-item milestone sign-off (Introduced, Guided, Supervised, Passed Off,
  Submitted, Tested): students **request**, trainers/managers **Approve**;
  nobody signs their own; managers reset. Auto un-stars when fully complete.
- Goals (star), item detail (photo + explanation, manager-editable), per-section
  progress bars (green done / gold starred), collapse-by-default tree.
- Manager **Edit Template** page: rename / add / delete / drag-reorder & re-nest,
  set item sign-off style, **venue tags** (an event group surfaces its venue's
  items inline).
- In-app **Add team member** (manager-only, Supabase Edge Function).
- Live on GitHub Pages; every push to `main` auto-deploys.

## Roadmap

Rough sequence — we work section by section; ask which to focus on next.

1. **Expanded roles & access model** (foundation for most items below).
2. **Phase 2 — Pay:** per-category $ amounts; a student earns `amount × % of that
   category's items completed`, plus **loyalty**. Pay visible to Full-Time / Audio
   Manager; rates adjustable by Audio Manager.
3. **Soft-skills self-evaluation** — replace the ~42-question Google Form; log &
   tag per semester to track improvement over time.
4. **Soft-skills team (supervisor) evaluation** — Audio Manager (+ delegates)
   rates each student/trainer; feeds the semesterly raise; each cycle starts by
   duplicating last review, adding new people, and adjusting.
5. **Time-reporting status** — flag Workday time not reported for an event; show a
   warning + deadline; past deadline → probation (scheduler stops assigning them).
6. **Scheduling helper** — pick an event/venue → list people passed off for those
   roles/venues, with time-reporting status (red if on probation).
7. **Training scheduling** — students book 1:1s with trainers / 3-4-Time / FT /
   Audio Manager (incl. the Audio Manager grilled-cheese chat).
8. **Games** — mini-games unlocked by completing a level; top-10 leaderboard per game.
9. **Show reports** — each event's A1 fills out a post-event questionnaire.
10. **Employee profile** — contact info, working status (e.g. away for summer),
    desired hours/week.
11. **Team roster** — everyone + contact (tap phone to call/text); emergency
    contact name/number at top sourced from a Google Calendar.
12. **Announcements / housekeeping** — temporary notices.
13. **Student resources** — training/reference links; event resources (drafting, docs).
14. **Event calendar** — who's crewed.
15. **Task center** — tagged tasks (aim: replace Asana).
16. **Retire the Google Sheets / Forms** entirely.

## Integrations (exploratory)

- **Nowsta** (event crewing) — the highest-leverage connection. Events are the hub
  entity most roadmap items orbit (show reports, time-reporting, scheduling helper,
  event calendar, task center). If we can import Nowsta's event schedule + crew
  assignments (API, webhook, or export), that one feed unlocks a cluster of
  features. First step when we get there: confirm what Nowsta actually exposes.
- **Rentman** (inventory) — replacing it is a large, separate build; long-term.
  Near-term, at most deep-link. Training already names gear/venues, so an eventual
  inventory module could tie to item pass-offs.

## Hosting limits

Supabase free tier (approx.): ~500 MB Postgres, ~1 GB file Storage, generous API
egress, and it **pauses a project after ~1 week of inactivity** (manual resume).
Implications: text data (people, progress, evals) is negligible — archive forever.
Watch **photo Storage** and the inactivity pause; the ~$25/mo Pro tier removes the
pause and raises limits if/when the team relies on it daily.

## Known limitations

- No password-reset flow in the UI (managers reset from the Supabase dashboard).
- Roles are still the original 3 (student / student_trainer / manager) — the
  expanded model above is not built yet.
- Onboarding (Level 1) and Misc. don't fit the 4-category model; not normalized.
- Item photos are set by pasting a URL; no upload button yet.
