-- Real training template content (from "Template New Training Sheet"),
-- all seven levels + Misc.
--
-- Milestone rules applied (confirm/adjust with the product owner):
--   * Onboarding & Vehicle Training items -> {passed_off} (single "Done" check)
--   * Certification items                 -> {submitted, tested}
--   * Event / live-performance work        -> {guided, supervised}
--   * Everything else (equipment, concepts, venue access) -> {introduced, passed_off}
-- Category dollar values / final-check approver (Gabe vs FTE) are approximate
-- from the sheet and feed the later pay phase; they are easy to edit.
--
-- Re-runnable: wipes and reinserts the whole template. Deleting training_nodes
-- cascades to milestone_progress and training_goals, so only re-run while there
-- is no real employee progress yet.
--
-- Run: npx supabase db query --linked --file supabase/seed_training_template.sql

delete from training_nodes;

-- Helpers (dropped at the end) --------------------------------------------------
create or replace function _mk(
  p_parent uuid, p_kind node_kind, p_title text, p_sort int,
  p_dollar numeric default null, p_approver text default null
) returns uuid language plpgsql as $fn$
declare new_id uuid;
begin
  insert into training_nodes (parent_id, kind, title, sort_order, dollar_value, approver)
  values (p_parent, p_kind, p_title, p_sort, p_dollar, p_approver)
  returning id into new_id;
  return new_id;
end;
$fn$;

create or replace function _items(
  p_parent uuid, p_milestones milestone_kind[], variadic p_titles text[]
) returns void language plpgsql as $fn$
declare i int;
begin
  for i in 1 .. array_length(p_titles, 1) loop
    insert into training_nodes (parent_id, kind, title, sort_order, milestones)
    values (p_parent, 'item', p_titles[i], i, p_milestones);
  end loop;
end;
$fn$;

do $$
declare
  DONE milestone_kind[] := '{passed_off}';
  IP   milestone_kind[] := '{introduced,passed_off}';
  ST   milestone_kind[] := '{submitted,tested}';
  GS   milestone_kind[] := '{guided,supervised}';
  lvl uuid; cat uuid; grp uuid; g2 uuid;
