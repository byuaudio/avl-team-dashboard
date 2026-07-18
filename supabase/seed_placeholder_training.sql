-- PLACEHOLDER training sheet content — ASSUMED, not from the real template.
-- The real training template spreadsheet was not available when this was
-- written. Replace these sections/items with the actual template content
-- (see AI_NOTES.md), then delete this file.
--
-- Run AFTER 0001_initial_schema.sql.

insert into training_sections (title, sort_order) values
  ('Safety & Policies', 1),
  ('Consoles & Mixing', 2),
  ('Microphones & Stage Setup', 3),
  ('Wireless / RF', 4),
  ('Playback & Recording', 5);

insert into training_items (section_id, title, description, sort_order)
select s.id, i.title, i.description, i.sort_order
from training_sections s
join (values
  ('Safety & Policies', 'Ladder and lift safety', 'Demonstrate safe ladder use and know when a lift certification is required.', 1),
  ('Safety & Policies', 'Cable safety and taping', 'Run and tape cables so walkways stay safe.', 2),
  ('Consoles & Mixing', 'Console signal flow', 'Explain gain staging from input to main output.', 1),
  ('Consoles & Mixing', 'Soundcheck a vocal + track event', 'Run a basic soundcheck unassisted.', 2),
  ('Microphones & Stage Setup', 'Mic selection basics', 'Choose an appropriate mic for speech vs. vocals vs. instruments.', 1),
  ('Microphones & Stage Setup', 'Stage plot reading', 'Set a stage from a provided stage plot.', 2),
  ('Wireless / RF', 'Wireless mic setup', 'Coordinate frequencies and verify clean RF before an event.', 1),
  ('Playback & Recording', 'Playback operation', 'Run playback cues reliably during a program.', 1),
  ('Playback & Recording', 'Record a program', 'Capture and deliver a clean recording of an event.', 2)
) as i(section_title, title, description, sort_order)
  on i.section_title = s.title;
