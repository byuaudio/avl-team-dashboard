import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  fetchCompSettings,
  fetchMilestoneProgressForEmployee,
  fetchSemesters,
  fetchTrainingTree,
  setBaseRate,
  setPriorSemesters,
  updateCompSettings,
  upsertSemester,
  deleteSemester,
} from '../../lib/api'
import { computeLoyalty, computePay, computeSoftSkills } from '../../lib/pay'
import type {
  CompSettings,
  EmployeeSemester,
  MilestoneProgress,
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
 * Full pay breakdown for one employee (visible to Full-Time / Audio Manager):
 * base + prior-semester credit + training + loyalty + soft-skills. Full-time+
 * can enter semester hours/scores; the Audio Manager edits the base rate, prior
 * semester count, and team-wide metrics.
 */
export function PayPanel({ employee }: { employee: Profile }) {
  const { canSeePay, isAudioManager } = useAuth()
  const [nodes, setNodes] = useState<TrainingNode[] | null>(null)
  const [progress, setProgress] = useState<MilestoneProgress[] | null>(null)
  const [settings, setSettings] = useState<CompSettings | null>(null)
  const [semesters, setSemesters] = useState<EmployeeSemester[] | null>(null)
  const [baseRate, setBaseRateState] = useState(employee.base_rate)
  const [prior, setPrior] = useState(employee.prior_semesters)
  const [error, setError] = useState<string | null>(null)

  const reloadSemesters = useCallback(() => {
    fetchSemesters(employee.id).then(setSemesters).catch((e: Error) => setError(e.message))
  }, [employee.id])

  useEffect(() => {
    setBaseRateState(employee.base_rate)
    setPrior(employee.prior_semesters)
  }, [employee.base_rate, employee.prior_semesters])

  useEffect(() => {
    if (!canSeePay) return
    Promise.all([
      fetchTrainingTree(),
      fetchMilestoneProgressForEmployee(employee.id),
      fetchCompSettings(),
      fetchSemesters(employee.id),
    ])
      .then(([n, p, s, sem]) => {
        setNodes(n)
        setProgress(p)
        setSettings(s)
        setSemesters(sem)
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
  if (!training || !loyalty || !soft || !settings || !semesters) {
    return <div className="page-message">Calculating pay…</div>
  }

  const priorCredit = prior * settings.prior_semester_value
  const trainingEarned = training.total - training.baseRate
  const grand = training.total + priorCredit + loyalty.total + soft.total

  return (
    <details className="card">
      <summary className="pay-summary">
        <span className="tree-title">Pay</span>
        <span className="pay-total">{money(grand)}/hr</span>
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
            <td>
              Prior semesters{' '}
              {isAudioManager ? (
                <EditableInt
                  value={prior}
                  onSave={async (v) => {
                    await setPriorSemesters(employee.id, v)
                    setPrior(v)
                  }}
                />
              ) : (
                <>× {prior}</>
              )}{' '}
              × {money(settings.prior_semester_value)}
            </td>
            <td>{money(priorCredit)}</td>
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
            <td>
              <strong>Total rate</strong>
            </td>
            <td>
              <strong>{money(grand)}/hr</strong>
            </td>
          </tr>
        </tbody>
      </table>

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

      <SemesterTable
        semesters={semesters}
        loyalty={loyalty}
        soft={soft}
        employeeId={employee.id}
        canManage={canSeePay}
        onChanged={reloadSemesters}
        onError={setError}
      />

      {isAudioManager && (
        <CompSettingsForm settings={settings} onSaved={(s) => setSettings(s)} onError={setError} />
      )}
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

function EditableInt({ value, onSave }: { value: number; onSave: (v: number) => Promise<void> }) {
  const [draft, setDraft] = useState(String(value))
  return (
    <>
      ×
      <input
        type="number"
        min="0"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={async () => {
          const v = Math.max(0, Math.floor(Number(draft) || 0))
          if (v !== value) await onSave(v)
        }}
        style={{ width: '3.5rem' }}
      />
    </>
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
  const softById = new Map(soft.perSemester.map((s) => [s.id, s.raise]))
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
            <th>Semester</th>
            <th>Maint hrs</th>
            <th>Other hrs</th>
            <th>Self</th>
            <th>Supervisor</th>
            <th>Loyalty</th>
            <th>Soft</th>
            {canManage && <th></th>}
          </tr>
        </thead>
        <tbody>
          {semesters.map((sem) => (
            <SemesterRow
              key={sem.id}
              sem={sem}
              loyalty={loyaltyById.get(sem.id) ?? 0}
              soft={soft.perSemester.find((s) => s.id === sem.id)}
              softRaise={softById.get(sem.id) ?? 0}
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
  loyalty,
  soft,
  softRaise,
  canManage,
  onChanged,
  onError,
}: {
  sem: EmployeeSemester
  loyalty: number
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

  const numCell = (field: keyof EmployeeSemester, nullable = false) => {
    const raw = sem[field]
    if (!canManage) return raw == null ? '—' : String(raw)
    return (
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
    )
  }

  return (
    <tr>
      <td>
        {TERM_LABELS[sem.term]} {sem.year}
      </td>
      <td>{numCell('maintenance_hours')}</td>
      <td>{numCell('other_hours')}</td>
      <td>{numCell('self_eval_score', true)}</td>
      <td>{numCell('supervisor_score', true)}</td>
      <td>{money(loyalty)}</td>
      <td>{soft && soft.supervisorScore == null ? '—' : money(softRaise)}</td>
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

const SETTING_FIELDS: { key: keyof CompSettings; label: string }[] = [
  { key: 'expected_maintenance_hours', label: 'Expected maintenance hrs' },
  { key: 'expected_other_hours', label: 'Expected other hrs' },
  { key: 'weight_maintenance', label: 'Maintenance weight (0.6 = 60%)' },
  { key: 'weight_other', label: 'Other weight (0.4 = 40%)' },
  { key: 'loyalty_avg_value', label: 'Loyalty avg value ($)' },
  { key: 'soft_benchmark', label: 'Soft-skills benchmark score' },
  { key: 'soft_bench_raise', label: 'Raise at benchmark ($)' },
  { key: 'soft_max', label: 'Soft-skills max score' },
  { key: 'soft_additional_at_max', label: 'Additional raise at max ($)' },
  { key: 'prior_semester_value', label: 'Prior-semester value ($ each)' },
]

function CompSettingsForm({
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

  async function save() {
    setSaving(true)
    try {
      await updateCompSettings(draft)
      onSaved(draft)
    } catch (e) {
      onError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <details className="member-form">
      <summary>Pay settings (team-wide)</summary>
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
      <button className="button-primary" onClick={save} disabled={saving}>
        {saving ? 'Saving…' : 'Save settings'}
      </button>
    </details>
  )
}
