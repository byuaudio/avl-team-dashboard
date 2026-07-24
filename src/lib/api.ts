// All database reads and writes live in this one module so future changes to
// queries or the schema only touch one place. Pass-off WRITES go through
// Postgres RPC functions (see the migration file) — the security rules are
// enforced in the database, not here.

import { FunctionsHttpError } from '@supabase/supabase-js'
import { getSupabaseClient } from './supabaseClient'
import type {
  Announcement,
  AppNotification,
  Availability,
  Booking,
  CompSettings,
  EmployeeRole,
  EmployeeSemester,
  AvailabilityBlock,
  AvailabilityRule,
  MilestoneKind,
  MilestoneProgress,
  NodeKind,
  PayAdjustment,
  PayHistory,
  PerformanceStar,
  PolicyItem,
  PolicyPenalty,
  Profile,
  StarStatus,
  TrainingGoal,
  TrainingItem,
  TrainingNode,
  TrainingProgress,
  TrainingSection,
} from './types'

export async function fetchTeamRoster(): Promise<Profile[]> {
  const { data, error } = await getSupabaseClient()
    .from('profiles')
    .select('*')
    .order('full_name')
  if (error) throw error
  return data
}

export async function fetchAnnouncements(): Promise<Announcement[]> {
  const { data, error } = await getSupabaseClient()
    .from('announcements')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(10)
  if (error) throw error
  return data
}

export interface TrainingTemplate {
  sections: TrainingSection[]
  items: TrainingItem[]
}

export async function fetchTrainingTemplate(): Promise<TrainingTemplate> {
  const supabase = getSupabaseClient()
  const [sections, items] = await Promise.all([
    supabase.from('training_sections').select('*').order('sort_order'),
    supabase.from('training_items').select('*').order('sort_order'),
  ])
  if (sections.error) throw sections.error
  if (items.error) throw items.error
  return { sections: sections.data, items: items.data }
}

/** Progress rows for one employee. RLS limits students to their own rows. */
export async function fetchProgressForEmployee(employeeId: string): Promise<TrainingProgress[]> {
  const { data, error } = await getSupabaseClient()
    .from('training_progress')
    .select('*')
    .eq('employee_id', employeeId)
  if (error) throw error
  return data
}

/** Every progress row visible to the caller (trainers/managers see the whole team). */
export async function fetchAllProgress(): Promise<TrainingProgress[]> {
  const { data, error } = await getSupabaseClient().from('training_progress').select('*')
  if (error) throw error
  return data
}

export async function requestPassoff(itemId: string): Promise<void> {
  const { error } = await getSupabaseClient().rpc('request_passoff', { p_item_id: itemId })
  if (error) throw error
}

export async function cancelPassoffRequest(itemId: string): Promise<void> {
  const { error } = await getSupabaseClient().rpc('cancel_passoff_request', { p_item_id: itemId })
  if (error) throw error
}

export async function grantPassoff(
  employeeId: string,
  itemId: string,
  notes?: string,
): Promise<void> {
  const { error } = await getSupabaseClient().rpc('grant_passoff', {
    p_employee_id: employeeId,
    p_item_id: itemId,
    p_notes: notes ?? null,
  })
  if (error) throw error
}

export async function resetPassoff(employeeId: string, itemId: string): Promise<void> {
  const { error } = await getSupabaseClient().rpc('reset_passoff', {
    p_employee_id: employeeId,
    p_item_id: itemId,
  })
  if (error) throw error
}

// --- Real-template tree + per-milestone sign-off (migration 0002) -----------

/** The whole training template tree (all nodes, ordered). */
export async function fetchTrainingTree(): Promise<TrainingNode[]> {
  const { data, error } = await getSupabaseClient()
    .from('training_nodes')
    .select('*')
    .order('sort_order')
  if (error) throw error
  return data
}

/** One employee's milestone progress. RLS limits students to their own rows. */
export async function fetchMilestoneProgressForEmployee(
  employeeId: string,
): Promise<MilestoneProgress[]> {
  const { data, error } = await getSupabaseClient()
    .from('milestone_progress')
    .select('*')
    .eq('employee_id', employeeId)
  if (error) throw error
  return data
}

/** Every milestone row visible to the caller (trainers/managers see all). */
export async function fetchAllMilestoneProgress(): Promise<MilestoneProgress[]> {
  const { data, error } = await getSupabaseClient().from('milestone_progress').select('*')
  if (error) throw error
  return data
}