begin
  -- ===================== LEVEL 1 — Onboarding =============================
  lvl := _mk(null, 'level', 'Level 1 — Onboarding', 1);
  cat := _mk(lvl, 'category', 'Onboarding', 1, 0.20);
  perform _items(cat, DONE, 'Nowsta/App', 'Workday/Clocking in', 'AV Polo',
    'Uniform Guidelines', 'ITB Tour', 'Setmore', 'GroupMe', 'Box Drive',
    'Google Drive', 'Show Reports', 'Rentman', 'University Core Training', 'FERPA Training');
  cat := _mk(lvl, 'category', 'Vehicle Training', 2, 0.30);
  perform _items(cat, DONE, 'MVR Release Form', 'CMV Training', 'DOT Medical Exam',
    'MVR Results Received', 'Drug Test Received', 'Alcohol Test Received',
    'Driver License Photo', 'Practical Exam');

  -- ===================== LEVEL 2 — A2 & Stagehand =========================
  lvl := _mk(null, 'level', 'Level 2 — A2 & Stagehand', 2);
  cat := _mk(lvl, 'category', 'Principles', 1, 0.05, 'Gabe');
  grp := _mk(cat, 'group', 'Cables & Connectors', 1);
  perform _items(grp, IP, 'BNC/Coax', 'Ethernet', 'IEC', 'RCA', 'Attenuator', 'XLR',
    'TRS, TS, 1/4", 1/8"', 'EtherCON', 'PowerCON', 'Barrels/Couplers', 'NL4', 'NL8',
    'Reels', 'MicroDot/TA4F', 'USB');
  grp := _mk(cat, 'group', 'Cable Management', 2);
  perform _items(grp, IP, 'Cable Paths', 'Backcoiling', 'Cable Taping', 'Doorways');
  grp := _mk(cat, 'group', 'QL1 Basics', 3);
  perform _items(grp, IP, 'Fader & On/Off', 'Hard Patching', 'Gain', 'Phantom/48v',
    'Main Mono/Stereo', 'Loading Showfiles');
  grp := _mk(cat, 'group', 'DM7 Basics', 4);
  perform _items(grp, IP, 'Fader & On/Off', 'Hard Patching', 'Gain', 'Phantom/48v',
    'ST A/ST B', 'Loading Showfiles');
  grp := _mk(cat, 'group', 'ULXD Wireless', 5);
  perform _items(grp, IP, 'SB900s', 'RX Display', 'Single Scan', 'AA Adapters',
    'BP (Belt Packs)', 'HH (Handhelds)', 'Mute Mode', 'Locking', 'Group Scan', 'Sync');
  grp := _mk(cat, 'group', 'Intercom', 6);
  perform _items(grp, IP, 'Batteries', 'WBP Listen', 'Headsets', 'DBP Listen');
  grp := _mk(cat, 'group', 'Software', 7);
  perform _items(grp, IP, 'Rentman Pull Sheets', 'Asana');
  grp := _mk(cat, 'group', 'Basic Concepts', 8);
  perform _items(grp, IP, 'Dynamic vs Condenser', 'Mic/Line Level', 'Balanced vs Unbalanced');

  cat := _mk(lvl, 'category', 'Certifications', 2, 0.05);
  perform _items(cat, ST, 'Dante Level 1');

  cat := _mk(lvl, 'category', 'Venues', 3, 0.10, 'Gabe');
  grp := _mk(cat, 'group', 'ITB', 1);
  perform _items(grp, IP, 'ITB Entry', 'Laptop & iPad Locations', 'Check out Comp/iPads');
  grp := _mk(cat, 'group', 'JKB', 2);
  perform _items(grp, IP, 'JKB Building Entry', 'JKB 1001B Entry', 'Storage System',
    'Gear Pull/Return', 'Report Broken Gear', 'Transport to Sick Bay');
  grp := _mk(cat, 'group', 'Clyde', 3);
  perform _items(grp, IP, 'Clyde Building Entry', 'Clyde 125 Entry', 'Storage System',
    'Gear Pull/Return', 'Report Broken Gear', 'Sick Bay');
  grp := _mk(cat, 'group', 'Smith Fieldhouse', 4);
  perform _items(grp, IP, 'SFH Building Entry', 'Volleyball Court', 'Soccer Field',
    'West Side Annex', 'Audio Closet', 'Audio Panels', 'Booth', 'Coop', 'Snackies');
  grp := _mk(cat, 'group', 'SFH Events', 5);
    g2 := _mk(grp, 'group', 'WVLB A2', 1); perform _items(g2, GS, 'Inputs', 'Intercomms');
    g2 := _mk(grp, 'group', 'MVLB A2', 2); perform _items(g2, GS, 'Inputs', 'Intercomms');
    g2 := _mk(grp, 'group', 'Stake Conf A2', 3); perform _items(g2, GS, 'Inputs', 'Cable runs');
    g2 := _mk(grp, 'group', 'Indoor Track A2', 4); perform _items(g2, GS, 'Inputs', 'ULXD Singles Setup');
  grp := _mk(cat, 'group', 'South Field Events', 6);
    g2 := _mk(grp, 'group', 'WSOC A2', 1); perform _items(g2, GS, 'Inputs', 'Intercomms');
    g2 := _mk(grp, 'group', 'MSOC A2', 2); perform _items(g2, GS, 'Inputs', 'Intercomms', 'Stream Talent Boxes');
    g2 := _mk(grp, 'group', 'Rugby A2', 3); perform _items(g2, GS, 'Inputs', 'Intercomms', 'Stream Talent Boxes');
  grp := _mk(cat, 'group', 'Miller Park', 7);
  perform _items(grp, IP, 'Building Entry', 'FOH', 'Field');
  grp := _mk(cat, 'group', 'Helaman Fields', 8);
  perform _items(grp, IP, 'Power Locations');
  grp := _mk(cat, 'group', 'Outdoor Track', 9);
  perform _items(grp, IP, 'Booth Entry');
  grp := _mk(cat, 'group', 'LaVell Field', 10);
  perform _items(grp, IP, 'Building Entry');
  grp := _mk(cat, 'group', 'LaVell Field Events', 11);
    g2 := _mk(grp, 'group', 'Marching Band', 1); perform _items(g2, GS, 'Inputs', 'Intercomms', 'Console Setup/Check');
    g2 := _mk(grp, 'group', 'Helaman A2', 2); perform _items(g2, GS, 'Inputs', 'Patching', 'DJ');
    g2 := _mk(grp, 'group', 'Tailgate A2', 3); perform _items(g2, GS, 'Inputs', 'Stage Patching', 'Mic Stands', 'Cable Paths');
  grp := _mk(cat, 'group', 'JSB', 12);
  perform _items(grp, IP, 'Building Entry');
  grp := _mk(cat, 'group', 'JSB Events', 13);
    g2 := _mk(grp, 'group', 'JSB A2', 1); perform _items(g2, GS, 'Inputs', 'Stage Boxes', 'House system set up', 'Wireless System');
  grp := _mk(cat, 'group', 'WILK', 14);
  perform _items(grp, IP, 'Building Entry', 'FOH', 'Stage Rack');
  grp := _mk(cat, 'group', 'WILK Events', 15);
    g2 := _mk(grp, 'group', 'Cougar Skate', 1); perform _items(g2, GS, 'Inputs');
    g2 := _mk(grp, 'group', 'Stake Conference', 2); perform _items(g2, GS, 'Inputs');
    g2 := _mk(grp, 'group', 'FSY', 3); perform _items(g2, GS, 'Devotionals', 'Variety Show', 'Musical Program', 'Taking it home', 'Orientation');
  grp := _mk(cat, 'group', 'MC', 16);
  perform _items(grp, IP, 'Building Entry', 'Tunnel Rollup Door', 'Crew Meal Rooms', '1212 Engineering Room', 'Control Room 22');
  grp := _mk(cat, 'group', 'MC Events', 17);
    g2 := _mk(grp, 'group', 'WBKB A2', 1); perform _items(g2, GS, 'Comms', 'Press row', 'Y Drum', 'Band Inputs');
    g2 := _mk(grp, 'group', 'MBKB A2', 2); perform _items(g2, GS, 'Comms', 'Press row', 'Y Drum', 'Band Inputs');
  grp := _mk(cat, 'group', 'CR 11', 18);
  perform _items(grp, IP, 'Building Entry');
  grp := _mk(cat, 'group', 'CR 22', 19);
  perform _items(grp, IP, 'Building Entry');
  grp := _mk(cat, 'group', 'CR 22 Events', 20);
    g2 := _mk(grp, 'group', 'WBKB CR', 1); perform _items(g2, GS, 'Building Entry', 'System setup');
    g2 := _mk(grp, 'group', 'SOFT A1 (CR)', 2); perform _items(g2, GS, 'Building Entry', 'System setup');
    g2 := _mk(grp, 'group', 'BSB A1 (CR)', 3); perform _items(g2, GS, 'Building Entry', 'System setup');

  -- ===================== LEVEL 3 — Entry A1 & Advanced A2 =================
  lvl := _mk(null, 'level', 'Level 3 — Entry A1 & Advanced A2', 3);
  cat := _mk(lvl, 'category', 'Principles', 1, 0.05, 'Gabe');
  grp := _mk(cat, 'group', 'QL1 Intermediate', 1);
  perform _items(grp, IP, 'Soft Patch', 'Out patch/Attenuation', 'EQ', 'Mix/Matrix',
    'Linking Channel/Panning', 'FX Rack basic', 'Mute Group/DCA', 'Dynamics', 'Brother Dugan');
  grp := _mk(cat, 'group', 'DM7 Intermediate', 2);
  perform _items(grp, IP, 'Soft Patch', 'Out patch/Attenuation', 'EQ', 'Mix/Matrix',
    'Pairing Channels', 'FX Rack basic', 'Mute Group/DCA', 'Dynamics', 'Brother Dugan');
  grp := _mk(cat, 'group', 'SQ5 Basics', 3);
  perform _items(grp, IP, 'Fader', 'Hard Patching', 'Gain', 'Phantom/48v', 'Stereo', 'Scene Recall');
  grp := _mk(cat, 'group', 'DLive Basics', 4);
  perform _items(grp, IP, 'Fader', 'Hard Patching', 'Gain', 'Phantom/48v', 'Stereo', 'Scene Recall');
  grp := _mk(cat, 'group', 'Amps', 5);
  perform _items(grp, IP,
    'd&b Audiotechnik — Mute', 'd&b Audiotechnik — Gain', 'd&b Audiotechnik — IO', 'd&b Audiotechnik — Interface Navigation',
    'L-Acoustics — Mute', 'L-Acoustics — Gain', 'L-Acoustics — IO', 'L-Acoustics — Interface Navigation',
    'Nexo — Mute', 'Nexo — Gain', 'Nexo — IO', 'Nexo — Interface Navigation');
  grp := _mk(cat, 'group', 'Intercom', 6);
  perform _items(grp, IP, 'Interface Basics', 'Channel Assignments', 'Latching');
  grp := _mk(cat, 'group', 'Rentman', 7);
  perform _items(grp, IP, 'Pulling a show', 'Substitutions', 'Maintenance request');
  grp := _mk(cat, 'group', 'Basic Concepts', 8);
  perform _items(grp, IP, 'Mic Tonality vs Use', 'Graphic EQ', 'Active/Passive Speakers',
    'CR Confidence Mixing', 'Phase & Sound Waves', 'Parametric EQ', 'Dynamics', 'Feedback',
    'Gain Structure', 'Basic Internal Routing');
  grp := _mk(cat, 'group', 'Broadcast Mix', 9);
  perform _items(grp, IP, 'Mix Basics & Goals', 'Control Room Mix', 'Stream Mix');

  cat := _mk(lvl, 'category', 'Certifications', 2, 0.05);
  perform _items(cat, ST, 'Dante Level 2');

  cat := _mk(lvl, 'category', 'Venues', 3, 0.10, 'Gabe');
  grp := _mk(cat, 'group', 'Smith Fieldhouse Events', 1);
    g2 := _mk(grp, 'group', 'Indoor Track', 1); perform _items(g2, GS, 'Track Perimiter System', 'West Annex System', 'Streaming Setup');
  grp := _mk(cat, 'group', 'JSB', 2);
  perform _items(grp, IP, 'Building Entry');
  grp := _mk(cat, 'group', 'WILK Events', 3);
    g2 := _mk(grp, 'group', 'FSY A1', 1); perform _items(g2, GS, 'Devotionals', 'Podium Micing', 'OH vs Stereo System', 'Variety Show', 'Micing with a SM58', 'Musical Program', 'Choir Micing');
    g2 := _mk(grp, 'group', 'DanceSport A1', 2); perform _items(g2, GS, 'Venue Troubleshooting');
  grp := _mk(cat, 'group', 'Helaman Fields Events', 4);
    g2 := _mk(grp, 'group', 'FB Helaman A1', 1); perform _items(g2, GS, 'System setup', 'DJ inputs', 'Mixer operation');
  grp := _mk(cat, 'group', 'Hinckley Center', 5);
  perform _items(grp, IP, 'Ballrooms', 'Audio Panels');
  grp := _mk(cat, 'group', 'Hinckley Center Events', 6);
    g2 := _mk(grp, 'group', 'HC A2', 1); perform _items(g2, GS, 'Cable Paths', 'Inputs', 'Amp Placement', 'Frontfill Placement');
  grp := _mk(cat, 'group', 'MOA', 7);
  perform _items(grp, IP, 'Main Floor Gallery Building Entry');
  grp := _mk(cat, 'group', 'MOA Events', 8);
    g2 := _mk(grp, 'group', 'Interfaith Arts Night', 1); perform _items(g2, GS, 'System setup');
  grp := _mk(cat, 'group', 'MC', 9);
  perform _items(grp, IP, 'FOH Rivage Lock/Unlock', 'Amp Mute/Unmute', 'Podium Control', 'Pod. Height Sheet', 'RTS Panels', 'Evertz Router');
  grp := _mk(cat, 'group', 'MC Events', 10);
    g2 := _mk(grp, 'group', 'WBKB A2', 1); perform _items(g2, GS, 'Press Row', 'Mute Mode', 'Comms', 'Ydrum');
    g2 := _mk(grp, 'group', 'MBKB A2', 2); perform _items(g2, GS, 'Press Row', 'Mute Mode', 'Comms', 'Power lock', 'Ydrum');
    g2 := _mk(grp, 'group', 'GYM A2', 3); perform _items(g2, GS, 'Wall panels', 'Floor Routine Monitors', 'Comms', 'Press row Network Switch');
    g2 := _mk(grp, 'group', 'Stake Conf A2', 4); perform _items(g2, GS, 'Podium height', 'Cable runs', 'Wall panels');
    g2 := _mk(grp, 'group', 'Devo A2', 5); perform _items(g2, GS, 'Podium height', 'Wall panels', 'Cable runs', 'Front fill/Monitors');
    g2 := _mk(grp, 'group', 'Dance Sport A2', 6); perform _items(g2, GS, 'Basic Troubleshooting');
  grp := _mk(cat, 'group', 'CR 22 Events', 11);
    g2 := _mk(grp, 'group', 'WBKB Stream', 1); perform _items(g2, GS, 'Show File', 'Confidence Mixing', 'Comms');
    g2 := _mk(grp, 'group', 'MBKB Stream', 2); perform _items(g2, GS, 'Show File', 'Confidence Mixing', 'Comms');
    g2 := _mk(grp, 'group', 'FB Stream', 3); perform _items(g2, GS, 'Show File', 'Confidence Mixing', 'Comms');
    g2 := _mk(grp, 'group', 'Softball Stream', 4); perform _items(g2, GS, 'Inputs', 'Confidence Mixing', 'Comms');
    g2 := _mk(grp, 'group', 'Baseball Stream', 5); perform _items(g2, GS, 'Inputs', 'Confidence Mixing', 'Comms');
  grp := _mk(cat, 'group', 'Portable PA Systems', 12);
    g2 := _mk(grp, 'group', 'Y Rig', 1); perform _items(g2, IP, 'Ground Stack', 'Wiring', 'Amps');
    g2 := _mk(grp, 'group', 'Kara Rig', 2); perform _items(g2, IP, 'Ground Stack', 'Wiring', 'Amps');
    g2 := _mk(grp, 'group', 'K2 Rig', 3); perform _items(g2, IP, 'Fly Rig', 'Strain Relief', 'Splay Angles', 'Chariots', 'Connection', 'Panflex', 'DO cable', 'Wiring', 'Crunching/Flying');

  -- ===================== LEVEL 4 — Intermediate A1 ========================
  lvl := _mk(null, 'level', 'Level 4 — Intermediate A1', 4);
  cat := _mk(lvl, 'category', 'Principles', 1, 0.05, 'Gabe');
  grp := _mk(cat, 'group', 'Cables & Mics', 1);
  perform _items(grp, IP, 'A Game with Gabe', 'Stage Plots');
  grp := _mk(cat, 'group', 'QL1 Advanced', 2);
  perform _items(grp, IP, 'Monitor Mixing', 'Custom Faders', 'Channel Job', 'Scenes', 'Show Files', 'Dante Patch from mixer', 'FX Rack Advanced', 'Inserts');
  grp := _mk(cat, 'group', 'DM7 Advanced', 3);
  perform _items(grp, IP, 'Monitor Mixing', 'Custom Faders', 'Channel Job', 'Scenes', 'Show Files', 'Dante Patch from mixer', 'FX Rack Advanced', 'Inserts');
  grp := _mk(cat, 'group', 'SQ5 Intermediate', 4);
  perform _items(grp, IP, 'Soft Patch', 'Out patch', 'EQ', 'Mix/Matrix', 'Linking Channel/Panning', 'FX Rack basic', 'Mute Group/DCA', 'Dynamics');
  grp := _mk(cat, 'group', 'DLive Intermediate', 5);
  perform _items(grp, IP, 'Soft Patch', 'Out patch', 'EQ', 'Mix/Matrix', 'Linking Channel/Panning', 'FX Rack basic', 'Mute Group/DCA', 'Dynamics', 'Surface Channel Asgmt.');
  grp := _mk(cat, 'group', 'Rivage Basics', 6);
  perform _items(grp, IP, 'Fader', 'Hard Patching', 'Gain', 'Phantom/48v', 'Mono/Stereo', 'Scene Recall');
  grp := _mk(cat, 'group', 'RTS Roameo Comms', 7);
  perform _items(grp, IP, 'Pages', 'Headset options', 'Sheet of event needs', 'Changing channels');
  grp := _mk(cat, 'group', 'Dante', 8);
  perform _items(grp, IP, 'Dante Controller', 'DVS', 'Troubleshooting Test');
  grp := _mk(cat, 'group', 'Basic Concepts', 9);
  perform _items(grp, IP, 'Mixes & Matrices', 'NL4 and NL8 signal path', 'EQ''s for different source', 'Intermediate Gain Staging', 'Intermediate Internal Routing', 'Dynamics for different sources', 'How mics work', 'Groups/Fixed Mixes', 'Pre and Post Fade');

  cat := _mk(lvl, 'category', 'Certifications', 2, 0.05);
  perform _items(cat, ST, 'Dante Level 3');

  cat := _mk(lvl, 'category', 'Venues', 3, 0.10, 'Gabe');
  grp := _mk(cat, 'group', 'Smith Fieldhouse Events', 1);
    g2 := _mk(grp, 'group', 'WVLB A1', 1); perform _items(g2, GS, 'House Dante hookup', 'Send to Video', 'Press row', 'Comms');
    g2 := _mk(grp, 'group', 'MVLB A1', 2); perform _items(g2, GS, 'House Dante hookup', 'Send to Video', 'Press row', 'Comms');
  grp := _mk(cat, 'group', 'South Field Events', 2);
    g2 := _mk(grp, 'group', 'WSOC A1', 1); perform _items(g2, GS, 'House Dante hookup', 'Send to Video', 'Press row', 'Comms');
    g2 := _mk(grp, 'group', 'MSOC A1', 2); perform _items(g2, GS, 'House Dante hookup', 'Send to Video', 'Press row', 'Comms');
    g2 := _mk(grp, 'group', 'Rugby A1', 3); perform _items(g2, GS, 'House Dante hookup', 'Send to Video', 'Press row', 'Comms');
  grp := _mk(cat, 'group', 'T28 Broadcast Trailer', 3);
    g2 := _mk(grp, 'group', 'MSOC Stream', 1); perform _items(g2, GS, 'Scene Recall', 'Confidence Mixing');
  grp := _mk(cat, 'group', 'LaVell Field Events', 4);
    g2 := _mk(grp, 'group', 'FB Sideline', 1); perform _items(g2, GS, 'Wall panel Connections', 'Pagers', 'Comms', 'FB Cart Connections', 'Wireless Mics', 'Ref Mic');
  grp := _mk(cat, 'group', 'JSB Events', 5);
    g2 := _mk(grp, 'group', 'JSB A1', 1); perform _items(g2, GS, 'Avantis App', 'IO panel', 'House Wireless');
  grp := _mk(cat, 'group', 'WILK Events', 6);
    g2 := _mk(grp, 'group', 'Stake Conf A1', 1); perform _items(g2, GS, 'Podium Micing', 'OH vs Stereo System');
    g2 := _mk(grp, 'group', 'BOTB A2', 2); perform _items(g2, GS, 'Stage Patching', 'Y rig or Kara rig', 'Monitor mixing');
  grp := _mk(cat, 'group', 'MC', 7);
  perform _items(grp, IP, 'FOH Rivage Lock/Unlock', 'RTS Panels', 'Evertz Router', 'Axient Syncing', 'Band inputs and setup', 'Showfiles', 'Podium Control', 'Assisted Listening', 'LANW Wake/Sleep', 'Home Layers', 'Pod. Height Sheet', 'IEM Transmitter');
  grp := _mk(cat, 'group', 'MC Events', 8);
    g2 := _mk(grp, 'group', 'WBKB A1', 1); perform _items(g2, GS, 'Showfile Recall', 'Showflo', 'Pre show run through', 'LANW Wake/Sleep', 'Band inputs and setup', 'Evertz Routing', 'Send to video', 'Mains DCA for checking', 'Press row', 'Sheet drop', 'SPL Metering', 'Comms', 'LANW Mute Groups', 'Sound Check', 'Ydrum setup');
    g2 := _mk(grp, 'group', 'Gym A1', 2); perform _items(g2, GS, 'Showfile Recall', 'LANW Wake/Sleep', 'Floor routine Sends', 'Evertz Routing', 'LANW Mute Groups', 'Floor routine Cabling', 'Send to video', 'Press row network Switch', 'Comms for judges');
    g2 := _mk(grp, 'group', 'Dance Sport A1', 3); perform _items(g2, GS, 'Showfile Recall', 'Basic troubleshooting', 'LANW Mute Groups');
    g2 := _mk(grp, 'group', 'Stake Conf A1', 4); perform _items(g2, GS, 'Podium Control', 'Showfile Recall', 'Pod. Height Sheet', 'LANW Wake/Sleep', 'Assisted Listening', 'Monitor/Front fill', 'Axient Syncing');

  -- ===================== LEVEL 5 — Advanced A1 ============================
  lvl := _mk(null, 'level', 'Level 5 — Advanced A1', 5);
  cat := _mk(lvl, 'category', 'Principles', 1, 0.05, 'Gabe');
  grp := _mk(cat, 'group', 'Cables & Mics', 1);
  perform _items(grp, IP, 'Fiber Connections', 'FiberCon', 'Single Mode Fiber');
  grp := _mk(cat, 'group', 'Networking Basics', 2);
  perform _items(grp, IP, 'Network Basics', 'Unmanaged Switches', 'POE over Switches');
  grp := _mk(cat, 'group', 'QL1 Final', 3);
  perform _items(grp, IP, 'Console Automation', 'Recall Safe', 'Networking');
  grp := _mk(cat, 'group', 'DM7 Final', 4);
  perform _items(grp, IP, 'Console Automation', 'Recall Safe', 'Networking');
  grp := _mk(cat, 'group', 'SQ5 Advanced', 5);
  perform _items(grp, IP, 'Soft Patch', 'Out patch', 'EQ', 'Mix/Matrix', 'Linking Channel/Panning', 'FX Rack basic', 'Mute Group/DCA', 'Dynamics');
  grp := _mk(cat, 'group', 'DLive Advanced', 6);
  perform _items(grp, IP, 'Soft Patch', 'Out patch', 'EQ', 'Mix/Matrix', 'Ganging Channels/Panning', 'FX Rack basic', 'Mute Group/DCA', 'Dynamics');
  grp := _mk(cat, 'group', 'Rivage Intermediate', 7);
  perform _items(grp, IP, 'Soft Patch', 'Out patch/Attenuation', 'EQ', 'Mix/Matrix', 'Linking Channel/Panning', 'FX Rack basic', 'Mute Group/DCA', 'Dynamics');
  grp := _mk(cat, 'group', 'Advanced Concepts', 8);
  perform _items(grp, IP, 'Phase for Tuning', 'Virtual Sound Check', 'Analog Split', 'EQ to adjust for Phase', 'Matrix mixing', 'Parallel Compression', 'Group Processing');

  cat := _mk(lvl, 'category', 'Certifications', 2, 0.05);
  perform _items(cat, ST, 'Smaart Fundamentals');

  cat := _mk(lvl, 'category', 'Venues', 3, 0.10, 'FTE');
  grp := _mk(cat, 'group', 'WILK Events', 1);
    g2 := _mk(grp, 'group', 'Sweetheart Dance A1', 1); perform _items(g2, GS, 'Stage Patching', 'Jazz inst. mic techniques', 'Monitor Mixing');
    g2 := _mk(grp, 'group', 'BOTB A1', 2); perform _items(g2, GS, 'Stage Patching', 'Show Setup', 'Band inst. mic techniques', 'Soundcheck protocol', 'FOH Mixing', 'Yrig /Kara Rig');
    g2 := _mk(grp, 'group', 'BOTB Mon', 3); perform _items(g2, GS, 'Stage Patching', 'Show Setup', 'Band inst. mic techniques', 'Soundcheck protocol', 'Monitor Mixing', 'Yrig /Kara Rig');
  grp := _mk(cat, 'group', 'JSB Events', 2);
    g2 := _mk(grp, 'group', 'JSB A1-Corp', 1); perform _items(g2, GS, 'Corporate Showfile', 'Face micing', 'Video Send and Levels', 'Lav Micing', 'Comm. with clients');
  grp := _mk(cat, 'group', 'Hinckley Center Events', 3);
    g2 := _mk(grp, 'group', 'HC A1', 1); perform _items(g2, GS, 'Corporate Showfile', 'Face micing', 'Video Send and Levels', 'Lav Micing', 'Communicating with clients', 'Monitors and amps');
  grp := _mk(cat, 'group', 'System Tech', 4);
    g2 := _mk(grp, 'group', 'Ground Stack', 1); perform _items(g2, GS, 'Y rig', 'Kara rig', 'EV rig');

  -- ===================== LEVEL 6 — As Assigned, Freelance & 3/4 Time ======
  lvl := _mk(null, 'level', 'Level 6 — As Assigned, Freelance & 3/4 Time', 6);
  cat := _mk(lvl, 'category', 'Principles', 1, 0.05, 'FTE');
  grp := _mk(cat, 'group', 'Cables & Mics', 1);
  perform _items(grp, IP, 'Single Mode Fiber', 'ST', 'Multi-Mode Fiber', 'SFB', 'SC', 'Troubleshooting');
  grp := _mk(cat, 'group', 'Networking Intermediate', 2);
  perform _items(grp, IP, 'Network Intermediate', 'Managed Switches', 'Vlans');
  grp := _mk(cat, 'group', 'Rivage Advanced', 3);
  perform _items(grp, IP, 'Soft Patch', 'Out patch/Attenuation', 'EQ', 'Mix/Matrix', 'Linking Channel/Panning', 'FX Rack basic', 'Mute Group/DCA', 'Dynamics');
  grp := _mk(cat, 'group', 'Axient', 4);
  perform _items(grp, IP, 'Showlink');

  cat := _mk(lvl, 'category', 'Certifications', 2, 0.05);
  perform _items(cat, ST, 'Q-SYS Level 1');

  cat := _mk(lvl, 'category', 'Venues', 3, 0.10, 'FTE');
  grp := _mk(cat, 'group', 'LaVell Field Events', 1);
    g2 := _mk(grp, 'group', 'FB Tailgate A1', 1); perform _items(g2, GS, 'Y Rig/Kara Rig', 'Quick Setup of show', 'FOH Mixing', 'Tablet Mixing', 'Monitor Mixing', 'Dlive Mixing');
  grp := _mk(cat, 'group', 'MC Events', 2);
    g2 := _mk(grp, 'group', 'Monitor Engineer', 1); perform _items(g2, GS, 'IEM', 'Floor Monitors', 'PSM1000');
  grp := _mk(cat, 'group', 'Lead Fly System Tech', 3);
    g2 := _mk(grp, 'group', 'Fly Rig', 1); perform _items(g2, GS, 'Y Rig', 'Kara Rig');

  -- ===================== LEVEL 7 — As Assigned ============================
  lvl := _mk(null, 'level', 'Level 7 — As Assigned', 7);
  cat := _mk(lvl, 'category', 'Venues', 1, 0.10, 'FTE');
  grp := _mk(cat, 'group', 'Wall Panel Connections', 1);
    g2 := _mk(grp, 'group', 'FB A1', 1); perform _items(g2, GS, 'Tower Entry', 'Football Pass');
    g2 := _mk(grp, 'group', 'FB RF Tech', 2); perform _items(g2, GS, 'RF Coordination');
  grp := _mk(cat, 'group', 'MC Events', 2);
    g2 := _mk(grp, 'group', 'MBKB A1', 1); perform _items(g2, GS, 'Showfile Recall', 'Showflo', 'Pre show run through', 'LANW Wake/Sleep', 'Band inputs and setup', 'Evertz Routing', 'Send to video', 'Mains DCA for checking', 'Press row', 'Sheet drop', 'SPL Metering', 'Comms', 'LANW Mute Groups', 'Sound Check', 'Ydrum setup');
    g2 := _mk(grp, 'group', 'Devo A1', 2); perform _items(g2, GS, 'Podium height', 'Wall panels', 'Cable runs', 'Front fill/Monitors');
    g2 := _mk(grp, 'group', 'Monitor Engineer', 3); perform _items(g2, GS, 'IEM', 'Floor Monitors', 'Analog Split');

  -- ===================== MISC. ============================================
  lvl := _mk(null, 'level', 'Misc.', 8);
  cat := _mk(lvl, 'category', 'Band Set Up', 1);
  grp := _mk(cat, 'group', 'Band', 1);
  perform _items(grp, IP, 'Stage patching', 'Drums', 'Keyboard', 'Anolog Splits', 'Snakes', 'Bass', 'Tracks/Trax', 'Wedges', 'Input Lists', 'Guitar', 'Vocals/Vox', 'IEM');
  cat := _mk(lvl, 'category', 'Intercomms', 2);
  grp := _mk(cat, 'group', 'Clearcomm HelixNet', 1);
  perform _items(grp, IP, 'Listen & Talk', 'Changing channels', 'Pages', 'Headset options', 'Sheet of event needs', 'AES Cables');
  grp := _mk(cat, 'group', 'Fieldwire', 2);
  perform _items(grp, IP, 'Changing channels');
  cat := _mk(lvl, 'category', 'QLab by Figure 53', 3);
  grp := _mk(cat, 'group', 'Software', 1);
  perform _items(grp, IP, 'Layout', 'Cue types', 'Group types', 'Cue list & Carts', 'Patching', 'Audio Cues', 'Follow/Auto-Follow', 'I/O', 'Fade Cues', 'Organization');
  cat := _mk(lvl, 'category', 'Wireless Workbench', 4);
  grp := _mk(cat, 'group', 'WWB7', 1);
  perform _items(grp, IP, 'Inventory', 'Add New Device', 'Frequency Coordination', 'Scan Sources', 'Monitor');
  cat := _mk(lvl, 'category', 'System Tuning', 5);
  grp := _mk(cat, 'group', 'Smaart/System Tuning', 1);
  perform _items(grp, IP, 'Small System Tune', 'Medium System Tune', 'Sub Tuning');
  cat := _mk(lvl, 'category', 'Vectorworks', 6);
  grp := _mk(cat, 'group', 'Vectorworks', 1);
  perform _items(grp, IP, 'File structure', '2D', 'Basics', 'Block Diagrams', 'Layers & Classes', '3D');
  cat := _mk(lvl, 'category', 'L-Acoustics Network Manager', 7);
  grp := _mk(cat, 'group', 'LAN', 1);
  perform _items(grp, IP, 'File Management', 'Custom Presets', 'IIR Filters', 'Presets', 'Gain', 'Array Morphing', 'Changing Inputs', 'FIR Filters', 'P1');
  cat := _mk(lvl, 'category', 'd&b ArrayCalc and R1', 8);
  grp := _mk(cat, 'group', 'Array Calc', 1);
  perform _items(grp, IP, 'File Management', 'Gain', 'Presets', 'Changing Inputs');
  cat := _mk(lvl, 'category', 'Concepts', 9);
  grp := _mk(cat, 'group', 'Advanced Concepts', 1);
  perform _items(grp, IP, 'Dante', 'Milan', 'AVB', 'AES');
  cat := _mk(lvl, 'category', 'Projects', 10);
  grp := _mk(cat, 'group', 'Principles', 1);
  perform _items(grp, IP, 'Box Drive', 'Laminator', 'ITB Materials', 'User Exper.', 'MS Office', 'ITB Plotter', 'Brother Lblr', 'Google Drive', 'ITB Shop', 'Niimbot');
  cat := _mk(lvl, 'category', 'Physics of Acoustics', 11);
  grp := _mk(cat, 'group', 'Principles', 1);
  perform _items(grp, IP, 'Wind Impact', 'Haas Effect', 'Climate Impact', 'Comb Filtering', 'Instruments Resonance', 'Summation');
  cat := _mk(lvl, 'category', 'Sound Recording', 12);
  grp := _mk(cat, 'group', 'Principles', 1);
  perform _items(grp, IP, 'Mic placements', 'Group EQ', 'Mic techniques', 'Group effects', 'Effect Processing');
  cat := _mk(lvl, 'category', 'Pro Tools/Logic/Ableton Live/Audition', 13);
  grp := _mk(cat, 'group', 'Principles', 1);
  perform _items(grp, IP, 'Principles');
  cat := _mk(lvl, 'category', 'Nuendo Live/Tracks live/Harrison LiveTrax', 14);
  grp := _mk(cat, 'group', 'Principles', 1);
  perform _items(grp, IP, 'Set up a session', 'Export', 'Multi-Channel Patch', 'Upload and storage', 'Channel Label', 'Playback Set up');
  cat := _mk(lvl, 'category', 'Sound Reinforcement', 15);
  grp := _mk(cat, 'group', 'Principles', 1);
  perform _items(grp, IP, 'Principles');
  cat := _mk(lvl, 'category', 'Sound Design', 16);
  grp := _mk(cat, 'group', 'Story Telling', 1);
  perform _items(grp, IP, 'SFX creation', 'Client Prompt to SFX', 'Building SFX sound scape');
