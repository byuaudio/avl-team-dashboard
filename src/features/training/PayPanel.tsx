import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  addAdjustment,
  deleteAdjustment,
  fetchAdjustments,
  fetchCompSettings,
  fetchMilestoneProgressForEmployee,
  fetchSemesters,
  fetchTrainingTree,
  setBaseRate,
  submitPay,
  upsertSemester,
  deleteSemester,
} from '../../lib/api'
import { computeLoyalty, computePay, computeSoftSkills } from '../../lib/pay'
import type {
  CompSettings,
  EmployeeSemester,
  MilestoneProgress,
  PayAdjustment,
  Profile,
  SemesterTerm,
  TrainingNode,
} from '../../lib/types'
import { TERM_LABELS } from '../../lib/types'
import { useAuth } from '../auth/AuthContext'

const money = (n: number) => `$${n.toFixed(2)}`
const pct = (n: number) => `${Math.round(n * 100)}%`
const TERMS: SemesterTerm[] = ['winter', 'summer', 'fall']

/**
 * Full pay breakdown for one employee (Full-Time / Audio Manager). Shows the
 * payroll-cleared rate alongside the live computed tally, with per-semester
 * loyalty & soft-skills, free-form adjustments, and (for the AM) a Submit-to-
 * payroll action. Team-wide metrics live on the Pay Settings page.
 */
