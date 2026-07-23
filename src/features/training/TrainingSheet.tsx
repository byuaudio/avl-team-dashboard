import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  addGoal,
  cancelMilestoneRequest,
  fetchGoalsForEmployee,
  fetchMilestoneProgressForEmployee,
  fetchTeamRoster,
  fetchTrainingTree,
  grantMilestone,
  removeGoal,
  requestMilestone,
  resetMilestone,
  updateNodeDetails,
} from '../../lib/api'
import type {
  MilestoneKind,
  MilestoneProgress,
  Profile,
  TrainingGoal,
  TrainingNode,
} from '../../lib/types'
import { MILESTONE_LABELS } from '../../lib/types'
import { useAuth } from '../auth/AuthContext'

const ROOT = 'root'

interface TrainingSheetProps {
  employeeId: string
}

/**
 * Renders one employee's training sheet as the real template tree
 * (Level → Category → Group → Skill). Each skill shows its milestone chips, a
 * "goal" star, and opens a photo + explanation when clicked. Actions depend on
 * who is looking (see MilestoneChip). The database enforces the rules; the UI
 * just mirrors them.
 */
export function TrainingSheet({ employeeId }: TrainingSheetProps) {
  const { profile, canGrantPassoffs, canEditTemplate } = useAuth()
  const [nodes, setNodes] = useState<TrainingNode[] | null>(null)
  const [progress, setProgress] = useState<MilestoneProgress[] | null>(null)
  const [goals, setGoals] = useState<TrainingGoal[] | null>(null)
  const [roster, setRoster] = useState<Profile[]>([])
  const [error, setError] = useState<string | null>(null)
  const [detailNode, setDetailNode] = useState<TrainingNode | null>(null)
  // Which containers are expanded. Empty = everything collapsed (the default).
  const [openIds, setOpenIds] = useState<Set<string>>(new Set())

  const isOwnSheet = profile?.id === employeeId

  const loadProgress = useCallback(async () => {
    setProgress(await fetchMilestoneProgressForEmployee(employeeId))
  }, [employeeId])

  const loadGoals = useCallback(async () => {
    setGoals(await fetchGoalsForEmployee(employeeId))
  }, [employeeId])

  useEffect(() => {
    setNodes(null)
    setProgress(null)
    setGoals(null)
    Promise.all([fetchTrainingTree(), fetchTeamRoster()])
      .then(([loadedNodes, loadedRoster]) => {
        setNodes(loadedNodes)
        setRoster(loadedRoster)
        return Promise.all([loadProgress(), loadGoals()])
      })
      .catch((loadError: Error) => setError(loadError.message))
  }, [employeeId, loadProgress, loadGoals])

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

  const byId = useMemo(() => {
    const map = new Map<string, TrainingNode>()
    for (const node of nodes ?? []) map.set(node.id, node)
    return map
  }, [nodes])

  const progressByKey = useMemo(() => {
    const map = new Map<string, MilestoneProgress>()
    for (const row of progress ?? []) map.set(`${row.item_id}:${row.milestone}`, row)
    return map
  }, [progress])

  const goalItemIds = useMemo(
    () => new Set((goals ?? []).map((g) => g.item_id)),
    [goals],
  )

  // Effectively-retired = the node or an ancestor is retired.
  const effectiveRetired = useMemo(() => {
    const set = new Set<string>()
    const walk = (id: string, inherited: boolean) => {
      for (const child of childrenByParent.get(id) ?? []) {
        const r = inherited || child.retired
        if (r) set.add(child.id)
        walk(child.id, r)
      }
    }
    for (const root of childrenByParent.get(ROOT) ?? []) {
      if (root.retired) set.add(root.id)
      walk(root.id, root.retired)
    }
    return set
  }, [childrenByParent])

  const isItemComplete = useCallback(
    (node: TrainingNode) =>
      node.milestones.length > 0 &&
      progressByKey.get(`${node.id}:${node.milestones[node.milestones.length - 1]}`)?.status ===
        'granted',
    [progressByKey],
  )

  // A retired item is shown (grayed + locked) only if this employee passed it
  // off; otherwise it's hidden. Containers show only if a descendant shows.
  const visibleIds = useMemo(() => {
    const set = new Set<string>()
    const visit = (node: TrainingNode): boolean => {
      if (node.kind === 'item') {
        const vis = !effectiveRetired.has(node.id) || isItemComplete(node)
        if (vis) set.add(node.id)
        return vis
      }
      let any = false
      for (const child of childrenByParent.get(node.id) ?? []) if (visit(child)) any = true
      if (any) set.add(node.id)
      return any
    }
    for (const root of childrenByParent.get(ROOT) ?? []) visit(root)
    return set
  }, [childrenByParent, effectiveRetired, isItemComplete])

  // Progress bars count active (non-retired) items only.
  const counts = useMemo(() => {
    const result = new Map<string, NodeCount>()
    const visit = (node: TrainingNode): NodeCount => {
      let total = 0
      let granted = 0
      let goalPending = 0
      if (node.kind === 'item' && !effectiveRetired.has(node.id)) {
        const starred = goalItemIds.has(node.id)
        for (const m of node.milestones) {
          total += 1
          if (progressByKey.get(`${node.id}:${m}`)?.status === 'granted') granted += 1
          else if (starred) goalPending += 1
        }
      }
      for (const child of childrenByParent.get(node.id) ?? []) {
        const c = visit(child)
        total += c.total
        granted += c.granted
        goalPending += c.goalPending
      }
      result.set(node.id, { total, granted, goalPending })
      return { total, granted, goalPending }
    }
    for (const root of childrenByParent.get(ROOT) ?? []) visit(root)
    return result
  }, [childrenByParent, progressByKey, goalItemIds, effectiveRetired])

  const nameById = useMemo(() => {
    const map = new Map<string, string>()
    for (const person of roster) map.set(person.id, person.full_name)
    return map
  }, [roster])

  // Toggle a container open/closed. Closing a container also collapses every
  // container nested inside it, so re-opening it starts tidy.
  const toggleOpen = useCallback(
    (nodeId: string) => {
      setOpenIds((prev) => {
        const next = new Set(prev)
        if (next.has(nodeId)) {
          const stack = [nodeId]
          while (stack.length) {
            const id = stack.pop() as string
            next.delete(id)
            for (const child of childrenByParent.get(id) ?? []) stack.push(child.id)
          }
        } else {
          next.add(nodeId)
        }
        return next
      })
    },
    [childrenByParent],
  )

  const runAction = useCallback(
    async (action: () => Promise<void>, reload: () => Promise<unknown>) => {
      setError(null)
      try {
        await action()
        await reload()
      } catch (actionError) {
        setError((actionError as Error).message)
      }
    },
    [],
  )

  // A granted milestone can un-star an item server-side, so refresh both.
  const reloadProgressAndGoals = useCallback(
    () => Promise.all([loadProgress(), loadGoals()]),
    [loadProgress, loadGoals],
  )

  const saveDetails = useCallback(
    async (nodeId: string, details: { description: string; image_url: string | null }) => {
      await updateNodeDetails(nodeId, details)
      setNodes((prev) =>
        (prev ?? []).map((n) => (n.id === nodeId ? { ...n, ...details } : n)),
      )
      setDetailNode((prev) => (prev && prev.id === nodeId ? { ...prev, ...details } : prev))
    },
    [],
  )

  const ctx: NodeContext = {
    childrenByParent,
    counts,
    progressByKey,
    goalItemIds,
    nameById,
    isOwnSheet,
    canGrant: canGrantPassoffs && !isOwnSheet,
    canReset: canEditTemplate && !isOwnSheet,
    onRequest: (itemId, m) => runAction(() => requestMilestone(itemId, m), loadProgress),
    onCancel: (itemId, m) => runAction(() => cancelMilestoneRequest(itemId, m), loadProgress),
    onGrant: (itemId, m) =>
      runAction(() => grantMilestone(employeeId, itemId, m), reloadProgressAndGoals),
    onReset: (itemId, m) => runAction(() => resetMilestone(employeeId, itemId, m), loadProgress),
    onToggleGoal: (node) =>
      runAction(
        () =>
          goalItemIds.has(node.id)
            ? removeGoal(employeeId, node.id)
            : addGoal(employeeId, node.id),
        loadGoals,
      ),
    onOpenDetail: (node) => setDetailNode(node),
    openIds,
    onToggle: toggleOpen,
    byId,
    effectiveRetired,
    visibleIds,
  }

  if (error && !nodes) return <p className="error-text">{error}</p>
  if (!nodes || !progress || !goals) return <div className="page-message">Loading…</div>

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
      {detailNode && (
        <DetailModal
          node={detailNode}
          canEdit={canEditTemplate}
          onSave={saveDetails}
          onClose={() => setDetailNode(null)}
        />
      )}
    </div>
  )
}

