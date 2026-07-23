-- Events get their own category (separate from Venues), and an event group can
-- be "tagged" with a venue in the same level: when the event group is expanded,
-- the sheet also shows that venue's items (in a distinct color) for convenience.
--
-- venue_ref points at the venue GROUP node whose items to surface. ON DELETE
-- SET NULL so deleting a venue just clears the tag rather than the event group.

alter table training_nodes
  add column venue_ref uuid references training_nodes (id) on delete set null;
