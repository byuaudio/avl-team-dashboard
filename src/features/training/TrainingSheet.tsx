import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  cancelMilestoneRequest,
  fetchMilestoneProgressForEmployee,
  fetchTeamRoster,
  fetchTrainingTree,
  grantMilestone,
  requestMilestone,
  resetMilestone,
} from '../../lib/api'
import type { MilestoneKind, MilestoneProgress, Profile, TrainingNode } from '../../lib/types'
import { MILESTONE_LABELS } from '../../lib/types'
import { useAuth } from '../auth/AuthContext'

const ROOT = 'root'

interface TrainingSheetProps {
  employeeId: string
}

/**
 * Renders one employee's training sheet as the real template tree
 * (Level → Category → Group → Skill), each skill showing its milestone chips.
 * Actions depend on who is looking:
 *   - the employee themself: request / cancel a milestone on their own sheet
 *   - a trainer or manager viewing someone else: grant a milestone
 *   - a manager viewing someone else: also reset a milestone
 * The database enforces these rules independently; the UI just mirrors them.
 */
export function TrainingSheet({ employeeId }: TrainingSheetProps) {
  const { profile, canGrantPassoffs, isManager } = useAuth()
  const [nodes, setNodes] = useState<TrainingNode[] | null>(null)
  const [progress, setProgress] = useState<MilestoneProgress[] | null>(null)
  const [roster, setRoster] = useState<Profile[]>([])
  const [error, setError] = useState<string | null>(null)

  const isOwnSheet = profile?.id === employeeId

  const loadProgress = useCallback(async () => {
    setProgress(await fetchMilestoneProgressForEmployee(employeeId))
  }, [employeeId])

  useEffect(() => {
    setNodes(null)
    setProgress(null)
    Promise.all([fetchTrainingTree(), fetchTeamRoster()])
      .then(([loadedNodes, loadedRoster]) => {
        setNodes(loadedNodes)
        setRoster(loadedRoster)
        return loadProgress()
      })
      .catch((loadError: Error) => setError(loadError.message))
  }, [employeeId, loadProgress])

  const childrenByParent = useMemo(() => {
    const map = new Map<string, TrainingNode[]>()
    for (const node of nodes ?? []) {
      const key = node.parent_id ?? ROOT
      const list = map.get(key) ?? []
      list.push(node)
      map.set(key, list)
    }
    return map
  }, [nodes])

  const progressByKey = useMemo(() => {
    const map = new Map<string, MilestoneProgress>()
    for (const row of progress ?? []) map.set(`${row.item_id}:${row.milestone}`, row)
    return map
  }, [progress])

  // For each node, total milestone slots and how many are granted, across its
  // whole subtree — used for the "3 / 12" summaries on levels and categories.
  const counts = useMemo(() => {
    const result = new Map<string, { total: number; granted: number }>()
    const visit = (node: TrainingNode): { total: number; granted: number } => {
      let total = 0
      let granted = 0
      if (node.kind === 'item') {
        for (const m of node.milestones) {
          total += 1
          if (progressByKey.get(`${node.id}:${m}`)?.status === 'granted') granted += 1
        }
      }
      for (const child of childrenByParent.get(node.id) ?? []) {
        const c = visit(child)
        total += c.total
        granted += c.granted
      }
      result.set(node.id, { total, granted })
      return { total, granted }
    }
    for (const root of childrenByParent.get(ROOT) ?? []) visit(root)
    return result
  }, [childrenByParent, progressByKey])

  const nameById = useMemo(() => {
    const map = new Map<string, string>()
    for (const person of roster) map.set(person.id, person.full_name)
    return map
  }, [roster])

  const runAction = useCallback(
    async (action: () => Promise<void>) => {
      setError(null)
      try {
        await action()
        await loadProgress()
      } catch (actionError) {
        setError((actionError as Error).message)
      }
    },
    [loadProgress],
  )

  const ctx: NodeContext = {
    childrenByParent,
    counts,
    progressByKey,
    nameById,
    isOwnSheet,
    canGrant: canGrantPassoffs && !isOwnSheet,
    canReset: isManager && !isOwnSheet,
    onRequest: (itemId, m) => runAction(() => requestMilestone(itemId, m)),
    onCancel: (itemId, m) => runAction(() => cancelMilestoneRequest(itemId, m)),
    onGrant: (itemId, m, notes) => runAction(() => grantMilestone(employeeId, itemId, m, notes)),
    onReset: (itemId, m) => runAction(() => resetMilestone(employeeId, itemId, m)),
  }

  if (error && !nodes) return <p className="error-text">{error}</p>
  if (!nodes || !progress) return <div className="page-message">Loading…</div>

  const levels = childrenByParent.get(ROOT) ?? []
  if (levels.length === 0) {
    return <p className="muted">No training template has been set up yet.</p>
  }

  const overall = { total: 0, granted: 0 }
  for (const level of levels) {
    const c = counts.get(level.id)
    if (c) {
      overall.total += c.total
      overall.granted += c.granted
    }
  }

  return (
    <div className="stack">
      <p className="muted">
        {overall.granted} of {overall.total} sign-offs complete
      </p>
      {error && <p className="error-text">{error}</p>}
      {levels.map((level) => (
        <NodeView key={level.id} node={level} ctx={ctx} />
      ))}
    </div>
  )
}

