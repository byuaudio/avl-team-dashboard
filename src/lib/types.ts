// Row types mirroring the database schema in
// supabase/migrations/0001_initial_schema.sql. Keep the two in sync.

export type EmployeeRole =
  | 'student'
  | 'student_trainer'
  | 'three_quarter_time'
  | 'full_time'
  | 'audio_manager'
  | 'freelancer'
  | 'non_audio_student'
  | 'office_student'

export type TrainingStatus = 'not_started' | 'passoff_requested' | 'passed_off'

export interface Profile {
  id: string
  full_name: string
  role: EmployeeRole
  is_active: boolean
  archived: boolean
  base_rate: number
  created_at: string
}

export interface TrainingSection {
  id: string
  title: string
  sort_order: number
}

export interface TrainingItem {
  id: string
  section_id: string
  title: string
  description: string
  sort_order: number
}

export interface TrainingProgress {
  id: string
  employee_id: string
  item_id: string
  status: TrainingStatus
  requested_at: string | null
  passed_off_by: string | null
  passed_off_at: string | null
  notes: string
}

export interface Announcement {
  id: string
  title: string
  body: string
  created_by: string | null
  created_at: string
}

export const ROLE_LABELS: Record<EmployeeRole, string> = {
  student: 'Student',
  student_trainer: 'Student Trainer',
  three_quarter_time: '3/4-Time',
  full_time: 'Full-Time',
  audio_manager: 'Audio Manager',
  freelancer: 'Freelancer',
  non_audio_student: 'Non-Audio Student',
  office_student: 'Office Student',
}

/** Access ladder — keep in sync with role_rank() in migration 0007. */
export const ROLE_RANK: Record<EmployeeRole, number> = {
  audio_manager: 100,
  full_time: 80,
  three_quarter_time: 60,
  student_trainer: 40,
  student: 20,
  freelancer: 20,
  non_audio_student: 20,
  office_student: 10,
}

/** Roles listed high→low, for pickers. */
export const ROLES_BY_RANK: EmployeeRole[] = (Object.keys(ROLE_LABELS) as EmployeeRole[]).sort(
  (a, b) => ROLE_RANK[b] - ROLE_RANK[a],
)

/** Highest rank a given role may assign to others (0 = cannot manage members). */
export function maxAssignableRank(role: EmployeeRole | undefined): number {
  switch (role) {
    case 'audio_manager':
      return 100
    case 'full_time':
      return 60
    case 'three_quarter_time':
      return 40
    default:
      return 0
  }
}

/** The roles a given role is allowed to assign, high→low. */
export function assignableRoles(role: EmployeeRole | undefined): EmployeeRole[] {
  const cap = maxAssignableRank(role)
  return ROLES_BY_RANK.filter((r) => ROLE_RANK[r] <= cap)
}

// --- Real-template redesign (migration 0002) --------------------------------

export type NodeKind = 'level' | 'category' | 'group' | 'item'

export type MilestoneKind =
  | 'introduced'
  | 'guided'
  | 'supervised'
  | 'passed_off'
  | 'submitted'
  | 'tested'

export type MilestoneStatus = 'not_started' | 'requested' | 'granted'

/** One node in the training template tree (see supabase/migrations/0002). */
export interface TrainingNode {
  id: string
  parent_id: string | null
  kind: NodeKind
  title: string
  sort_order: number
  /** Ordered milestones this item is signed off on; empty for non-items. */
  milestones: MilestoneKind[]
  /** Category-only: raise contribution and final-check approver. */
  dollar_value: number | null
  approver: string | null
  /** Short footnote shown inline under the item title. */
  note: string
  /** Item detail: longer explanation and a photo, shown when clicked. */
  description: string
  image_url: string | null
  /** Event group only: the venue group whose items to also surface here. */
  venue_ref: string | null
  /** Retired items keep paying those who passed them off, but are hidden/locked. */
  retired: boolean
}

/** A skill a student has flagged as a goal to learn (migration 0003). */
export interface TrainingGoal {
  id: string
  employee_id: string
  item_id: string
  created_at: string
}

export interface MilestoneProgress {
  id: string
  employee_id: string
  item_id: string
  milestone: MilestoneKind
  status: MilestoneStatus
  requested_at: string | null
  granted_by: string | null
  granted_at: string | null
  notes: string
}

export const MILESTONE_LABELS: Record<MilestoneKind, string> = {
  introduced: 'Introduced',
  guided: 'Guided',
  supervised: 'Supervised',
  passed_off: 'Passed Off',
  submitted: 'Submitted',
  tested: 'Tested',
}
