import { useEffect, useMemo, useState } from 'react'
import {
  addPolicyItem,
  deletePolicyItem,
  fetchAllAdjustments,
  fetchAllMilestoneProgress,
  fetchAllPenalties,
  fetchAllSemesters,
  fetchAllStars,
  fetchCompSettings,
  fetchPolicyItems,
  fetchTeamRoster,
  fetchTrainingTree,
  submitPay,
  updateCompSettings,
  updatePolicyItem,
} from '../../lib/api'
import { computeLoyalty, computePay, computeSoftSkills, penaltyPay, performancePay } from '../../lib/pay'
import type {
  CompSettings,
  EmployeeSemester,
  MilestoneProgress,
  PayAdjustment,
  PerformanceStar,
  PolicyItem,
  PolicyPenalty,
  Profile,
  TrainingNode,
} from '../../lib/types'
import { useAuth } from '../auth/AuthContext'

const money = (n: number) => `$${n.toFixed(2)}`

const SETTING_FIELDS: { key: keyof CompSettings; label: string }[] = [
  { key: 'expected_maintenance_hours', label: 'Expected maintenance hrs / semester' },
  { key: 'expected_other_hours', label: 'Expected other hrs / semester' },
  { key: 'weight_maintenance', label: 'Maintenance weight (0.6 = 60%)' },
  { key: 'weight_other', label: 'Other weight (0.4 = 40%)' },
  { key: 'loyalty_avg_value', label: 'Loyalty value at expectations ($)' },
  { key: 'soft_benchmark', label: 'Soft-skills benchmark score' },
  { key: 'soft_bench_raise', label: 'Raise at benchmark ($)' },
  { key: 'soft_max', label: 'Soft-skills max score' },
  { key: 'soft_additional_at_max', label: 'Additional raise at max ($)' },
  { key: 'star_value', label: 'Value per performance star ($)' },
  { key: 'penalty_per_offense', label: 'Penalty per offense ($)' },
]

interface Row {
  id: string
  name: string
  newRate: number
  previous: number
  increase: number
  clearedAt: string | null
}