export async function requestMilestone(itemId: string, milestone: MilestoneKind): Promise<void> {
  const { error } = await getSupabaseClient().rpc('request_milestone', {
    p_item_id: itemId,
    p_milestone: milestone,
  })
  if (error) throw error
}

export async function cancelMilestoneRequest(
  itemId: string,
  milestone: MilestoneKind,
): Promise<void> {
  const { error } = await getSupabaseClient().rpc('cancel_milestone_request', {
    p_item_id: itemId,
    p_milestone: milestone,
  })
  if (error) throw error
}

export async function grantMilestone(
  employeeId: string,
  itemId: string,
  milestone: MilestoneKind,
  notes?: string,
): Promise<void> {
  const { error } = await getSupabaseClient().rpc('grant_milestone', {
    p_employee_id: employeeId,
    p_item_id: itemId,
    p_milestone: milestone,
    p_notes: notes ?? null,
  })
  if (error) throw error
}

export async function resetMilestone(
  employeeId: string,
  itemId: string,
  milestone: MilestoneKind,
): Promise<void> {
  const { error } = await getSupabaseClient().rpc('reset_milestone', {
    p_employee_id: employeeId,
    p_item_id: itemId,
    p_milestone: milestone,
  })
  if (error) throw error
}

// --- Student goals ("add to goals") ----------------------------------------

export async function fetchGoalsForEmployee(employeeId: string): Promise<TrainingGoal[]> {
  const { data, error } = await getSupabaseClient()
    .from('training_goals')
    .select('*')
    .eq('employee_id', employeeId)
  if (error) throw error
  return data
}

export async function addGoal(employeeId: string, itemId: string): Promise<void> {
  const { error } = await getSupabaseClient()
    .from('training_goals')
    .insert({ employee_id: employeeId, item_id: itemId })
  if (error) throw error
}

export async function removeGoal(employeeId: string, itemId: string): Promise<void> {
  const { error } = await getSupabaseClient()
    .from('training_goals')
    .delete()
    .eq('employee_id', employeeId)
    .eq('item_id', itemId)
  if (error) throw error
}

// --- Item detail (manager edits the photo + explanation) --------------------

export async function updateNodeDetails(
  nodeId: string,
  details: { description: string; image_url: string | null },
): Promise<void> {
  const { error } = await getSupabaseClient()
    .from('training_nodes')
    .update(details)
    .eq('id', nodeId)
  if (error) throw error
}

// --- Template editing (managers restructure the tree) -----------------------