interface NodeCount {
  total: number
  granted: number
  goalPending: number
}

interface NodeContext {
  childrenByParent: Map<string, TrainingNode[]>
  counts: Map<string, NodeCount>
  progressByKey: Map<string, MilestoneProgress>
  goalItemIds: Set<string>
  nameById: Map<string, string>
  isOwnSheet: boolean
  canGrant: boolean
  canReset: boolean
  onRequest: (itemId: string, m: MilestoneKind) => void
  onCancel: (itemId: string, m: MilestoneKind) => void
  onGrant: (itemId: string, m: MilestoneKind) => void
  onReset: (itemId: string, m: MilestoneKind) => void
  onToggleGoal: (node: TrainingNode) => void
  onOpenDetail: (node: TrainingNode) => void
  openIds: Set<string>
  onToggle: (nodeId: string) => void
  byId: Map<string, TrainingNode>
  effectiveRetired: Set<string>
  visibleIds: Set<string>
}

/** All item descendants of a node, in order. */
function collectItems(
  rootId: string,
  childrenByParent: Map<string, TrainingNode[]>,
): TrainingNode[] {
  const out: TrainingNode[] = []
  const walk = (id: string) => {
    for (const child of childrenByParent.get(id) ?? []) {
      if (child.kind === 'item') out.push(child)
      else walk(child.id)
    }
  }
  walk(rootId)
  return out
}

