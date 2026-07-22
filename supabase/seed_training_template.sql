-- Real training template content (from "Template New Training Sheet").
--
-- STATUS: VALIDATION SLICE — Level 1, part of Level 2, and one venue-event
-- example, covering all four milestone styles. The remaining levels get added
-- here once the product owner confirms this structure matches the sheet.
--
-- Re-runnable: it wipes and reinserts the template. NOTE: deleting
-- training_nodes cascades to milestone_progress, so only re-run while there is
-- no real employee progress yet (true during Phase 1 development).
--
-- Run with:  npx supabase db execute --file supabase/seed_training_template.sql
-- (or psql). Not a migration, because the content will be edited iteratively.

delete from training_nodes;

do $$
declare
  l1 uuid; l2 uuid;
  cat uuid; grp uuid; grp2 uuid;
begin
  -- ===================== LEVEL 1 — Onboarding =============================
  insert into training_nodes (kind, title, sort_order)
    values ('level', 'Level 1 — Onboarding', 1) returning id into l1;

  -- Onboarding: single-check tasks ({passed_off} only)
  insert into training_nodes (parent_id, kind, title, sort_order, dollar_value)
    values (l1, 'category', 'Onboarding', 1, 0.20) returning id into cat;
  insert into training_nodes (parent_id, kind, title, sort_order, milestones)
  select cat, 'item', t.title, t.ord, '{passed_off}'::milestone_kind[]
  from (values
    ('Nowsta/App', 1), ('Workday/Clocking in', 2), ('AV Polo', 3),
    ('Uniform Guidelines', 4), ('ITB Tour', 5), ('Setmore', 6), ('GroupMe', 7),
    ('Box Drive', 8), ('Google Drive', 9), ('Show Reports', 10), ('Rentman', 11),
    ('University Core Training', 12), ('FERPA Training', 13)
  ) as t(title, ord);

  -- Vehicle Training: single-check tasks
  insert into training_nodes (parent_id, kind, title, sort_order, dollar_value)
    values (l1, 'category', 'Vehicle Training', 2, 0.30) returning id into cat;
  insert into training_nodes (parent_id, kind, title, sort_order, milestones)
  select cat, 'item', t.title, t.ord, '{passed_off}'::milestone_kind[]
  from (values
    ('MVR Release Form', 1), ('CMV Training', 2), ('DOT Medical Exam', 3),
    ('MVR Results Received', 4), ('Drug Test Received', 5),
    ('Alcohol Test Received', 6), ('Driver License Photo', 7), ('Practical Exam', 8)
  ) as t(title, ord);

  -- ===================== LEVEL 2 — A2 & Stagehand ========================
  insert into training_nodes (kind, title, sort_order)
    values ('level', 'Level 2 — A2 & Stagehand', 2) returning id into l2;

  -- Principles: equipment skills ({introduced, passed_off}), grouped
  insert into training_nodes (parent_id, kind, title, sort_order, dollar_value, approver)
    values (l2, 'category', 'Principles', 1, 0.05, 'Gabe') returning id into cat;

  insert into training_nodes (parent_id, kind, title, sort_order)
    values (cat, 'group', 'Cables & Connectors', 1) returning id into grp;
  insert into training_nodes (parent_id, kind, title, sort_order, milestones)
  select grp, 'item', t.title, t.ord, '{introduced,passed_off}'::milestone_kind[]
  from (values
    ('BNC/Coax', 1), ('Ethernet', 2), ('IEC', 3), ('RCA', 4), ('Attenuator', 5),
    ('XLR', 6), ('TRS, TS, 1/4", 1/8"', 7), ('EtherCON', 8), ('PowerCON', 9),
    ('Barrels/Couplers', 10), ('NL4', 11), ('NL8', 12), ('Reels', 13),
    ('MicroDot/TA4F', 14), ('USB', 15)
  ) as t(title, ord);

  insert into training_nodes (parent_id, kind, title, sort_order)
    values (cat, 'group', 'QL1 Basics', 2) returning id into grp;
  insert into training_nodes (parent_id, kind, title, sort_order, milestones)
  select grp, 'item', t.title, t.ord, '{introduced,passed_off}'::milestone_kind[]
  from (values
    ('Fader & On/Off', 1), ('Hard Patching', 2), ('Gain', 3), ('Phantom/48v', 4),
    ('Main Mono/Stereo', 5), ('Loading Showfiles', 6)
  ) as t(title, ord);

  -- Certification: Submitted -> Tested
  insert into training_nodes (parent_id, kind, title, sort_order, dollar_value, approver)
    values (l2, 'category', 'Certification', 2, 0.05, null) returning id into cat;
  insert into training_nodes (parent_id, kind, title, sort_order, milestones)
    values (cat, 'item', 'Dante Level 1', 1, '{submitted,tested}'::milestone_kind[]);

  -- Venues: "…Events" sub-sections nest further (venue-event → act), and event
  -- skills track ONLY Guided/Supervised (no Introduced/Passed Off).
  insert into training_nodes (parent_id, kind, title, sort_order, dollar_value, approver)
    values (l2, 'category', 'Venues', 3, 0.10, 'Gabe') returning id into cat;
  insert into training_nodes (parent_id, kind, title, sort_order)
    values (cat, 'group', 'LaVell Field Events', 1) returning id into grp;
  insert into training_nodes (parent_id, kind, title, sort_order)
    values (grp, 'group', 'Marching Band', 1) returning id into grp2;
  insert into training_nodes (parent_id, kind, title, sort_order, milestones)
  select grp2, 'item', t.title, t.ord, '{guided,supervised}'::milestone_kind[]
  from (values
    ('Inputs', 1), ('Intercomms', 2), ('Console Setup/Check', 3)
  ) as t(title, ord);
end $$;
