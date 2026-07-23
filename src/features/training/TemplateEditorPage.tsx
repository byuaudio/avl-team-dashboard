import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  createTrainingNode,
  deleteTrainingNode,
  fetchTrainingTree,
  renameTrainingNode,
  setCategoryAmount,
  updateNodeMilestones,
  updateNodePositions,
  updateNodeRetired,
  updateNodeVenueRef,
} from '../../lib/api'
import type { MilestoneKind, NodeKind, TrainingNode } from '../../lib/types'
import { useAuth } from '../auth/AuthContext'

const ROOT = 'root'

const MILESTONE_PRESETS: { label: string; value: MilestoneKind[] }[] = [
  { label: 'Done (single check)', value: ['passed_off'] },
  { label: 'Introduced → Passed Off', value: ['introduced', 'passed_off'] },
  { label: 'Guided → Supervised', value: ['guided', 'supervised'] },
  { label: 'Submitted → Tested', value: ['submitted', 'tested'] },
]

type DropPos = 'before' | 'after' | 'inside'

/**
 * Manager-only editor for the training template tree. Rename items/groups,
 * add and delete them, change an item's sign-off style, and drag rows to
 * reorder or re-nest. Managers may write training_nodes directly (RLS), so
 * edits persist immediately; the local tree updates optimistically.
 */
