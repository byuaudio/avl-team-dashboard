// Row types mirroring the database schema in
// supabase/migrations/0001_initial_schema.sql. Keep the two in sync.

export type EmployeeRole = 'student' | 'student_trainer' | 'manager'

export type TrainingStatus = 'not_started' | 'passoff_requested' | 'passed_off'

export interface Profile {
  id: string
  full_name: string
  role: EmployeeRole
  is_active: boolean
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
  manager: 'Manager',
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
  note: string
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