function ProgressBar({ granted, goalPending, total }: NodeCount) {
  const greenPct = total > 0 ? (granted / total) * 100 : 0
  const yellowPct = total > 0 ? (goalPending / total) * 100 : 0
  return (
    <div
      className="progress-bar"
      title={`${granted} done${goalPending > 0 ? `, ${goalPending} starred` : ''} of ${total}`}
    >
      <div className="progress-bar-fill" style={{ width: `${greenPct}%` }} />
      <div className="progress-bar-goal" style={{ width: `${yellowPct}%` }} />
    </div>
  )
}

function NodeView({ node, ctx }: { node: TrainingNode; ctx: NodeContext }) {
  if (!ctx.visibleIds.has(node.id)) return null
  const kids = ctx.childrenByParent.get(node.id) ?? []

  if (node.kind === 'item') {
    return <ItemRow node={node} ctx={ctx} />
  }

  const c = ctx.counts.get(node.id) ?? { total: 0, granted: 0, goalPending: 0 }
  const summary = (
    <>
      <span className="tree-title">{node.title}</span>
      {c.total > 0 && (
        <>
          <span className="tree-count">
            {c.granted}/{c.total}
          </span>
          <ProgressBar granted={c.granted} goalPending={c.goalPending} total={c.total} />
        </>
      )}
      {node.approver && <span className="tree-approver">Final check: {node.approver}</span>}
    </>
  )

  // Every container (level, category, group, nested groups) is collapsible and
  // shows its own progress bar. All start collapsed; open state is controlled by
  // React so collapsing a container also collapses everything inside it.
  const isCard = node.kind === 'level' || node.kind === 'category'
  return (
    <details className={`tree-node tree-${node.kind}${isCard ? ' card' : ''}`} open={ctx.openIds.has(node.id)}>
      <summary
        onClick={(e) => {
          e.preventDefault()
          ctx.onToggle(node.id)
        }}
      >
        {summary}
      </summary>
      <div className="tree-children">
        {kids.map((k) => (
          <NodeView key={k.id} node={k} ctx={ctx} />
        ))}
        <VenueLinkedItems node={node} ctx={ctx} />
      </div>
    </details>
  )
}

/** For an event group tagged with a venue, show that venue's items (in a
 *  distinct color) so they can be checked off here too. */
function VenueLinkedItems({ node, ctx }: { node: TrainingNode; ctx: NodeContext }) {
  if (!node.venue_ref) return null
  const venue = ctx.byId.get(node.venue_ref)
  if (!venue) return null
  const items = collectItems(venue.id, ctx.childrenByParent).filter((it) =>
    ctx.visibleIds.has(it.id),
  )
  if (items.length === 0) return null
  return (
    <div className="venue-linked">
      <div className="venue-linked-head">From venue · {venue.title}</div>
      {items.map((it) => (
        <ItemRow key={it.id} node={it} ctx={ctx} />
      ))}
    </div>
  )
}