interface NodeContext {
  childrenByParent: Map<string, TrainingNode[]>
  counts: Map<string, { total: number; granted: number }>
  progressByKey: Map<string, MilestoneProgress>
  nameById: Map<string, string>
  isOwnSheet: boolean
  canGrant: boolean
  canReset: boolean
  onRequest: (itemId: string, m: MilestoneKind) => void
  onCancel: (itemId: string, m: MilestoneKind) => void
  onGrant: (itemId: string, m: MilestoneKind, notes?: string) => void
  onReset: (itemId: string, m: MilestoneKind) => void
}

function NodeView({ node, ctx }: { node: TrainingNode; ctx: NodeContext }) {
  const kids = ctx.childrenByParent.get(node.id) ?? []

  if (node.kind === 'item') {
    return <ItemRow node={node} ctx={ctx} />
  }

  const c = ctx.counts.get(node.id) ?? { total: 0, granted: 0 }
  const summary = (
    <>
      <span className="tree-title">{node.title}</span>
      {c.total > 0 && (
        <span className="tree-count">
          {c.granted}/{c.total}
        </span>
      )}
      {node.approver && <span className="tree-approver">Final check: {node.approver}</span>}
    </>
  )

  // Levels and categories collapse/expand; groups are always-open sub-blocks.
  if (node.kind === 'group') {
    return (
      <div className="tree-group">
        <div className="tree-group-head">{summary}</div>
        <div className="tree-children">
          {kids.map((k) => (
            <NodeView key={k.id} node={k} ctx={ctx} />
          ))}
        </div>
      </div>
    )
  }

  return (
    <details className={`card tree-node tree-${node.kind}`} open={node.kind === 'category'}>
      <summary>{summary}</summary>
      <div className="tree-children">
        {kids.map((k) => (
          <NodeView key={k.id} node={k} ctx={ctx} />
        ))}
      </div>
    </details>
  )
}

function ItemRow({ node, ctx }: { node: TrainingNode; ctx: NodeContext }) {
  return (
    <div className="item-row">
      <div className="item-title">
        {node.title}
        {node.note && <span className="muted item-description"> — {node.note}</span>}
      </div>
      <div className="milestone-chips">
        {node.milestones.map((m) => (
          <MilestoneChip key={m} itemId={node.id} milestone={m} ctx={ctx} />
        ))}
      </div>
    </div>
  )
}

function MilestoneChip({
  itemId,
  milestone,
  ctx,
}: {
  itemId: string
  milestone: MilestoneKind
  ctx: NodeContext
}) {
  const row = ctx.progressByKey.get(`${itemId}:${milestone}`)
  const status = row?.status ?? 'not_started'

  function handleGrant() {
    const notes = window.prompt('Optional note for this sign-off (leave blank for none):')
    if (notes === null) return // trainer hit Cancel
    ctx.onGrant(itemId, milestone, notes.trim() === '' ? undefined : notes.trim())
  }

  return (
    <div className={`chip chip-${status}`}>
      <span className="chip-label">{MILESTONE_LABELS[milestone]}</span>
      {status === 'granted' && row?.granted_by && (
        <span className="chip-meta">by {ctx.nameById.get(row.granted_by) ?? 'Unknown'}</span>
      )}
      {status === 'requested' && <span className="chip-meta">requested</span>}
      <div className="chip-actions">
        {ctx.isOwnSheet && status === 'not_started' && (
          <button className="chip-button" onClick={() => ctx.onRequest(itemId, milestone)}>
            Request
          </button>
        )}
        {ctx.isOwnSheet && status === 'requested' && (
          <button className="chip-button" onClick={() => ctx.onCancel(itemId, milestone)}>
            Cancel
          </button>
        )}
        {ctx.canGrant && status !== 'granted' && (
          <button className="chip-button chip-button-primary" onClick={handleGrant}>
            Grant
          </button>
        )}
        {ctx.canReset && status === 'granted' && (
          <button className="chip-button" onClick={() => ctx.onReset(itemId, milestone)}>
            Reset
          </button>
        )}
      </div>
    </div>
  )
}
