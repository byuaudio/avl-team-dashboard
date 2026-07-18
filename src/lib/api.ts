// All database reads and writes live in this one module so future changes to
// queries or the schema only touch one place. Pass-off WRITES go through
// Postgres RPC functions (see the migration file) — the security rules are
// enforced in the database, not here.

import { getSupabaseClient } from './supabaseClient'
import type {
  Announcement,
  Profile,
  TrainingItem,
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