export function TemplateEditorPage() {
  const { canEditTemplate, isAudioManager } = useAuth()
  const [nodes, setNodes] = useState<TrainingNode[] | null>(null)
  const [openIds, setOpenIds] = useState<Set<string>>(new Set())
  const [dragId, setDragId] = useState<string | null>(null)
  const [drop, setDrop] = useState<{ id: string; pos: DropPos } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  // Read-only by default so drags/renames can't happen by accident.
  const [editMode, setEditMode] = useState(false)

  useEffect(() => {
    fetchTrainingTree()
      .then(setNodes)
      .catch((e: Error) => setError(e.message))
  }, [])

  const byId = useMemo(() => {
    const m = new Map<string, TrainingNode>()
    for (const n of nodes ?? []) m.set(n.id, n)
    return m
  }, [nodes])

  const childrenByParent = useMemo(() => {
    const m = new Map<string, TrainingNode[]>()
    for (const n of nodes ?? []) {
      const key = n.parent_id ?? ROOT
      const list = m.get(key) ?? []
      list.push(n)
      m.set(key, list)
    }
    for (const list of m.values()) list.sort((a, b) => a.sort_order - b.sort_order)
    return m
  }, [nodes])

  const toggle = useCallback((id: string) => {
    setOpenIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const descendantIds = useCallback(
    (id: string) => {
      const out = new Set<string>()
      const stack = [id]
      while (stack.length) {
        const cur = stack.pop() as string
        for (const child of childrenByParent.get(cur) ?? []) {
          out.add(child.id)
          stack.push(child.id)
        }
      }
      return out
    },
    [childrenByParent],
  )

  const persist = useCallback(
    async (updates: { id: string; parent_id: string | null; sort_order: number }[]) => {
      setSaving(true)
      setError(null)
      try {
        await updateNodePositions(updates)
      } catch (e) {
        setError(`Save failed: ${(e as Error).message}. Reloading…`)
        fetchTrainingTree().then(setNodes).catch(() => undefined)
      } finally {
        setSaving(false)
      }
    },
    [],
  )

  const applyMove = useCallback(
    (moveId: string, targetId: string, pos: DropPos) => {
      if (moveId === targetId) return
      const drag = byId.get(moveId)
      const target = byId.get(targetId)
      if (!drag || !target) return
      const newParent = pos === 'inside' ? targetId : target.parent_id
      // Can't drop a node inside itself or one of its own descendants.
      if (newParent === moveId || descendantIds(moveId).has(newParent ?? '')) {
        setError('Cannot move a section into itself.')
        return
      }
      // Items are leaves — nothing can live inside them.
      if (newParent && byId.get(newParent)?.kind === 'item') {
        setError('Items cannot contain other items.')
        return
      }

      const sibs = (childrenByParent.get(newParent ?? ROOT) ?? []).filter((n) => n.id !== moveId)
      let index: number
      if (pos === 'inside') {
        index = sibs.length
      } else {
        const tIdx = sibs.findIndex((n) => n.id === targetId)
        index = pos === 'before' ? tIdx : tIdx + 1
      }
      sibs.splice(index, 0, drag)

      const updates: { id: string; parent_id: string | null; sort_order: number }[] = sibs.map(
        (n, i) => ({ id: n.id, parent_id: newParent, sort_order: i + 1 }),
      )
      const oldParent = drag.parent_id
      if (oldParent !== newParent) {
        const oldSibs = (childrenByParent.get(oldParent ?? ROOT) ?? []).filter(
          (n) => n.id !== moveId,
        )
        oldSibs.forEach((n, i) => updates.push({ id: n.id, parent_id: oldParent, sort_order: i + 1 }))
      }

      const patch = new Map(updates.map((u) => [u.id, u]))
      setNodes((prev) =>
        (prev ?? []).map((n) => {
          const u = patch.get(n.id)
          return u ? { ...n, parent_id: u.parent_id, sort_order: u.sort_order } : n
        }),
      )
      persist(updates)
    },
    [byId, childrenByParent, descendantIds, persist],
  )

  const addChild = useCallback(
    async (parentId: string | null, kind: NodeKind) => {
      setError(null)
      const sibs = childrenByParent.get(parentId ?? ROOT) ?? []
      const label = kind === 'item' ? 'New item' : `New ${kind}`
      try {
        const created = await createTrainingNode({
          parent_id: parentId,
          kind,
          title: label,
          sort_order: sibs.length + 1,
          milestones: kind === 'item' ? ['introduced', 'passed_off'] : [],
        })
        setNodes((prev) => [...(prev ?? []), created])
        if (parentId) setOpenIds((prev) => new Set(prev).add(parentId))
      } catch (e) {
        setError((e as Error).message)
      }
    },
    [childrenByParent],
  )

  const rename = useCallback((id: string, title: string) => {
    setNodes((prev) => (prev ?? []).map((n) => (n.id === id ? { ...n, title } : n)))
    renameTrainingNode(id, title).catch((e: Error) => setError(e.message))
  }, [])

  const changeMilestones = useCallback((id: string, milestones: MilestoneKind[]) => {
    setNodes((prev) => (prev ?? []).map((n) => (n.id === id ? { ...n, milestones } : n)))
    updateNodeMilestones(id, milestones).catch((e: Error) => setError(e.message))
  }, [])

  const setVenueRef = useCallback((id: string, venueRef: string | null) => {
    setNodes((prev) => (prev ?? []).map((n) => (n.id === id ? { ...n, venue_ref: venueRef } : n)))
    updateNodeVenueRef(id, venueRef).catch((e: Error) => setError(e.message))
  }, [])

  const setAmount = useCallback((id: string, amount: number) => {
    setNodes((prev) => (prev ?? []).map((n) => (n.id === id ? { ...n, dollar_value: amount } : n)))
    setCategoryAmount(id, amount).catch((e: Error) => setError(e.message))
  }, [])

  const setRetired = useCallback((id: string, retired: boolean) => {
    setNodes((prev) => (prev ?? []).map((n) => (n.id === id ? { ...n, retired } : n)))
    updateNodeRetired(id, retired).catch((e: Error) => setError(e.message))
  }, [])

  const remove = useCallback(
    (id: string) => {
      const node = byId.get(id)
      const kids = descendantIds(id)
      const msg =
        kids.size > 0
          ? `Delete "${node?.title}" and everything inside it (${kids.size} sub-items)? This also removes any sign-offs on them.`
          : `Delete "${node?.title}"?`
      if (!window.confirm(msg)) return
      const toRemove = new Set(kids)
      toRemove.add(id)
      setNodes((prev) => (prev ?? []).filter((n) => !toRemove.has(n.id)))
      deleteTrainingNode(id).catch((e: Error) => setError(e.message))
    },
    [byId, descendantIds],
  )

  if (!canEditTemplate)
    return <p className="page-message">This page is for 3/4-time staff and up.</p>
  if (error && !nodes) return <p className="error-text">{error}</p>
  if (!nodes) return <div className="page-message">Loading…</div>

  const roots = childrenByParent.get(ROOT) ?? []

  const ctx: EditorContext = {
    childrenByParent,
    byId,
    openIds,
    dragId,
    drop,
    onToggle: toggle,
    onRename: rename,
    onChangeMilestones: changeMilestones,
    onSetVenueRef: setVenueRef,
    onSetAmount: setAmount,
    onSetRetired: setRetired,
    isAudioManager,
    editMode,
    onAddChild: addChild,
    onRemove: remove,
    onDragStart: setDragId,
    onDragEnd: () => {
      setDragId(null)
      setDrop(null)
    },
    onDragOverRow: (id, pos) => setDrop({ id, pos }),
    onDropRow: (id, pos) => {
      if (dragId) applyMove(dragId, id, pos)
      setDragId(null)
      setDrop(null)
    },
  }

  return (
    <div className="stack">
      <div className="page-head">
        <h1>Edit Training Template</h1>
        <button
          className={editMode ? 'button-primary' : 'button-secondary'}
          onClick={() => setEditMode((v) => !v)}
        >
          {editMode ? '✏️ Editing on — click when done' : '🔒 Enable editing'}
        </button>
      </div>
      <p className="muted">
        {editMode
          ? 'Drag the ⠿ handle to reorder or re-nest (top/bottom of a row = before/after, middle = nest inside). Click a name to rename. Changes save automatically.'
          : 'View-only. Click “Enable editing” to make changes.'}
        {saving ? ' · Saving…' : ''}
      </p>
      {error && <p className="error-text">{error}</p>}
      <section className="card editor-tree">
        {roots.map((node) => (
          <EditorNode key={node.id} node={node} depth={0} ctx={ctx} />
        ))}
        {editMode && (
          <button className="button-secondary" onClick={() => addChild(null, 'level')}>
            + Add level
          </button>
        )}
      </section>
    </div>
  )
}

interface EditorContext {
  childrenByParent: Map<string, TrainingNode[]>
  byId: Map<string, TrainingNode>
  openIds: Set<string>
  dragId: string | null
  drop: { id: string; pos: DropPos } | null
  onToggle: (id: string) => void
  onRename: (id: string, title: string) => void
  onChangeMilestones: (id: string, m: MilestoneKind[]) => void
  onSetVenueRef: (id: string, venueRef: string | null) => void
  onSetAmount: (id: string, amount: number) => void
  onSetRetired: (id: string, retired: boolean) => void
  isAudioManager: boolean
  editMode: boolean
  onAddChild: (parentId: string | null, kind: NodeKind) => void
  onRemove: (id: string) => void
  onDragStart: (id: string) => void
  onDragEnd: () => void
  onDragOverRow: (id: string, pos: DropPos) => void
  onDropRow: (id: string, pos: DropPos) => void
}

/** Editable per-category pay amount ($ at 100%). Saves on blur/Enter. Shows a
 *  read-only 2-decimal value when not in edit mode. */
function CategoryAmount({
  node,
  onSave,
  editMode,
}: {
  node: TrainingNode
  onSave: (v: number) => void
  editMode: boolean
}) {
  const [draft, setDraft] = useState(node.dollar_value == null ? '' : String(node.dollar_value))
  function commit() {
    const v = Number(draft)
    if (!Number.isNaN(v) && v !== (node.dollar_value ?? NaN)) onSave(v)
    if (!Number.isNaN(v)) setDraft(v.toFixed(2))
  }
  if (!editMode) {
    return (
      <span className="editor-amount" title="Pay for this category at 100%">
        {node.dollar_value == null ? '—' : `$${Number(node.dollar_value).toFixed(2)}`}
      </span>
    )
  }
  return (
    <label className="editor-amount" title="Pay for this category at 100%">
      $
      <input
        type="number"
        step="0.01"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
        }}
      />
    </label>
  )
}