end $$;

drop function _items(uuid, milestone_kind[], text[]);
drop function _mk(uuid, node_kind, text, int, numeric, text);

-- Split "Events" into their own category (beside Venues) per level, and tag
-- each "X Events" group to the venue group "X" in the same level so the sheet
-- can surface that venue's items under the event.
do $$
declare lvl record; venues_cat uuid; events_cat uuid; next_sort int; appr text;
begin
  for lvl in select id from training_nodes where kind = 'level' loop
    select id, approver into venues_cat, appr from training_nodes
      where parent_id = lvl.id and kind = 'category' and title = 'Venues';
    if venues_cat is not null and exists (
      select 1 from training_nodes where parent_id = venues_cat and title ilike '%Events%'
    ) then
      select coalesce(max(sort_order), 0) + 1 into next_sort
        from training_nodes where parent_id = lvl.id and kind = 'category';
      insert into training_nodes (parent_id, kind, title, sort_order, dollar_value, approver)
        values (lvl.id, 'category', 'Events', next_sort, 0.10, appr) returning id into events_cat;
      update training_nodes set parent_id = events_cat
        where parent_id = venues_cat and title ilike '%Events%';
      update training_nodes ev set venue_ref = v.id
        from training_nodes v
        where ev.parent_id = events_cat and v.parent_id = venues_cat and v.kind = 'group'
          and trim(replace(ev.title, ' Events', '')) = v.title;
    end if;
  end loop;
end $$;
