import { MILESTONE_STATE_LABELS, MILESTONE_STATE_COLORS, AGREEMENT_STATE_LABELS, AGREEMENT_STATE_COLORS } from '@/contract'

export function MilestoneStateBadge({ state }: { state: number }) {
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold tracking-wide border ${MILESTONE_STATE_COLORS[state] ?? 'text-slate-400 border-slate-400/20'}`}>
      <span className="w-1.5 h-1.5 rounded-full bg-current" />
      {MILESTONE_STATE_LABELS[state] ?? 'Unknown'}
    </span>
  )
}

export function AgreementStateBadge({ state }: { state: number }) {
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold tracking-wide border ${AGREEMENT_STATE_COLORS[state] ?? 'text-slate-400 border-slate-400/20'}`}>
      <span className="w-1.5 h-1.5 rounded-full bg-current" />
      {AGREEMENT_STATE_LABELS[state] ?? 'Unknown'}
    </span>
  )
}
