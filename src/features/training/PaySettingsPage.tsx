import { useEffect, useState } from 'react'
import { fetchCompSettings, updateCompSettings } from '../../lib/api'
import type { CompSettings } from '../../lib/types'
import { useAuth } from '../auth/AuthContext'

const SETTING_FIELDS: { key: keyof CompSettings; label: string }[] = [
  { key: 'expected_maintenance_hours', label: 'Expected maintenance hrs / semester' },
  { key: 'expected_other_hours', label: 'Expected other hrs / semester' },
  { key: 'weight_maintenance', label: 'Maintenance weight (0.6 = 60%)' },
  { key: 'weight_other', label: 'Other weight (0.4 = 40%)' },
  { key: 'loyalty_avg_value', label: 'Loyalty value for meeting expectations ($)' },
  { key: 'soft_benchmark', label: 'Soft-skills benchmark score' },
  { key: 'soft_bench_raise', label: 'Raise at benchmark ($)' },
  { key: 'soft_max', label: 'Soft-skills max score' },
  { key: 'soft_additional_at_max', label: 'Additional raise at max score ($)' },
]

/** Audio-Manager-only page for the team-wide pay metrics. */
export function PaySettingsPage() {
  const { isAudioManager } = useAuth()
  const [draft, setDraft] = useState<CompSettings | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    fetchCompSettings()
      .then(setDraft)
      .catch((e: Error) => setError(e.message))
  }, [])

  if (!isAudioManager)
    return <p className="page-message">Pay settings are for the Audio Manager only.</p>
  if (error) return <p className="error-text">{error}</p>
  if (!draft) return <div className="page-message">Loading…</div>

  async function save() {
    if (!draft) return
    setSaving(true)
    setError(null)
    setSaved(false)
    try {
      await updateCompSettings(draft)
      setSaved(true)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="stack">
      <h1>Pay Settings</h1>
      <p className="muted">Team-wide metrics used to calculate loyalty and soft-skills pay.</p>
      <section className="card">
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
        {error && <p className="error-text">{error}</p>}
        {saved && <p className="success-text">Saved.</p>}
        <button className="button-primary" onClick={save} disabled={saving}>
          {saving ? 'Saving…' : 'Save settings'}
        </button>
      </section>
    </div>
  )
}