export function PayPanel({ employee }: { employee: Profile }) {
  const { canSeePay, isAudioManager } = useAuth()
  const [nodes, setNodes] = useState<TrainingNode[] | null>(null)
  const [progress, setProgress] = useState<MilestoneProgress[] | null>(null)
  const [settings, setSettings] = useState<CompSettings | null>(null)
  const [semesters, setSemesters] = useState<EmployeeSemester[] | null>(null)
  const [adjustments, setAdjustments] = useState<PayAdjustment[] | null>(null)
  const [baseRate, setBaseRateState] = useState(employee.base_rate)
  const [cleared, setCleared] = useState<{ rate: number | null; at: string | null }>({
    rate: employee.submitted_rate,
    at: employee.submitted_at,
  })
  const [error, setError] = useState<string | null>(null)

  const reloadSemesters = useCallback(() => {
    fetchSemesters(employee.id).then(setSemesters).catch((e: Error) => setError(e.message))
  }, [employee.id])
  const reloadAdjustments = useCallback(() => {
    fetchAdjustments(employee.id).then(setAdjustments).catch((e: Error) => setError(e.message))
  }, [employee.id])

  useEffect(() => {
    setBaseRateState(employee.base_rate)
    setCleared({ rate: employee.submitted_rate, at: employee.submitted_at })
  }, [employee.base_rate, employee.submitted_rate, employee.submitted_at])

  useEffect(() => {
    if (!canSeePay) return
    Promise.all([
      fetchTrainingTree(),
      fetchMilestoneProgressForEmployee(employee.id),
      fetchCompSettings(),
      fetchSemesters(employee.id),
      fetchAdjustments(employee.id),
    ])
      .then(([n, p, s, sem, adj]) => {
        setNodes(n)
        setProgress(p)
        setSettings(s)
        setSemesters(sem)
        setAdjustments(adj)
      })
      .catch((e: Error) => setError(e.message))
  }, [canSeePay, employee.id])

  const training = useMemo(
    () => (nodes && progress ? computePay(nodes, progress, baseRate) : null),
    [nodes, progress, baseRate],
  )
  const loyalty = useMemo(
    () => (semesters && settings ? computeLoyalty(semesters, settings) : null),
    [semesters, settings],
  )
  const soft = useMemo(
    () => (semesters && settings ? computeSoftSkills(semesters, settings) : null),
    [semesters, settings],
  )

  if (!canSeePay) return null
  if (employee.role === 'non_audio_student') {
    return (
      <section className="card">
        <h2>Pay</h2>
        <p className="muted">Pay is not based on training for this role.</p>
      </section>
    )
  }
  if (error) return <p className="error-text">{error}</p>
  if (!training || !loyalty || !soft || !settings || !semesters || !adjustments) {
    return <div className="page-message">Calculating pay…</div>
  }

  const adjTotal = adjustments.reduce((a, b) => a + Number(b.amount), 0)
  const trainingEarned = training.total - training.baseRate
  const grand = training.total + adjTotal + loyalty.total + soft.total

  async function submit() {
    setError(null)
    try {
      await submitPay(employee.id, grand)
      setCleared({ rate: grand, at: new Date().toISOString().slice(0, 10) })
    } catch (e) {
      setError((e as Error).message)
    }
  }

  return (
    <details className="card" open>
      <summary className="pay-summary">
        <span className="tree-title">Pay</span>
        <span className="pay-total">{money(grand)}/hr</span>
        <span className="muted">
          cleared: {cleared.rate == null ? '—' : `${money(cleared.rate)}${cleared.at ? ` (${cleared.at})` : ''}`}
        </span>
      </summary>

      <table className="training-table pay-table">
        <tbody>
          <tr>
            <td>Base rate</td>
            <td>
              {isAudioManager ? (
                <EditableRate
                  value={baseRate}
                  onSave={async (v) => {
                    await setBaseRate(employee.id, v)
                    setBaseRateState(v)
                  }}
                />
              ) : (
                money(baseRate)
              )}
            </td>
          </tr>
          <tr>
            <td>Training</td>
            <td>{money(trainingEarned)}</td>
          </tr>
          <tr>
            <td>Loyalty</td>
            <td>{money(loyalty.total)}</td>
          </tr>
          <tr>
            <td>Soft skills</td>
            <td>{money(soft.total)}</td>
          </tr>
          <tr>
            <td>Adjustments</td>
            <td>{money(adjTotal)}</td>
          </tr>
          <tr>
            <td>
              <strong>Computed total</strong>
            </td>
            <td>
              <strong>{money(grand)}/hr</strong>
            </td>
          </tr>
          <tr>
            <td>Cleared by payroll</td>
            <td>
              {cleared.rate == null ? '—' : money(cleared.rate)}
              {cleared.at && <span className="muted"> ({cleared.at})</span>}
              {isAudioManager && (
                <button className="chip-button chip-button-primary" style={{ marginLeft: '0.5rem' }} onClick={submit}>
                  Submit {money(grand)}
                </button>
              )}
            </td>
          </tr>
        </tbody>
      </table>

      {isAudioManager && (
        <Adjustments
          employeeId={employee.id}
          adjustments={adjustments}
          onChanged={reloadAdjustments}
          onError={setError}
        />
      )}

      <SemesterTable
        semesters={semesters}
        loyalty={loyalty}
        soft={soft}
        employeeId={employee.id}
        canManage={canSeePay}
        onChanged={reloadSemesters}
        onError={setError}
      />

      <details>
        <summary className="tree-title">Training by category</summary>
        <table className="training-table pay-table">
          <thead>
            <tr>
              <th>Category</th>
              <th>Done</th>
              <th>Amount</th>
              <th>Earned</th>
            </tr>
          </thead>
          <tbody>
            {training.categories.map((c) => (
              <tr key={c.id}>
                <td>{c.title}</td>
                <td>
                  {c.completed}/{c.active} ({pct(c.pct)})
                </td>
                <td>{money(c.amount)}</td>
                <td>{money(c.earning)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </details>
  )
}

function EditableRate({ value, onSave }: { value: number; onSave: (v: number) => Promise<void> }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(String(value))
  if (!editing) {
    return (
      <>
        {money(value)}{' '}
        <button className="chip-button" onClick={() => { setDraft(String(value)); setEditing(true) }}>
          Edit
        </button>
      </>
    )
  }
  return (
    <>
      <input
        type="number"
        step="0.01"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        style={{ width: '6rem' }}
      />
      <button
        className="chip-button chip-button-primary"
        onClick={async () => {
          const v = Number(draft)
          if (!Number.isNaN(v)) await onSave(v)
          setEditing(false)
        }}
      >
        Save
      </button>
    </>
  )
}

function Adjustments({
  employeeId,
  adjustments,
  onChanged,
  onError,
}: {
  employeeId: string
  adjustments: PayAdjustment[]
  onChanged: () => void
  onError: (m: string) => void
}) {
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')

  async function add() {
    const v = Number(amount)
    if (Number.isNaN(v) || v === 0) return
    try {
      await addAdjustment(employeeId, v, note.trim())
      setAmount('')
      setNote('')
      onChanged()
    } catch (e) {
      onError((e as Error).message)
    }
  }

  return (
    <details open>
      <summary className="tree-title">Adjustments</summary>
      <table className="training-table pay-table">
        <tbody>
          {adjustments.map((a) => (
            <tr key={a.id}>
              <td>{a.note || <span className="muted">(no note)</span>}</td>
              <td>{money(Number(a.amount))}</td>
              <td>
                <button
                  className="chip-button chip-button-danger"
                  onClick={async () => {
                    try {
                      await deleteAdjustment(a.id)
                      onChanged()
                    } catch (e) {
                      onError((e as Error).message)
                    }
                  }}
                >
                  ✕
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="row-actions" style={{ marginTop: '0.4rem' }}>
        <input
          type="number"
          step="0.01"
          placeholder="$ (+/−)"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          style={{ width: '6rem' }}
        />
        <input
          type="text"
          placeholder="Note (e.g. legacy raise for …)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          style={{ flex: '1 1 12rem' }}
        />
        <button className="button-secondary" onClick={add}>
          + Add adjustment
        </button>
      </div>
    </details>
  )
}

function SemesterTable({
  semesters,
  loyalty,
  soft,
  employeeId,
  canManage,
  onChanged,
  onError,
}: {
  semesters: EmployeeSemester[]
  loyalty: ReturnType<typeof computeLoyalty>
  soft: ReturnType<typeof computeSoftSkills>
  employeeId: string
  canManage: boolean
  onChanged: () => void
  onError: (m: string) => void
}) {
  const loyaltyById = new Map(loyalty.perSemester.map((l) => [l.id, l.raise]))
  const softById = new Map(soft.perSemester.map((s) => [s.id, s]))
  const [addYear, setAddYear] = useState('')
  const [addTerm, setAddTerm] = useState<SemesterTerm>('fall')

  async function addSemester() {
    const year = Number(addYear)
    if (!year) return
    try {
      await upsertSemester({
        employee_id: employeeId,
        year,
        term: addTerm,
        maintenance_hours: 0,
        other_hours: 0,
        self_eval_score: null,
        supervisor_score: null,
      })
      setAddYear('')
      onChanged()
    } catch (e) {
      onError((e as Error).message)
    }
  }

  return (
    <details open>
      <summary className="tree-title">Semesters</summary>
      <table className="training-table pay-table">
        <thead>
          <tr>
            <th></th>
            <th className="grp-loyalty" colSpan={3}>
              Loyalty
            </th>
            <th className="grp-soft" colSpan={3}>
              Soft Skills
            </th>
            {canManage && <th></th>}
          </tr>
          <tr>
            <th>Semester</th>
            <th className="grp-loyalty">Maint hrs</th>
            <th className="grp-loyalty">Other hrs</th>
            <th className="grp-loyalty">Raise</th>
            <th className="grp-soft">Self</th>
            <th className="grp-soft">Supervisor</th>
            <th className="grp-soft">Raise</th>
            {canManage && <th></th>}
          </tr>
        </thead>
        <tbody>
          {semesters.map((sem) => (
            <SemesterRow
              key={sem.id}
              sem={sem}
              loyaltyRaise={loyaltyById.get(sem.id) ?? 0}
              soft={softById.get(sem.id)}
              softRaise={softById.get(sem.id)?.raise ?? 0}
              canManage={canManage}
              onChanged={onChanged}
              onError={onError}
            />
          ))}
        </tbody>
      </table>
      {canManage && (
        <div className="row-actions" style={{ marginTop: '0.5rem' }}>
          <input
            type="number"
            placeholder="Year"
            value={addYear}
            onChange={(e) => setAddYear(e.target.value)}
            style={{ width: '5rem' }}
          />
          <select value={addTerm} onChange={(e) => setAddTerm(e.target.value as SemesterTerm)}>
            {TERMS.map((t) => (
              <option key={t} value={t}>
                {TERM_LABELS[t]}
              </option>
            ))}
          </select>
          <button className="button-secondary" onClick={addSemester}>
            + Add semester
          </button>
        </div>
      )}
    </details>
  )
}

function SemesterRow({
  sem,
  loyaltyRaise,
  soft,
  softRaise,
  canManage,
  onChanged,
  onError,
}: {
  sem: EmployeeSemester
  loyaltyRaise: number
  soft: ReturnType<typeof computeSoftSkills>['perSemester'][number] | undefined
  softRaise: number
  canManage: boolean
  onChanged: () => void
  onError: (m: string) => void
}) {
  async function save(patch: Partial<EmployeeSemester>) {
    try {
      await upsertSemester({ ...sem, ...patch })
      onChanged()
    } catch (e) {
      onError((e as Error).message)
    }
  }

  const numCell = (field: keyof EmployeeSemester, cls: string, nullable = false) => {
    const raw = sem[field]
    if (!canManage) return <td className={cls}>{raw == null ? '—' : String(raw)}</td>
    return (
      <td className={cls}>
        <input
          type="number"
          step="0.01"
          defaultValue={raw == null ? '' : String(raw)}
          onBlur={(e) => {
            const t = e.target.value.trim()
            const v = t === '' ? (nullable ? null : 0) : Number(t)
            if (v !== raw) save({ [field]: v } as Partial<EmployeeSemester>)
          }}
          style={{ width: '4.5rem' }}
        />
      </td>
    )
  }

  return (
    <tr>
      <td>
        {TERM_LABELS[sem.term]} {sem.year}
      </td>
      {numCell('maintenance_hours', 'grp-loyalty')}
      {numCell('other_hours', 'grp-loyalty')}
      <td className="grp-loyalty">{money(loyaltyRaise)}</td>
      {numCell('self_eval_score', 'grp-soft', true)}
      {numCell('supervisor_score', 'grp-soft', true)}
      <td className="grp-soft">{soft && soft.supervisorScore == null ? '—' : money(softRaise)}</td>
      {canManage && (
        <td>
          <button
            className="chip-button chip-button-danger"
            onClick={async () => {
              try {
                await deleteSemester(sem.id)
                onChanged()
              } catch (e) {
                onError((e as Error).message)
              }
            }}
          >
            ✕
          </button>
        </td>
      )}
    </tr>
  )
}