/** Title of the nearest ancestor category (walking up the tree). */
function categoryTitleOf(node: TrainingNode, byId: Map<string, TrainingNode>): string | null {
  let pid = node.parent_id
  while (pid) {
    const p = byId.get(pid)
    if (!p) break
    if (p.kind === 'category') return p.title
    pid = p.parent_id
  }
  return null
}

/** Venue groups in the same level's "Venues" category — the tag options. */
function venueGroupsInLevel(
  node: TrainingNode,
  byId: Map<string, TrainingNode>,
  childrenByParent: Map<string, TrainingNode[]>,
): TrainingNode[] {
  let pid = node.parent_id
  let levelId: string | null = null
  while (pid) {
    const p = byId.get(pid)
    if (!p) break
    if (p.kind === 'level') {
      levelId = p.id
      break
    }
    pid = p.parent_id
  }
  if (!levelId) return []
  const venuesCat = (childrenByParent.get(levelId) ?? []).find(
    (c) => c.kind === 'category' && c.title === 'Venues',
  )
  if (!venuesCat) return []
  return (childrenByParent.get(venuesCat.id) ?? []).filter((c) => c.kind === 'group')
}

function EditorNode({ node, depth, ctx }: { node: TrainingNode; depth: number; ctx: EditorContext }) {
  const kids = ctx.childrenByParent.get(node.id) ?? []
  const isContainer = node.kind !== 'item'
  const isOpen = ctx.openIds.has(node.id)
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState(node.title)

  const dropClass =
    ctx.drop && ctx.drop.id === node.id && ctx.dragId && ctx.dragId !== node.id
      ? ` drop-${ctx.drop.pos}`
      : ''

  function handleDragOver(e: React.DragEvent) {
    if (!ctx.editMode || !ctx.dragId || ctx.dragId === node.id) return
    e.preventDefault()
    const rect = e.currentTarget.getBoundingClientRect()
    const y = e.clientY - rect.top
    let pos: DropPos =
      y < rect.height * 0.3 ? 'before' : y > rect.height * 0.7 ? 'after' : 'inside'
    // Items can't contain anything, so never offer "nest inside" an item —
    // that's what made dragged rows disappear.
    if (node.kind === 'item' && pos === 'inside') pos = y < rect.height / 2 ? 'before' : 'after'
    ctx.onDragOverRow(node.id, pos)
  }

  function saveName() {
    setEditing(false)
    const trimmed = text.trim()
    if (trimmed && trimmed !== node.title) ctx.onRename(node.id, trimmed)
    else setText(node.title)
  }

  const presetKey = node.milestones.join(',')
  const isEventGroup = node.kind === 'group' && categoryTitleOf(node, ctx.byId) === 'Events'
  const venueOptions = isEventGroup ? venueGroupsInLevel(node, ctx.byId, ctx.childrenByParent) : []

  return (
    <div className="editor-node">
      <div
        className={`editor-row${dropClass}${node.retired ? ' editor-row-retired' : ''}`}
        style={{ paddingLeft: `${depth * 1.1}rem` }}
        onDragOver={handleDragOver}
        onDrop={(e) => {
          e.preventDefault()
          if (ctx.drop) ctx.onDropRow(node.id, ctx.drop.pos)
        }}
      >
        {ctx.editMode ? (
          <span
            className="drag-handle"
            draggable
            onDragStart={() => ctx.onDragStart(node.id)}
            onDragEnd={ctx.onDragEnd}
            title="Drag to move"
          >
            ⠿
          </span>
        ) : (
          <span className="drag-handle-spacer" />
        )}

        {isContainer ? (
          <button className="editor-toggle" onClick={() => ctx.onToggle(node.id)}>
            {isOpen ? '▾' : '▸'}
          </button>
        ) : (
          <span className="editor-toggle-spacer" />
        )}

        {ctx.editMode ? (
          editing ? (
            <input
              className="editor-name-input"
              value={text}
              autoFocus
              onChange={(e) => setText(e.target.value)}
              onBlur={saveName}
              onKeyDown={(e) => {
                if (e.key === 'Enter') saveName()
                if (e.key === 'Escape') {
                  setText(node.title)
                  setEditing(false)
                }
              }}
            />
          ) : (
            <button className="editor-name" onClick={() => setEditing(true)} title="Click to rename">
              {node.title}
            </button>
          )
        ) : (
          <span className="editor-name">{node.title}</span>
        )}

        <span className={`editor-kind kind-${node.kind}`}>{node.kind}</span>

        {node.kind === 'category' && ctx.isAudioManager && (
          <CategoryAmount node={node} onSave={(v) => ctx.onSetAmount(node.id, v)} editMode={ctx.editMode} />
        )}

        {ctx.editMode && isEventGroup && (
          <select
            className="editor-milestones"
            value={node.venue_ref ?? ''}
            onChange={(e) => ctx.onSetVenueRef(node.id, e.target.value || null)}
            title="Tag a venue whose items show under this event"
          >
            <option value="">venue: none</option>
            {venueOptions.map((v) => (
              <option key={v.id} value={v.id}>
                venue: {v.title}
              </option>
            ))}
          </select>
        )}

        {ctx.editMode && node.kind === 'item' && (
          <select
            className="editor-milestones"
            value={presetKey}
            onChange={(e) => {
              const preset = MILESTONE_PRESETS.find((p) => p.value.join(',') === e.target.value)
              if (preset) ctx.onChangeMilestones(node.id, preset.value)
            }}
          >
            {MILESTONE_PRESETS.map((p) => (
              <option key={p.label} value={p.value.join(',')}>
                {p.label}
              </option>
            ))}
            {!MILESTONE_PRESETS.some((p) => p.value.join(',') === presetKey) && (
              <option value={presetKey}>{presetKey || '(none)'}</option>
            )}
          </select>
        )}

        {ctx.editMode && (
          <span className="editor-actions">
            {isContainer && (
              <>
                <button
                  className="chip-button"
                  title="Add an item inside"
                  onClick={() => ctx.onAddChild(node.id, 'item')}
                >
                  + item
                </button>
                <button
                  className="chip-button"
                  title="Add a sub-group inside"
                  onClick={() =>
                    ctx.onAddChild(node.id, node.kind === 'level' ? 'category' : 'group')
                  }
                >
                  + group
                </button>
              </>
            )}
            <button
              className="chip-button"
              title={
                node.retired ? 'Un-retire (make active again)' : 'Retire (keeps paying, hides/locks)'
              }
              onClick={() => ctx.onSetRetired(node.id, !node.retired)}
            >
              {node.retired ? 'Un-retire' : 'Retire'}
            </button>
            <button
              className="chip-button chip-button-danger"
              title="Delete"
              onClick={() => ctx.onRemove(node.id)}
            >
              ✕
            </button>
          </span>
        )}
      </div>

      {isContainer && isOpen && (
        <div className="editor-children">
          {kids.map((k) => (
            <EditorNode key={k.id} node={k} depth={depth + 1} ctx={ctx} />
          ))}
        </div>
      )}
    </div>
  )
}
