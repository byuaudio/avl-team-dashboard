import { useEffect, useMemo, useState } from 'react'
import {
  fetchAllAdjustments,
  fetchAllMilestoneProgress,
  fetchAllSemesters,
  fetchCompSettings,
  fetchTeamRoster,
  fetchTrainingTree,
  submitPay,
} from '../../lib/api'
import { computeLoyalty, computePay, computeSoftSkills } from '../../lib/pay'
import type {
  CompSettings,
  EmployeeSemester,
  MilestoneProgress,
  PayAdjustment,
  Profile,
  TrainingNode,
} from '../../lib/types'
import { useAuth } from '../auth/AuthContext'

const money = (n: number) => `$${n.toFixed(2)}`

interface Row {
  id: string
  name: string
  newRate: number
  previous: number
  increase: number
  clearedAt: string | null
}

/** Cross-employee payroll table: computed new rate vs last cleared rate, with
 *  CSV export and (Audio Manager) submit-to-payroll. */
export function PayrollPage() {
  const { canSeePay, isAudioManager } = useAuth()
  const [roster, setRoster] = useState<Profile[] | null>(null)
  const [nodes, setNodes] = useState<TrainingNode[] | null>(null)
  const [settings, setSettings] = useState<CompSettings | null>(null)
  const [progress, setProgress] = useState<MilestoneProgress[] | null>(null)
  const [semesters, setSemesters] = useState<EmployeeSemester[] | null>(null)
  const [adjustments, setAdjustments] = useState<PayAdjustment[] | null>(null)
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
    ])
      .then(([r, n, s, p, sem, adj]) => {
        setRoster(r)
        setNodes(n)
        setSettings(s)
        setProgress(p)
        setSemesters(sem)
        setAdjustments(adj)
        setSelected(new Set(r.filter((x) => x.is_active && !x.archived).map((x) => x.id)))
      })
      .catch((e: Error) => setError(e.message))
  }
  useEffect(() => {
    if (canSeePay) loadAll()
  }, [canSeePay])

  const rows = useMemo<Row[]>(() => {
    if (!roster || !nodes || !settings || !progress || !semesters || !adjustments) return []
    const progByEmp = groupBy(progress, (p) => p.employee_id)
    const semByEmp = groupBy(semesters, (s) => s.employee_id)
    const adjByEmp = groupBy(adjustments, (a) => a.employee_id)
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
          newRate = training.total + adj + loyalty.total + soft.total
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
  }, [roster, nodes, settings, progress, semesters, adjustments])

  if (!canSeePay) return <p className="page-message">Payroll is for Full-Time and Audio Manager.</p>
  if (error) return <p className="error-text">{error}</p>
  if (!roster) return <div className="page-message">Loading…</div>

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
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
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
        the cleared rate and records history. Uncheck anyone you don't want to include.
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
                  <input
                    type="checkbox"
                    checked={selected.has(r.id)}
                    onChange={() => toggle(r.id)}
                  />
                </td>
                <td>{r.name}</td>
                <td>{money(r.newRate)}</td>
                <td className={r.increase > 0 ? 'increase-positive' : undefined}>
                  {money(r.increase)}
                </td>
                <td>{money(r.previous)}</td>
                <td className="muted">{r.clearedAt ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
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