export function PayrollPage() {
  const { canSeePay, isAudioManager } = useAuth()
  const [roster, setRoster] = useState<Profile[] | null>(null)
  const [nodes, setNodes] = useState<TrainingNode[] | null>(null)
  const [settings, setSettings] = useState<CompSettings | null>(null)
  const [progress, setProgress] = useState<MilestoneProgress[]>([])
  const [semesters, setSemesters] = useState<EmployeeSemester[]>([])
  const [adjustments, setAdjustments] = useState<PayAdjustment[]>([])
  const [stars, setStars] = useState<PerformanceStar[]>([])
  const [penalties, setPenalties] = useState<PolicyPenalty[]>([])
  const [policyItems, setPolicyItems] = useState<PolicyItem[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  function loadAll() {
    Promise.all([
      fetchTeamRoster(),
      fetchTrainingTree(),
      fetchCompSettings(),
      fetchAllMilestoneProgress(),
      fetchAllSemesters(),
      fetchAllAdjustments(),
      fetchAllStars(),
      fetchAllPenalties(),
      fetchPolicyItems(),
    ])
      .then(([r, n, s, p, sem, adj, st, pen, pi]) => {
        setRoster(r)
        setNodes(n)
        setSettings(s)
        setProgress(p)
        setSemesters(sem)
        setAdjustments(adj)
        setStars(st)
        setPenalties(pen)
        setPolicyItems(pi)
        setSelected(new Set(r.filter((x) => x.is_active && !x.archived).map((x) => x.id)))
      })
      .catch((e: Error) => setError(e.message))
  }
  useEffect(() => {
    if (canSeePay) loadAll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canSeePay])

  const rows = useMemo<Row[]>(() => {
    if (!roster || !nodes || !settings) return []
    const progByEmp = groupBy(progress, (p) => p.employee_id)
    const semByEmp = groupBy(semesters, (s) => s.employee_id)
    const adjByEmp = groupBy(adjustments, (a) => a.employee_id)
    const starByEmp = groupBy(stars, (s) => s.employee_id)
    const penByEmp = groupBy(penalties, (p) => p.employee_id)
    return roster
      .filter((e) => e.is_active && !e.archived)
      .map((e) => {
        const adj = (adjByEmp.get(e.id) ?? []).reduce((a, b) => a + Number(b.amount), 0)
        let newRate: number
        if (e.role === 'non_audio_student') {
          newRate = e.base_rate + adj
        } else {
          const training = computePay(nodes, progByEmp.get(e.id) ?? [], e.base_rate)
          const loyalty = computeLoyalty(semByEmp.get(e.id) ?? [], settings)
          const soft = computeSoftSkills(semByEmp.get(e.id) ?? [], settings)
          const awarded = (starByEmp.get(e.id) ?? []).filter((s) => s.status === 'awarded').length
          const perf = performancePay(awarded, settings.star_value)
          const pen = penaltyPay((penByEmp.get(e.id) ?? []).length, settings.penalty_per_offense)
          newRate = training.total + adj + loyalty.total + soft.total + perf + pen
        }
        const previous = e.submitted_rate ?? e.base_rate
        return {
          id: e.id,
          name: e.full_name,
          newRate,
          previous,
          increase: newRate - previous,
          clearedAt: e.submitted_at,
        }
      })
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [roster, nodes, settings, progress, semesters, adjustments, stars, penalties])

  if (!canSeePay) return <p className="page-message">Payroll is for Full-Time and Audio Manager.</p>
  if (error) return <p className="error-text">{error}</p>
  if (!roster || !settings) return <div className="page-message">Loading…</div>

  const chosen = rows.filter((r) => selected.has(r.id))

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function exportCsv() {
    const header = ['Student', 'New Rate', 'Increase', 'Previous Rate']
    const lines = chosen.map((r) => [
      r.name,
      r.newRate.toFixed(2),
      r.increase.toFixed(2),
      r.previous.toFixed(2),
    ])
    const csv = [header, ...lines]
      .map((cols) => cols.map((c) => (/[",\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(','))
      .join('\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `payroll-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  async function submitSelected() {
    if (!isAudioManager) return
    if (!window.confirm(`Submit ${chosen.length} rate(s) to payroll? This records them as cleared.`))
      return
    setBusy(true)
    setError(null)
    try {
      for (const r of chosen) await submitPay(r.id, r.newRate)
      loadAll()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="stack">
      <div className="page-head">
        <h1>Payroll</h1>
        <div className="row-actions">
          <button className="button-secondary" onClick={exportCsv} disabled={chosen.length === 0}>
            Export CSV ({chosen.length})
          </button>
          {isAudioManager && (
            <button className="button-primary" onClick={submitSelected} disabled={busy || chosen.length === 0}>
              {busy ? 'Submitting…' : `Submit ${chosen.length} to payroll`}
            </button>
          )}
        </div>
      </div>
      <p className="muted">
        New Rate = the live computed tally. Increase = New − Previous (last cleared). Submitting sets
        the cleared rate and records history. Uncheck anyone to exclude them.
      </p>
      <section className="card">
        <table className="training-table">
          <thead>
            <tr>
              <th></th>
              <th>Student</th>
              <th>New Rate</th>
              <th>Increase</th>
              <th>Previous Rate</th>
              <th>Cleared</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>
                  <input type="checkbox" checked={selected.has(r.id)} onChange={() => toggle(r.id)} />
                </td>
                <td>{r.name}</td>
                <td>{money(r.newRate)}</td>
                <td className={r.increase > 0 ? 'increase-positive' : undefined}>{money(r.increase)}</td>
                <td>{money(r.previous)}</td>
                <td className="muted">{r.clearedAt ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {isAudioManager && (
        <>
          <PaySettings settings={settings} onSaved={setSettings} onError={setError} />
          <PolicyItemsEditor
            items={policyItems}
            onChanged={loadAll}
            onError={setError}
          />
        </>
      )}
    </div>
  )
}

function PaySettings({
  settings,
  onSaved,
  onError,
}: {
  settings: CompSettings
  onSaved: (s: CompSettings) => void
  onError: (m: string) => void
}) {
  const [draft, setDraft] = useState(settings)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  async function save() {
    setSaving(true)
    setSaved(false)
    try {
      await updateCompSettings(draft)
      onSaved(draft)
      setSaved(true)
    } catch (e) {
      onError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <details className="card">
      <summary className="tree-title">Pay settings (team-wide)</summary>
      <div className="settings-grid">
        {SETTING_FIELDS.map((f) => (
          <label key={f.key} className="modal-field">
            {f.label}
            <input
              type="number"
              step="0.01"
              value={String(draft[f.key])}
              onChange={(e) => setDraft({ ...draft, [f.key]: Number(e.target.value) })}
            />
          </label>
        ))}
      </div>
      {saved && <p className="success-text">Saved.</p>}
      <button className="button-primary" onClick={save} disabled={saving}>
        {saving ? 'Saving…' : 'Save settings'}
      </button>
    </details>
  )
}

function PolicyItemsEditor({
  items,
  onChanged,
  onError,
}: {
  items: PolicyItem[]
  onChanged: () => void
  onError: (m: string) => void
}) {
  async function run(fn: () => Promise<void>) {
    try {
      await fn()
      onChanged()
    } catch (e) {
      onError((e as Error).message)
    }
  }
  return (
    <details className="card">
      <summary className="tree-title">Audio crew policy line items</summary>
      <PolicyGroup kind="offense" title="Offenses (penalize pay)" items={items} run={run} />
      <PolicyGroup kind="termination" title="Termination reasons (display only)" items={items} run={run} />
    </details>
  )
}

function PolicyGroup({
  kind,
  title,
  items,
  run,
}: {
  kind: 'offense' | 'termination'
  title: string
  items: PolicyItem[]
  run: (fn: () => Promise<void>) => void
}) {
  const [newLabel, setNewLabel] = useState('')
  const list = items.filter((i) => i.kind === kind)
  return (
    <div className="stack" style={{ marginTop: '0.75rem' }}>
      <h3>{title}</h3>
      {list.map((i) => (
        <div key={i.id} className="row-actions">
          <input
            defaultValue={i.label}
            onBlur={(e) => {
              const v = e.target.value.trim()
              if (v && v !== i.label) run(() => updatePolicyItem(i.id, v))
            }}
            style={{ flex: '1 1 20rem' }}
          />
          <button className="chip-button chip-button-danger" onClick={() => run(() => deletePolicyItem(i.id))}>
            ✕
          </button>
        </div>
      ))}
      <div className="row-actions">
        <input
          placeholder={`New ${kind}…`}
          value={newLabel}
          onChange={(e) => setNewLabel(e.target.value)}
          style={{ flex: '1 1 20rem' }}
        />
        <button
          className="button-secondary"
          onClick={() => {
            const v = newLabel.trim()
            if (v) {
              run(() => addPolicyItem(kind, v))
              setNewLabel('')
            }
          }}
        >
          + Add
        </button>
      </div>
    </div>
  )
}

function groupBy<T>(items: T[], key: (t: T) => string): Map<string, T[]> {
  const m = new Map<string, T[]>()
  for (const item of items) {
    const k = key(item)
    const list = m.get(k) ?? []
    list.push(item)
    m.set(k, list)
  }
  return m
}