export async function createTrainingNode(input: {
  parent_id: string | null
  kind: NodeKind
  title: string
  sort_order: number
  milestones?: MilestoneKind[]
}): Promise<TrainingNode> {
  const { data, error } = await getSupabaseClient()
    .from('training_nodes')
    .insert({ ...input, milestones: input.milestones ?? [] })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function renameTrainingNode(id: string, title: string): Promise<void> {
  const { error } = await getSupabaseClient().from('training_nodes').update({ title }).eq('id', id)
  if (error) throw error
}

export async function updateNodeMilestones(id: string, milestones: MilestoneKind[]): Promise<void> {
  const { error } = await getSupabaseClient()
    .from('training_nodes')
    .update({ milestones })
    .eq('id', id)
  if (error) throw error
}

/** Tag (or clear) the venue whose items surface under an event group. */
export async function updateNodeVenueRef(id: string, venueRef: string | null): Promise<void> {
  const { error } = await getSupabaseClient()
    .from('training_nodes')
    .update({ venue_ref: venueRef })
    .eq('id', id)
  if (error) throw error
}

/** Retire (or un-retire) an item/group: hidden for those who haven't passed it
 *  off, grayed + locked for those who have, but it keeps counting toward pay. */
export async function updateNodeRetired(id: string, retired: boolean): Promise<void> {
  const { error } = await getSupabaseClient()
    .from('training_nodes')
    .update({ retired })
    .eq('id', id)
  if (error) throw error
}

/** Deletes a node (and, via ON DELETE CASCADE, its whole subtree + progress). */
export async function deleteTrainingNode(id: string): Promise<void> {
  const { error } = await getSupabaseClient().from('training_nodes').delete().eq('id', id)
  if (error) throw error
}

/** Persist a reorder / reparent: new parent + sort_order for each moved node. */
export async function updateNodePositions(
  updates: { id: string; parent_id: string | null; sort_order: number }[],
): Promise<void> {
  const client = getSupabaseClient()
  for (const u of updates) {
    const { error } = await client
      .from('training_nodes')
      .update({ parent_id: u.parent_id, sort_order: u.sort_order })
      .eq('id', u.id)
    if (error) throw error
  }
}

// --- Member management (role ceiling + archiving enforced in the DB) --------

export async function setMemberRole(targetId: string, role: EmployeeRole): Promise<void> {
  const { error } = await getSupabaseClient().rpc('set_member_role', {
    p_target: targetId,
    p_role: role,
  })
  if (error) throw error
}

export async function setMemberArchived(targetId: string, archived: boolean): Promise<void> {
  const { error } = await getSupabaseClient().rpc('set_member_archived', {
    p_target: targetId,
    p_archived: archived,
  })
  if (error) throw error
}

/** Staff set a temporary password for a locked-out member (Edge Function). */
export async function resetMemberPassword(targetId: string, password: string): Promise<void> {
  const { error } = await getSupabaseClient().functions.invoke('reset-member-password', {
    body: { targetId, password },
  })
  if (error) {
    if (error instanceof FunctionsHttpError) {
      const body = await error.context.json().catch(() => null)
      throw new Error(body?.error ?? 'Could not reset the password.')
    }
    throw error
  }
}

/** The signed-in user changes their own password. */
export async function changeOwnPassword(password: string): Promise<void> {
  const { error } = await getSupabaseClient().auth.updateUser({ password })
  if (error) throw error
}

// --- Pay (Audio Manager only, enforced in the DB) ---------------------------

export async function setBaseRate(targetId: string, rate: number): Promise<void> {
  const { error } = await getSupabaseClient().rpc('set_base_rate', {
    p_target: targetId,
    p_rate: rate,
  })
  if (error) throw error
}

export async function setCategoryAmount(nodeId: string, amount: number): Promise<void> {
  const { error } = await getSupabaseClient().rpc('set_category_amount', {
    p_node: nodeId,
    p_amount: amount,
  })
  if (error) throw error
}

// --- Comp settings + per-semester records (loyalty & soft-skills pay) --------

export async function fetchCompSettings(): Promise<CompSettings> {
  const { data, error } = await getSupabaseClient().from('comp_settings').select('*').single()
  if (error) throw error
  return data
}

/** Audio Manager updates the team-wide metrics (RLS enforces AM). */
export async function updateCompSettings(patch: Partial<CompSettings>): Promise<void> {
  const { error } = await getSupabaseClient().from('comp_settings').update(patch).eq('id', true)
  if (error) throw error
}

/** All semesters visible to the caller (pay-viewers see everyone's). */
export async function fetchAllSemesters(): Promise<EmployeeSemester[]> {
  const { data, error } = await getSupabaseClient().from('employee_semesters').select('*')
  if (error) throw error
  return data
}

export async function fetchSemesters(employeeId: string): Promise<EmployeeSemester[]> {
  const { data, error } = await getSupabaseClient()
    .from('employee_semesters')
    .select('*')
    .eq('employee_id', employeeId)
    .order('year')
    .order('term')
  if (error) throw error
  return data
}

export async function upsertSemester(
  row: Omit<EmployeeSemester, 'id'> & { id?: string },
): Promise<void> {
  const { error } = await getSupabaseClient()
    .from('employee_semesters')
    .upsert(row, { onConflict: 'employee_id,year,term' })
  if (error) throw error
}

export async function deleteSemester(id: string): Promise<void> {
  const { error } = await getSupabaseClient().from('employee_semesters').delete().eq('id', id)
  if (error) throw error
}

export async function setPriorSemesters(targetId: string, count: number): Promise<void> {
  const { error } = await getSupabaseClient().rpc('set_prior_semesters', {
    p_target: targetId,
    p_count: count,
  })
  if (error) throw error
}

// --- Pay adjustments, payroll-cleared rate, and history ---------------------

/** All pay adjustments visible to the caller. */
export async function fetchAllAdjustments(): Promise<PayAdjustment[]> {
  const { data, error } = await getSupabaseClient().from('pay_adjustments').select('*')
  if (error) throw error
  return data
}

export async function fetchAdjustments(employeeId: string): Promise<PayAdjustment[]> {
  const { data, error } = await getSupabaseClient()
    .from('pay_adjustments')
    .select('*')
    .eq('employee_id', employeeId)
    .order('created_at')
  if (error) throw error
  return data
}

export async function addAdjustment(
  employeeId: string,
  amount: number,
  note: string,
): Promise<void> {
  const { error } = await getSupabaseClient()
    .from('pay_adjustments')
    .insert({ employee_id: employeeId, amount, note })
  if (error) throw error
}

export async function deleteAdjustment(id: string): Promise<void> {
  const { error } = await getSupabaseClient().from('pay_adjustments').delete().eq('id', id)
  if (error) throw error
}

/** Audio Manager submits a rate to payroll (records history, sets cleared rate). */
export async function submitPay(targetId: string, newRate: number, note = ''): Promise<void> {
  const { error } = await getSupabaseClient().rpc('submit_pay', {
    p_target: targetId,
    p_new_rate: newRate,
    p_note: note,
  })
  if (error) throw error
}

export async function fetchPayHistory(employeeId: string): Promise<PayHistory[]> {
  const { data, error } = await getSupabaseClient()
    .from('pay_history')
    .select('*')
    .eq('employee_id', employeeId)
    .order('submitted_at', { ascending: false })
  if (error) throw error
  return data
}

// --- Performance stars ------------------------------------------------------

export async function fetchStars(employeeId: string): Promise<PerformanceStar[]> {
  const { data, error } = await getSupabaseClient()
    .from('performance_stars')
    .select('*')
    .eq('employee_id', employeeId)
  if (error) throw error
  return data
}

export async function fetchAllStars(): Promise<PerformanceStar[]> {
  const { data, error } = await getSupabaseClient().from('performance_stars').select('*')
  if (error) throw error
  return data
}

/** Award (AM) or nominate (staff) a star. created_by must be the caller. */
export async function addStar(
  employeeId: string,
  metric: string,
  note: string,
  status: StarStatus,
): Promise<void> {
  const { data: auth } = await getSupabaseClient().auth.getUser()
  const { error } = await getSupabaseClient().from('performance_stars').insert({
    employee_id: employeeId,
    metric,
    note,
    status,
    created_by: auth.user?.id,
  })
  if (error) throw error
}

/** Audio Manager approves a nomination → awarded. */
export async function approveStar(id: string): Promise<void> {
  const { error } = await getSupabaseClient()
    .from('performance_stars')
    .update({ status: 'awarded' })
    .eq('id', id)
  if (error) throw error
}

export async function deleteStar(id: string): Promise<void> {
  const { error } = await getSupabaseClient().from('performance_stars').delete().eq('id', id)
  if (error) throw error
}

// --- Audio crew policies: line items + applied penalties --------------------

export async function fetchPolicyItems(): Promise<PolicyItem[]> {
  const { data, error } = await getSupabaseClient()
    .from('policy_items')
    .select('*')
    .order('kind')
    .order('sort_order')
  if (error) throw error
  return data
}

export async function addPolicyItem(kind: 'offense' | 'termination', label: string): Promise<void> {
  const { error } = await getSupabaseClient().from('policy_items').insert({ kind, label })
  if (error) throw error
}

export async function updatePolicyItem(id: string, label: string): Promise<void> {
  const { error } = await getSupabaseClient().from('policy_items').update({ label }).eq('id', id)
  if (error) throw error
}

export async function deletePolicyItem(id: string): Promise<void> {
  const { error } = await getSupabaseClient().from('policy_items').delete().eq('id', id)
  if (error) throw error
}

export async function fetchPenalties(employeeId: string): Promise<PolicyPenalty[]> {
  const { data, error } = await getSupabaseClient()
    .from('policy_penalties')
    .select('*')
    .eq('employee_id', employeeId)
  if (error) throw error
  return data
}

export async function fetchAllPenalties(): Promise<PolicyPenalty[]> {
  const { data, error } = await getSupabaseClient().from('policy_penalties').select('*')
  if (error) throw error
  return data
}

export async function addPenalty(
  employeeId: string,
  policyItemId: string,
  note: string,
): Promise<void> {
  const { data: auth } = await getSupabaseClient().auth.getUser()
  const { error } = await getSupabaseClient().from('policy_penalties').insert({
    employee_id: employeeId,
    policy_item_id: policyItemId,
    note,
    created_by: auth.user?.id,
  })
  if (error) throw error
}

export async function deletePenalty(id: string): Promise<void> {
  const { error } = await getSupabaseClient().from('policy_penalties').delete().eq('id', id)
  if (error) throw error
}

// --- Scheduling: trainer availability ---------------------------------------

export async function fetchAvailabilityRules(trainerId: string): Promise<AvailabilityRule[]> {
  const { data, error } = await getSupabaseClient()
    .from('availability_rules')
    .select('*')
    .eq('trainer_id', trainerId)
    .order('weekday')
    .order('start_time')
  if (error) throw error
  return data
}

export async function addAvailabilityRule(
  rule: Omit<AvailabilityRule, 'id' | 'created_at'>,
): Promise<void> {
  const { error } = await getSupabaseClient().from('availability_rules').insert(rule)
  if (error) throw error
}

export async function deleteAvailabilityRule(id: string): Promise<void> {
  const { error } = await getSupabaseClient().from('availability_rules').delete().eq('id', id)
  if (error) throw error
}

export async function fetchAvailabilityBlocks(trainerId: string): Promise<AvailabilityBlock[]> {
  const { data, error } = await getSupabaseClient()
    .from('availability_blocks')
    .select('*')
    .eq('trainer_id', trainerId)
    .order('on_date')
    .order('start_time')
  if (error) throw error
  return data
}

export async function addAvailabilityBlock(
  block: Omit<AvailabilityBlock, 'id' | 'created_at'>,
): Promise<void> {
  const { error } = await getSupabaseClient().from('availability_blocks').insert(block)
  if (error) throw error
}

export async function deleteAvailabilityBlock(id: string): Promise<void> {
  const { error } = await getSupabaseClient().from('availability_blocks').delete().eq('id', id)
  if (error) throw error
}

export async function fetchAllAvailabilityRules(): Promise<AvailabilityRule[]> {
  const { data, error } = await getSupabaseClient().from('availability_rules').select('*')
  if (error) throw error
  return data
}

export async function fetchAllAvailabilityBlocks(): Promise<AvailabilityBlock[]> {
  const { data, error } = await getSupabaseClient().from('availability_blocks').select('*')
  if (error) throw error
  return data
}

export async function setMeetingMethods(methods: string[]): Promise<void> {
  const { error } = await getSupabaseClient().rpc('set_meeting_methods', { p_methods: methods })
  if (error) throw error
}

// --- Calendar availability (new model) --------------------------------------

export async function fetchAvailability(fromISO: string, toISO: string): Promise<Availability[]> {
  const { data, error } = await getSupabaseClient()
    .from('availability')
    .select('*')
    .lt('start_at', toISO)
    .gt('end_at', fromISO)
    .order('start_at')
  if (error) throw error
  return data
}

export async function addAvailability(
  rows: Omit<Availability, 'id' | 'created_at'>[],
): Promise<void> {
  const { error } = await getSupabaseClient().from('availability').insert(rows)
  if (error) throw error
}

export async function updateAvailability(
  id: string,
  patch: Partial<Omit<Availability, 'id' | 'trainer_id' | 'created_at'>>,
): Promise<void> {
  const { error } = await getSupabaseClient().from('availability').update(patch).eq('id', id)
  if (error) throw error
}

export async function deleteAvailability(id: string): Promise<void> {
  const { error } = await getSupabaseClient().from('availability').delete().eq('id', id)
  if (error) throw error
}

export async function deleteAvailabilitySeries(seriesId: string): Promise<void> {
  const { error } = await getSupabaseClient().from('availability').delete().eq('series_id', seriesId)
  if (error) throw error
}

export interface SlotCount {
  availability_id: string
  start_at: string
  taken: number
}

export async function fetchAvailabilityCounts(fromISO: string, toISO: string): Promise<SlotCount[]> {
  const { data, error } = await getSupabaseClient().rpc('availability_counts', {
    p_from: fromISO,
    p_to: toISO,
  })
  if (error) throw error
  return data ?? []
}

export async function bookSlot(input: {
  availabilityId: string
  start: string
  topic?: string
  method?: string | null
  description?: string
}): Promise<string> {
  const { data, error } = await getSupabaseClient().rpc('book_slot', {
    p_availability: input.availabilityId,
    p_start: input.start,
    p_topic: input.topic ?? '',
    p_method: input.method ?? null,
    p_description: input.description ?? '',
  })
  if (error) throw error
  return data as string
}

export async function setCalendarColor(color: string): Promise<void> {
  const { error } = await getSupabaseClient().rpc('set_calendar_color', { p_color: color })
  if (error) throw error
}

// --- Scheduling: bookings ---------------------------------------------------

export interface BusyRow {
  trainer_id: string
  start_at: string
  end_at: string
}

export async function fetchTrainerBusy(from: string, to: string): Promise<BusyRow[]> {
  const { data, error } = await getSupabaseClient().rpc('trainer_busy', { p_from: from, p_to: to })
  if (error) throw error
  return data ?? []
}

/** Bookings the caller can see (their own as student/trainer; staff see all). */
export async function fetchMyBookings(): Promise<Booking[]> {
  const { data, error } = await getSupabaseClient()
    .from('bookings')
    .select('*')
    .order('start_at', { ascending: false })
  if (error) throw error
  return data
}

export async function requestBooking(input: {
  trainerId: string
  start: string
  end: string
  topic?: string
  itemId?: string | null
  method?: string | null
  description?: string
}): Promise<string> {
  const { data, error } = await getSupabaseClient().rpc('request_booking', {
    p_trainer: input.trainerId,
    p_start: input.start,
    p_end: input.end,
    p_topic: input.topic ?? '',
    p_item: input.itemId ?? null,
    p_method: input.method ?? null,
    p_description: input.description ?? '',
  })
  if (error) throw error
  return data as string
}

export async function decideBooking(id: string, confirm: boolean): Promise<void> {
  const { error } = await getSupabaseClient().rpc('decide_booking', {
    p_booking: id,
    p_confirm: confirm,
  })
  if (error) throw error
}

export async function cancelBooking(id: string): Promise<void> {
  const { error } = await getSupabaseClient().rpc('cancel_booking', { p_booking: id })
  if (error) throw error
}

export async function rescheduleBooking(id: string, start: string, end: string): Promise<void> {
  const { error } = await getSupabaseClient().rpc('reschedule_booking', {
    p_booking: id,
    p_start: start,
    p_end: end,
  })
  if (error) throw error
}

export async function updateBookingDetails(
  id: string,
  topic: string,
  description: string,
  method: string | null,
): Promise<void> {
  const { error } = await getSupabaseClient().rpc('update_booking_details', {
    p_booking: id,
    p_topic: topic,
    p_description: description,
    p_method: method,
  })
  if (error) throw error
}

export async function setBookingOutcome(id: string, outcome: 'completed' | 'no_show'): Promise<void> {
  const { error } = await getSupabaseClient().rpc('set_booking_outcome', {
    p_booking: id,
    p_outcome: outcome,
  })
  if (error) throw error
}

export async function setBookingNotes(id: string, notes: string): Promise<void> {
  const { error } = await getSupabaseClient().rpc('set_booking_notes', {
    p_booking: id,
    p_notes: notes,
  })
  if (error) throw error
}

export async function reassignBooking(id: string, trainerId: string): Promise<void> {
  const { error } = await getSupabaseClient().rpc('reassign_booking', {
    p_booking: id,
    p_trainer: trainerId,
  })
  if (error) throw error
}

export async function deleteBookingRpc(id: string): Promise<void> {
  const { error } = await getSupabaseClient().rpc('delete_booking', { p_booking: id })
  if (error) throw error
}

// --- Notifications ----------------------------------------------------------

export async function fetchNotifications(): Promise<AppNotification[]> {
  const { data, error } = await getSupabaseClient()
    .from('notifications')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(30)
  if (error) throw error
  return data
}

export async function markNotificationRead(id: string): Promise<void> {
  const { error } = await getSupabaseClient().from('notifications').update({ read: true }).eq('id', id)
  if (error) throw error
}

export async function markAllNotificationsRead(): Promise<void> {
  const { error } = await getSupabaseClient()
    .from('notifications')
    .update({ read: true })
    .eq('read', false)
  if (error) throw error
}

export interface NewTeamMember {
  fullName: string
  email: string
  password: string
  role: EmployeeRole
}

/**
 * Create a new team member. Calls the `add-team-member` Edge Function, which
 * enforces (server-side) that the caller is a manager before creating the
 * account — the browser cannot create users directly. See
 * supabase/functions/add-team-member/index.ts.
 */
export async function addTeamMember(input: NewTeamMember): Promise<void> {
  const { error } = await getSupabaseClient().functions.invoke('add-team-member', {
    body: input,
  })
  if (error) {
    // A non-2xx response arrives as FunctionsHttpError; the readable reason is
    // in the response body our function sends ({ error: "..." }).
    if (error instanceof FunctionsHttpError) {
      const body = await error.context.json().catch(() => null)
      throw new Error(body?.error ?? 'Could not add the team member.')
    }
    throw error
  }
}
