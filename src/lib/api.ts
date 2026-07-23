// All database reads and writes live in this one module so future changes to
// queries or the schema only touch one place. Pass-off WRITES go through
// Postgres RPC functions (see the migration file) — the security rules are
// enforced in the database, not here.

import { FunctionsHttpError } from '@supabase/supabase-js'
import { getSupabaseClient } from './supabaseClient'
import type {
  Announcement,
  EmployeeRole,
  MilestoneKind,
  MilestoneProgress,
  NodeKind,
  Profile,
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
