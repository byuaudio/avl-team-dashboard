import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  cancelPassoffRequest,
  fetchProgressForEmployee,
  fetchTeamRoster,
  fetchTrainingTemplate,
  grantPassoff,
  requestPassoff,
  resetPassoff,
  type TrainingTemplate,
} from '../../lib/api'
import type { Profile, TrainingItem, TrainingProgress } from '../../lib/types'
import { StatusBadge } from '../../components/StatusBadge'
import { useAuth } from '../auth/AuthContext'

interface TrainingSheetProps {
  employeeId: string
}

/**
 * Renders one employee's full training sheet, grouped by section.
 * Available actions depend on who is looking:
 *   - the employee themself: request / cancel a pass-off
 *   - a trainer or manager viewing someone else: grant a pass-off
 *   - a manager viewing someone else: also reset a pass-off
 * The database enforces these rules independently; the UI just mirrors them.
 */
export function TrainingSheet({ employeeId }: TrainingSheetProps) {
  const { profile, canGrantPassoffs, isManager } = useAuth()
  const [template, setTemplate] = useState<TrainingTemplate | null>(null)
  const [progress, setProgress] = useState<TrainingProgress[] | null>(null)
  const [roster, setRoster] = useState<Profile[]>([])
  const [error, setError] = useState<string | null>(null)

  const isOwnSheet = profile?.id === employeeId

  const loadProgress = useCallback(async () => {
    setProgress(await fetchProgressForEmployee(employeeId))
  }, [employeeId])

  useEffect(() => {
    setTemplate(null)
    setProgress(null)
    Promise.all([fetchTrainingTemplate(), fetchTeamRoster()])
      .then(([loadedTemplate, loadedRoster]) => {
        setTemplate(loadedTemplate)
        setRoster(loadedRoster)
        return loadProgress()
      })
      .catch((loadError: Error) => setError(loadError.message))
  }, [employeeId, loadProgress])

  const progressByItem = useMemo(() => {
    const map = new Map<string, TrainingProgress>()
    for (const row of progress ?? []) map.set(row.item_id, row)
    return map
  }, [progress])

  const nameById = useMemo(() => {
    const map = new Map<string, string>()
    for (const person of roster) map.set(person.id, person.full_name)
    return map
  }, [roster])

  async function runAction(action: () => Promise<void>) {
    setError(null)
    try {
      await action()
      await loadProgress()
    } catch (actionError) {
      setError((actionError as Error).message)
    }
  }

  if (error && !template) return <p className="error-text">{error}</p>
  if (!template || !progress) return <div className="page-message">Loading…</div>

  const totalItems = template.items.length
  const passedCount = template.items.filter(
    (item) => progressByItem.get(item.id)?.status === 'passed_off',
  ).length

  return (
    <div className="stack">
      <p className="muted">
        {passedCount} of {totalItems} items passed off
      </p>
      {error && <p className="error-text">{error}</p>}
      {template.sections.map((section) => {
        const sectionItems = template.items.filter((item) => item.section_id === section.id)
        if (sectionItems.length === 0) return null
        return (
          <section key={section.id} className="card">
            <h2>{section.title}</h2>
            <table className="training-table">
              <tbody>
                {sectionItems.map((item) => (
                  <TrainingRow
                    key={item.id}
                    item={item}
                    row={progressByItem.get(item.id)}
                    isOwnSheet={isOwnSheet}
                    canGrant={canGrantPassoffs && !isOwnSheet}
                    canReset={isManager && !isOwnSheet}
                    passedOffByName={(id) => nameById.get(id) ?? 'Unknown'}
                    onRequest={() => runAction(() => requestPassoff(item.id))}
                    onCancel={() => runAction(() => cancelPassoffRequest(item.id))}
                    onGrant={(notes) => runAction(() => grantPassoff(employeeId, item.id, notes))}
                    onReset={() => runAction(() => resetPassoff(employeeId, item.id))}
                  />
                ))}
              </tbody>
            </table>
          </section>
        )
      })}
    </div>
  )
}

interface TrainingRowProps {
  item: TrainingItem
  row: TrainingProgress | undefined
  isOwnSheet: boolean
  canGrant: boolean
  canReset: boolean
  passedOffByName: (id: string) => string
  onRequest: () => void
  onCancel: () => void
  onGrant: (notes?: string) => void
  onReset: () => void
}

function TrainingRow(props: TrainingRowProps) {
  const { item, row, isOwnSheet, canGrant, canReset } = props
  const status = row?.status ?? 'not_started'

  function handleGrant() {
    const notes = window.prompt('Optional note for this pass-off (leave blank for none):')
    if (notes === null) return // trainer hit Cancel
    props.onGrant(notes.trim() === '' ? undefined : notes.trim())
  }

  return (
    <tr>
      <td>
        <div className="item-title">{item.title}</div>
        {item.description && <div className="muted item-description">{item.description}</div>}
      </td>
      <td>
        <StatusBadge status={status} />
        {status === 'passed_off' && row?.passed_off_by && (
          <div className="muted item-description">
            by {props.passedOffByName(row.passed_off_by)}
            {row.passed_off_at && ` on ${new Date(row.passed_off_at).toLocaleDateString()}`}
            {row.notes && ` — ${row.notes}`}
          </div>
        )}
      </td>
      <td className="row-actions">
        {isOwnSheet && status === 'not_started' && (
          <button className="button-secondary" onClick={props.onRequest}>
            Request pass-off
          </button>
        )}
        {isOwnSheet && status === 'passoff_requested' && (
          <button className="button-secondary" onClick={props.onCancel}>
            Cancel request
          </button>
        )}
        {canGrant && status !== 'passed_off' && (
          <button className="button-primary" onClick={handleGrant}>
            Pass off
          </button>
        )}
        {canReset && status === 'passed_off' && (
          <button className="button-secondary" onClick={props.onReset}>
            Reset
          </button>
        )}
      </td>
    </tr>
  )
}
