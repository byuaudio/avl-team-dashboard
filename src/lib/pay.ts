// Training-based pay calculation (Phase 2). See supabase/migrations/0008_pay.sql.
//
//   rate = base_rate + Σ category.dollar_value × (completed ÷ active)
//
// "completed" = the item's FINAL milestone is granted (only the last checkbox
// pays). "active" = the item is not retired. Completed-but-retired items count
// in the numerator but not the denominator, so a category can exceed 100% and
// retired training keeps paying.

import type { CompSettings, EmployeeSemester, MilestoneProgress, TrainingNode } from './types'

export interface CategoryPay {
  id: string
  title: string
  amount: number
  completed: number
  active: number
  pct: number
  earning: number
}

export interface PayBreakdown {
  baseRate: number
  categories: CategoryPay[]
  total: number
}

export function computePay(
  nodes: TrainingNode[],
  progress: MilestoneProgress[],
  baseRate: number,
): PayBreakdown {
  const childrenByParent = new Map<string, TrainingNode[]>()
  for (const n of nodes) {
    const key = n.parent_id ?? 'root'
    const list = childrenByParent.get(key) ?? []
    list.push(n)
    childrenByParent.set(key, list)
  }

  // Items whose FINAL milestone is granted for this employee.
  const granted = new Set(
    progress.filter((p) => p.status === 'granted').map((p) => `${p.item_id}:${p.milestone}`),
  )
  const isComplete = (item: TrainingNode) =>
    item.milestones.length > 0 &&
    granted.has(`${item.id}:${item.milestones[item.milestones.length - 1]}`)

  // Effectively-retired = node.retired or any ancestor retired.
  const retired = new Set<string>()
  const markRetired = (id: string, inherited: boolean) => {
    for (const child of childrenByParent.get(id) ?? []) {
      const r = inherited || child.retired
      if (r) retired.add(child.id)
      markRetired(child.id, r)
    }
  }
  for (const root of childrenByParent.get('root') ?? []) {
    const r = root.retired
    if (r) retired.add(root.id)
    markRetired(root.id, r)
  }

  const itemsUnder = (nodeId: string): TrainingNode[] => {
    const out: TrainingNode[] = []
    const walk = (id: string) => {
      for (const child of childrenByParent.get(id) ?? []) {
        if (child.kind === 'item') out.push(child)
        else walk(child.id)
      }
    }
    walk(nodeId)
    return out
  }

  const categories: CategoryPay[] = []
  let total = baseRate

  const walkForCategories = (id: string, levelTitle: string) => {
    for (const node of childrenByParent.get(id) ?? []) {
      const nextLevel = node.kind === 'level' ? node.title : levelTitle
      if (node.kind === 'category' && node.dollar_value != null) {
        const items = itemsUnder(node.id)
        const active = items.filter((i) => !retired.has(i.id))
        const completed = items.filter((i) => isComplete(i))
        const denom = active.length
        const pct = denom === 0 ? (completed.length > 0 ? 1 : 0) : completed.length / denom
        const amount = Number(node.dollar_value)
        const earning = amount * pct
        categories.push({
          id: node.id,
          title: levelTitle ? `${levelTitle} · ${node.title}` : node.title,
          amount,
          completed: completed.length,
          active: denom,
          pct,
          earning,
        })
        total += earning
      } else {
        walkForCategories(node.id, nextLevel)
      }
    }
  }
  walkForCategories('root', '')

  return { baseRate, categories, total }
}

export interface SemesterLoyalty {
  id: string
  label: string
  maintenance: number
  other: number
  raise: number
}

export interface SemesterSoft {
  id: string
  label: string
  selfScore: number | null
  supervisorScore: number | null
  raise: number
}

/** Loyalty raise per semester and total. */
export function computeLoyalty(
  semesters: EmployeeSemester[],
  s: CompSettings,
): { total: number; perSemester: SemesterLoyalty[] } {
  const denom =
    s.expected_maintenance_hours * s.weight_maintenance +
    s.expected_other_hours * s.weight_other
  const perSemester = semesters.map((sem) => {
    const num = sem.maintenance_hours * s.weight_maintenance + sem.other_hours * s.weight_other
    const raise = denom > 0 ? (num / denom) * s.loyalty_avg_value : 0
    return {
      id: sem.id,
      label: `${sem.term} ${sem.year}`,
      maintenance: sem.maintenance_hours,
      other: sem.other_hours,
      raise,
    }
  })
  return { total: perSemester.reduce((a, b) => a + b.raise, 0), perSemester }
}

/** Soft-skills raise per semester (supervisor score only) and total. */
export function computeSoftSkills(
  semesters: EmployeeSemester[],
  s: CompSettings,
): { total: number; perSemester: SemesterSoft[] } {
  const span = s.soft_max - s.soft_benchmark
  const perSemester = semesters.map((sem) => {
    const sup = sem.supervisor_score
    const raise =
      sup == null || span === 0
        ? 0
        : ((sup - s.soft_benchmark) / span) * s.soft_additional_at_max + s.soft_bench_raise
    return {
      id: sem.id,
      label: `${sem.term} ${sem.year}`,
      selfScore: sem.self_eval_score,
      supervisorScore: sup,
      raise,
    }
  })
  return {
    total: perSemester.reduce((a, b) => a + (b.supervisorScore == null ? 0 : b.raise), 0),
    perSemester,
  }
}
