-- Expand the role model (see PROJECT.md "Roles & access").
--
-- Only enum changes here — Postgres forbids USING a new enum value in the same
-- transaction that adds it, so all logic that references the new roles lives in
-- the next migration (0007).
--
-- Renaming 'manager' -> 'audio_manager' relabels the value in place, so existing
-- profiles (e.g. Taylor's) migrate automatically, and stored policy expressions
-- that compared to it keep working (they reference the value by identity).

alter type employee_role rename value 'manager' to 'audio_manager';

alter type employee_role add value if not exists 'three_quarter_time';
alter type employee_role add value if not exists 'full_time';
alter type employee_role add value if not exists 'freelancer';
alter type employee_role add value if not exists 'non_audio_student';
alter type employee_role add value if not exists 'office_student';