function ItemRow({ node, ctx }: { node: TrainingNode; ctx: NodeContext }) {
  const isGoal = ctx.goalItemIds.has(node.id)
  const locked = ctx.effectiveRetired.has(node.id)
  return (
    <div className={`item-row${locked ? ' item-locked' : ''}`}>
      <div className="item-main">
        {!locked &&
          (ctx.isOwnSheet ? (
            <button
              className={`goal-button${isGoal ? ' goal-active' : ''}`}
              title={isGoal ? 'Remove from goals' : 'Add to goals'}
              onClick={() => ctx.onToggleGoal(node)}
            >
              {isGoal ? '★' : '☆'}
            </button>
          ) : (
            isGoal && (
              <span className="goal-indicator" title="A goal for this employee">
                ★
              </span>
            )
          ))}
        <button className="item-title-button" onClick={() => ctx.onOpenDetail(node)}>
          {node.title}
          <span className="item-info" aria-hidden>
            ⓘ
          </span>
        </button>
        {locked && <span className="muted item-description">· retired</span>}
        {node.note && <span className="muted item-description">{node.note}</span>}
      </div>
      <div className="milestone-chips">
        {node.milestones.map((m) => (
          <MilestoneChip key={m} node={node} milestone={m} ctx={ctx} locked={locked} />
        ))}
      </div>
    </div>
  )
}

function MilestoneChip({
  node,
  milestone,
  ctx,
  locked,
}: {
  node: TrainingNode
  milestone: MilestoneKind
  ctx: NodeContext
  locked?: boolean
}) {
  const itemId = node.id
  const row = ctx.progressByKey.get(`${itemId}:${milestone}`)
  const status = row?.status ?? 'not_started'

  // Students can't request "Introduced" (a trainer marks it). On event items
  // (which track Guided/Supervised) they also can't request the final
  // "Passed Off" — a trainer signs that off. Mirrors migration 0004.
  const isEvent = node.milestones.includes('guided')
  const studentRequestable =
    milestone !== 'introduced' && !(milestone === 'passed_off' && isEvent)

  return (
    <div className={`chip chip-${status}`}>
      <span className="chip-label">{MILESTONE_LABELS[milestone]}</span>
      {status === 'granted' && row?.granted_by && (
        <span className="chip-meta">by {ctx.nameById.get(row.granted_by) ?? 'Unknown'}</span>
      )}
      {status === 'requested' && <span className="chip-meta">requested</span>}
      <div className="chip-actions">
        {!locked && ctx.isOwnSheet && studentRequestable && status === 'not_started' && (
          <button className="chip-button" onClick={() => ctx.onRequest(itemId, milestone)}>
            Request
          </button>
        )}
        {!locked && ctx.isOwnSheet && status === 'requested' && (
          <button className="chip-button" onClick={() => ctx.onCancel(itemId, milestone)}>
            Cancel
          </button>
        )}
        {!locked && ctx.canGrant && status !== 'granted' && (
          <button className="chip-button chip-button-primary" onClick={() => ctx.onGrant(itemId, milestone)}>
            Approve
          </button>
        )}
        {!locked && ctx.canReset && status === 'granted' && (
          <button className="chip-button" onClick={() => ctx.onReset(itemId, milestone)}>
            Reset
          </button>
        )}
      </div>
    </div>
  )
}

function DetailModal({
  node,
  canEdit,
  onSave,
  onClose,
}: {
  node: TrainingNode
  canEdit: boolean
  onSave: (
    nodeId: string,
    details: { description: string; image_url: string | null },
  ) => Promise<void>
  onClose: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [description, setDescription] = useState(node.description)
  const [imageUrl, setImageUrl] = useState(node.image_url ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSave() {
    setSaving(true)
    setError(null)
    try {
      await onSave(node.id, {
        description: description.trim(),
        image_url: imageUrl.trim() === '' ? null : imageUrl.trim(),
      })
      setEditing(false)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>{node.title}</h2>
          <button className="button-secondary" onClick={onClose}>
            Close
          </button>
        </div>

        {!editing && (
          <>
            {node.image_url ? (
              <img className="modal-image" src={node.image_url} alt={node.title} />
            ) : (
              <div className="modal-image-placeholder">No photo yet</div>
            )}
            <p>{node.description || <span className="muted">No explanation added yet.</span>}</p>
            {canEdit && (
              <button className="button-secondary" onClick={() => setEditing(true)}>
                Edit photo & explanation
              </button>
            )}
          </>
        )}

        {editing && (
          <div className="stack">
            <label className="modal-field">
              Photo URL
              <input
                value={imageUrl}
                onChange={(e) => setImageUrl(e.target.value)}
                placeholder="https://…/photo.jpg"
              />
            </label>
            <label className="modal-field">
              Explanation
              <textarea
                rows={4}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="A short explanation of this item."
              />
            </label>
            {error && <p className="error-text">{error}</p>}
            <div className="row-actions">
              <button className="button-primary" onClick={handleSave} disabled={saving}>
                {saving ? 'Saving…' : 'Save'}
              </button>
              <button className="button-secondary" onClick={() => setEditing(false)}>
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
