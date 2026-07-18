import type { TrainingStatus } from '../lib/types'

const STATUS_LABELS: Record<TrainingStatus, string> = {
  not_started: 'Not started',
  passoff_requested: 'Pass-off requested',
  passed_off: 'Passed off',
}

export function StatusBadge({ status }: { status: TrainingStatus }) {
  return <span className={`badge badge-${status}`}>{STATUS_LABELS[status]}</span>
}
