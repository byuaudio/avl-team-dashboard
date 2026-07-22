import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  createTrainingNode,
  deleteTrainingNode,
  fetchTrainingTree,
  renameTrainingNode,
  updateNodeMilestones,
  updateNodePositions,
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
  const { isManager } = useAuth()
  const [nodes, setNodes] = useState<TrainingNode[] | null>(null)
  const [openIds, setOpenIds] = useState<Set<string>>(new Set())
  const [dragId, setDragId] = useState<string | null>(null)
  const [drop, setDrop] = useState<{ id: string; pos: DropPos } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

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
      const label = kind === 'item' ? 'New skill' : `New ${kind}`
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

  if (!isManager) return <p className="page-message">This page is for managers only.</p>
  if (error && !nodes) return <p className="error-text">{error}</p>
  if (!nodes) return <div className="page-message">Loading…</div>

  const roots = childrenByParent.get(ROOT) ?? []

  const ctx: EditorContext = {
    childrenByParent,
    openIds,
    dragId,
    drop,
    onToggle: toggle,
    onRename: rename,
    onChangeMilestones: changeMilestones,
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
      <h1>Edit Training Template</h1>
      <p className="muted">
        Drag the ⠿ handle to reorder or re-nest. Drop on the top/bottom of a row to place it
        before/after; drop on the middle to nest it inside. Click a name to rename.
        {saving ? ' · Saving…' : ''}
      </p>
      {error && <p className="error-text">{error}</p>}
      <section className="card editor-tree">
        {roots.map((node) => (
          <EditorNode key={node.id} node={node} depth={0} ctx={ctx} />
        ))}
        <button className="button-secondary" onClick={() => addChild(null, 'level')}>
          + Add level
        </button>
      </section>
    </div>
  )
}

interface EditorContext {
  childrenByParent: Map<string, TrainingNode[]>
  openIds: Set<string>
  dragId: string | null
  drop: { id: string; pos: DropPos } | null
  onToggle: (id: string) => void
  onRename: (id: string, title: string) => void
  onChangeMilestones: (id: string, m: MilestoneKind[]) => void
  onAddChild: (parentId: string | null, kind: NodeKind) => void
  onRemove: (id: string) => void
  onDragStart: (id: string) => void
  onDragEnd: () => void
  onDragOverRow: (id: string, pos: DropPos) => void
  onDropRow: (id: string, pos: DropPos) => void
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
    if (!ctx.dragId || ctx.dragId === node.id) return
    e.preventDefault()
    const rect = e.currentTarget.getBoundingClientRect()
    const y = e.clientY - rect.top
    const pos: DropPos =
      y < rect.height * 0.3 ? 'before' : y > rect.height * 0.7 ? 'after' : 'inside'
    ctx.onDragOverRow(node.id, pos)
  }

  function saveName() {
    setEditing(false)
    const trimmed = text.trim()
    if (trimmed && trimmed !== node.title) ctx.onRename(node.id, trimmed)
    else setText(node.title)
  }

  const presetKey = node.milestones.join(',')

  return (
    <div className="editor-node">
      <div
        className={`editor-row${dropClass}`}
        style={{ paddingLeft: `${depth * 1.1}rem` }}
        onDragOver={handleDragOver}
        onDrop={(e) => {
          e.preventDefault()
          if (ctx.drop) ctx.onDropRow(node.id, ctx.drop.pos)
        }}
      >
        <span
          className="drag-handle"
          draggable
          onDragStart={() => ctx.onDragStart(node.id)}
          onDragEnd={ctx.onDragEnd}
          title="Drag to move"
        >
          ⠿
        </span>

        {isContainer ? (
          <button className="editor-toggle" onClick={() => ctx.onToggle(node.id)}>
            {isOpen ? '▾' : '▸'}
          </button>
        ) : (
          <span className="editor-toggle-spacer" />
        )}

        {editing ? (
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
        )}

        <span className={`editor-kind kind-${node.kind}`}>{node.kind}</span>

        {node.kind === 'item' && (
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

        <span className="editor-actions">
          {isContainer && (
            <>
              <button
                className="chip-button"
                title="Add a skill inside"
                onClick={() => ctx.onAddChild(node.id, 'item')}
              >
                + skill
              </button>
              <button
                className="chip-button"
                title="Add a sub-group inside"
                onClick={() => ctx.onAddChild(node.id, node.kind === 'level' ? 'category' : 'group')}
              >
                + group
              </button>
            </>
          )}
          <button className="chip-button chip-button-danger" title="Delete" onClick={() => ctx.onRemove(node.id)}>
            ✕
          </button>
        </span>
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
