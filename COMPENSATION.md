# Compensation model

How a student's hourly rate is computed. Source: the "Chase Smith" filled sheet
+ the product owner's formulas. Verified against Chase (total $17.11). Not all
of this is built yet — see "Status" per section.

## Total rate

```
rate = starting_rate
     + prior_semesters_credit
     + Σ training categories               (BUILT — Phase 2 part 1)
     + loyalty                             (spec'd, not built)
     + soft_skills                         (spec'd, not built)
     + performance_stars                   (spec'd, not built)
     − audio_crew_policy_penalties         (spec'd, not built)
```

Chase check: 14.00 base + 0.50 prior + ~0.77 training + 0.96 loyalty + 0.87 soft
skills + 0.00 stars − 0.00 penalties ≈ **$17.11**. ✓

- **starting_rate** — per employee, default $14.00 (BUILT: profiles.base_rate).
- **prior_semesters_credit** — a grandfathered credit for semesters worked
  before detailed tracking began: `count × per_semester_value` (Chase: 2 × $0.25
  = $0.50). AM-editable.

## Training categories (BUILT)

Per category: `amount × (completed items ÷ active items)`. Only the item's final
sign-off counts; retired items stay in the numerator, so a category can exceed
100%. (Chase L2 Principles = 117% → $0.06.)

## Per-semester records

Each employee has a list of semesters they've worked. Semesters = 3/year:
**Winter, Summer, Fall**. Each semester record holds: maintenance hours, other
hours (events + training combined), self-eval score, supervisor score. Loyalty
and soft-skills are summed across all the employee's semesters.

## Loyalty (per semester, then summed)

```
raise = ((maint·wMaint + other·wOther) / (expMaint·wMaint + expOther·wOther)) · avgValue
```

AM-editable metrics (current values): expMaint = 0, expOther = 240,
wMaint = 60%, wOther = 40%, avgValue = $0.10.

- Meets expectations (0 maint, 240 other) → $0.10.
- Because expMaint = 0, maintenance hours are pure bonus (numerator only): 240
  maint + 0 other → $0.15. Verified against the P37 formula.

## Soft skills (per semester, then summed)

Uses the **supervisor** score only (self-eval is displayed for the employee's
own tracking but does NOT affect pay).

```
raise = (supScore − benchmark) / (max − benchmark) · additionalAtMax + benchRaise
```

AM-editable: benchmark = 280, benchRaise = $0.10, max = 420, additionalAtMax =
$0.20. So **max total at 420 = $0.30** ($0.10 + $0.20 additional). One straight
line, extended below the benchmark:

- 280 → $0.10, 420 → $0.30, 210 → $0.00, 140 → −$0.10.

Confirmed against the P49 formula (T48 = benchRaise $0.10, T49 = additionalAtMax
$0.20) and the product owner's examples.

Scores are the SUM of the ~42-question soft-skills questionnaire (see page 28 of
the sheet). Plan: enter the totals directly at first; build the full
questionnaire (self + supervisor, logged per semester) as its own feature later.

## Performance stars (spec'd)

Six metrics, each 0–5 stars: Organization, Work Ethic, Efficiency,
Troubleshooting, Mixing Quality, Client Interactions. All filled (30 stars) =
$3.00 → $0.10/star (star value AM-editable). The Audio Manager awards stars each
semester; 3/4-time & Full-time can NOMINATE a student for a star with a note.
Each awarded star carries a note. Max 5 per metric.

## Audio crew policies (spec'd)

A list of offenses (line items, AM-editable). Each offense carries a penalty of
the SAME AM-defined amount, and can be applied multiple times, each with a note
(like stars, but negative). Displayed alongside a **termination reasons** list
(display-only, editable line items — kept here because it belongs next to the
behavior penalties even though it doesn't change pay).

## AM-editable settings (global)

expMaint, expOther, wMaint, wOther, avgValue, softBenchmark, softMax, benchRaise,
maxRaise, starValue, penaltyPerOffense, priorSemesterValue. All adjustable by the
Audio Manager.
