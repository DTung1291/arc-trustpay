import { useMemo, useState } from 'react'
import { useAccount } from 'wagmi'
import { motion } from 'framer-motion'
import {
  Plus, Briefcase, TrendingUp, Clock, CheckCircle2,
  FileText, RefreshCw, AlertTriangle, ArrowRight,
} from 'lucide-react'
import {
  useAgreementsByClient, useAgreementsByFreelancer,
  useMultipleAgreements, usePendingWithdrawal,
} from '@/hooks/useEscrow'
import { formatUsdcDisplay, formatAddress, timeAgo } from '@/utils/format'
import { AgreementState, MilestoneState } from '@/contract'
import { AgreementStateBadge, MilestoneStateBadge } from './ui/StatusBadge'
import { TxButton } from './ui/TxButton'
import { GlassCard } from './ui/GlassCard'
import { EmptyState } from './ui/EmptyState'
import { RollingNumber } from './ui/RollingNumber'

interface Props {
  onCreateAgreement: () => void
  onViewAgreement: (id: bigint) => void
}

type ViewMode = 'client' | 'freelancer'

export function Dashboard({ onCreateAgreement, onViewAgreement }: Props) {
  const { address } = useAccount()
  const [viewMode, setViewMode] = useState<ViewMode>('client')

  const { data: clientIds = [], refetch: refetchClient } = useAgreementsByClient(address)
  const { data: freelancerIds = [], refetch: refetchFreelancer } = useAgreementsByFreelancer(address)
  const { data: pendingWithdrawalRaw } = usePendingWithdrawal(address)
  const pendingWithdrawal = pendingWithdrawalRaw as bigint | undefined

  const ids = viewMode === 'client' ? (clientIds as bigint[]) : (freelancerIds as bigint[])
  const { data: agreementsRaw, isLoading } = useMultipleAgreements(ids)

  const agreements = useMemo(() => {
    if (!agreementsRaw) return []
    return agreementsRaw
      .map((r, i) => ({ id: ids[i], data: r.result as Record<string, unknown> }))
      .filter((r) => !!r.data)
  }, [agreementsRaw, ids])

  const stats = useMemo(() => {
    type AE = { id: bigint; data: Record<string, unknown> }
    const active = agreements.filter((a: AE) => (a.data.state as number) === AgreementState.ACTIVE)
    const completed = agreements.filter((a: AE) => (a.data.state as number) === AgreementState.COMPLETED)
    const totalLocked = active.reduce((s: bigint, a: AE) => s + (a.data.totalAmount as bigint), 0n)
    const pendingApproval = agreements.reduce((count: number, a: AE) => {
      if ((a.data.state as number) !== AgreementState.ACTIVE) return count
      return count + (a.data.milestones as { state: number }[]).filter((m) => m.state === MilestoneState.SUBMITTED).length
    }, 0)
    const disputes = agreements.reduce((count: number, a: AE) => {
      return count + (a.data.milestones as { state: number }[]).filter((m) => m.state === MilestoneState.DISPUTED).length
    }, 0)
    return { active: active.length, completed: completed.length, totalLocked, pendingApproval, disputes }
  }, [agreements])

  const totalLockedNum = parseFloat(formatUsdcDisplay(stats.totalLocked).replace(/,/g, ''))

  const refetch = () => {
    void refetchClient()
    void refetchFreelancer()
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-10">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4 mb-8">
        <div>
          <h1 className="display text-3xl font-bold text-white" style={{ letterSpacing: '-0.02em' }}>
            Dashboard
          </h1>
          {address && (
            <p className="text-slate-500 text-sm mt-1 mono">{formatAddress(address)}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={refetch}
            className="w-9 h-9 rounded-lg bg-white/[0.05] border border-white/[0.08] flex items-center justify-center text-slate-500 hover:text-slate-300 hover:bg-white/[0.09] transition-all"
            title="Refresh"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          <TxButton onClick={onCreateAgreement} size="sm">
            <Plus className="w-4 h-4" />
            New Agreement
          </TxButton>
        </div>
      </div>

      {/* Pending withdrawal banner */}
      {pendingWithdrawal !== undefined && pendingWithdrawal > 0n && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6 rounded-xl border border-emerald-500/30 bg-emerald-500/5 px-5 py-4 flex items-center justify-between gap-4"
        >
          <div>
            <div className="text-emerald-300 font-semibold text-sm">Earnings Ready to Withdraw</div>
            <div className="text-white font-bold tabular-nums">
              {formatUsdcDisplay(pendingWithdrawal)} USDC available
            </div>
            <div className="text-slate-500 text-xs mt-0.5">Open an agreement to withdraw your earnings.</div>
          </div>
          <ArrowRight className="w-5 h-5 text-emerald-400 shrink-0" />
        </motion.div>
      )}

      {/* Disputes alert */}
      {stats.disputes > 0 && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6 rounded-xl border border-amber-500/25 bg-amber-500/5 px-5 py-3.5 flex items-center gap-3"
        >
          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
          <span className="text-amber-300 text-sm">
            <span className="font-semibold">{stats.disputes} milestone{stats.disputes > 1 ? 's' : ''} under dispute.</span>{' '}
            Visit the Dispute Center to resolve them.
          </span>
        </motion.div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
        <StatsCard
          icon={TrendingUp}
          label="Total Locked"
          value={<RollingNumber value={totalLockedNum} decimals={2} />}
          sub="USDC"
          accent="purple"
        />
        <StatsCard
          icon={Briefcase}
          label="Active"
          value={<RollingNumber value={stats.active} />}
          sub="agreements"
          accent="cyan"
        />
        <StatsCard
          icon={Clock}
          label="Pending Review"
          value={<RollingNumber value={stats.pendingApproval} />}
          sub="milestones"
          accent={stats.pendingApproval > 0 ? 'amber' : 'none'}
        />
        <StatsCard
          icon={CheckCircle2}
          label="Completed"
          value={<RollingNumber value={stats.completed} />}
          sub="agreements"
          accent="emerald"
        />
      </div>

      {/* View toggle */}
      <div className="flex gap-1 p-1 rounded-xl bg-white/[0.04] border border-white/[0.07] w-fit mb-6">
        {(['client', 'freelancer'] as ViewMode[]).map((mode) => (
          <button
            key={mode}
            onClick={() => setViewMode(mode)}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${viewMode === mode ? 'bg-white/[0.09] text-white shadow-sm' : 'text-slate-500 hover:text-slate-300'}`}
          >
            {mode === 'client' ? 'As Client' : 'As Freelancer'}
          </button>
        ))}
      </div>

      {/* Agreements list */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16 gap-3">
          <div className="w-5 h-5 border-2 border-violet-500/40 border-t-violet-500 rounded-full animate-spin" />
          <span className="text-slate-500 text-sm">Loading agreements...</span>
        </div>
      ) : agreements.length === 0 ? (
        <EmptyState
          icon={FileText}
          title={viewMode === 'client' ? 'No agreements yet' : 'No assignments yet'}
          description={
            viewMode === 'client'
              ? 'Create your first escrow agreement. Define milestones, set amounts, and fund in testnet USDC.'
              : 'You have no freelance assignments yet. Share your wallet address with a client to get started.'
          }
          action={
            viewMode === 'client' ? (
              <TxButton onClick={onCreateAgreement} size="sm">
                <Plus className="w-4 h-4" />
                Create First Agreement
              </TxButton>
            ) : undefined
          }
        />
      ) : (
        <div className="space-y-3">
          {agreements.map(({ id, data: ag }, i) => (
            <motion.div
              key={id.toString()}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.045 }}
            >
              <GlassCard
                hover
                onClick={() => onViewAgreement(id)}
                className="p-5"
                accent={
                  (ag.milestones as { state: number }[]).some((m) => m.state === MilestoneState.DISPUTED)
                    ? 'amber'
                    : (ag.milestones as { state: number }[]).some((m) => m.state === MilestoneState.SUBMITTED)
                    ? 'violet'
                    : 'none'
                }
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-1.5">
                      <AgreementStateBadge state={ag.state as number} />
                      <span className="text-slate-600 text-xs tabular-nums mono">#{id.toString()}</span>
                      {(ag.milestones as { state: number }[]).some((m) => m.state === MilestoneState.SUBMITTED) && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-violet-500/10 border border-violet-500/20 text-violet-300">
                          Review needed
                        </span>
                      )}
                      {(ag.milestones as { state: number }[]).some((m) => m.state === MilestoneState.DISPUTED) && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-500/10 border border-amber-500/20 text-amber-300">
                          <AlertTriangle className="w-3 h-3" /> Dispute
                        </span>
                      )}
                    </div>
                    <h3 className="text-slate-200 font-semibold truncate">{ag.title as string}</h3>
                    <div className="flex flex-wrap items-center gap-3 mt-1.5 text-xs text-slate-600">
                      <span>
                        {viewMode === 'client' ? 'Freelancer: ' : 'Client: '}
                        <span className="mono text-slate-500">
                          {formatAddress(viewMode === 'client' ? ag.freelancer as string : ag.client as string)}
                        </span>
                      </span>
                      {(ag.fundedAt as bigint) > 0n && (
                        <span>Funded {timeAgo(ag.fundedAt as bigint)}</span>
                      )}
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <div className="text-white font-bold tabular-nums">
                      {formatUsdcDisplay(ag.totalAmount as bigint)}
                    </div>
                    <div className="text-slate-500 text-xs">USDC</div>
                  </div>
                </div>

                {/* Milestone mini-pills */}
                <div className="flex flex-wrap gap-1.5 mt-3 pt-3 border-t border-white/[0.05]">
                  {(ag.milestones as { state: number }[]).map((m, j: number) => (
                    <MilestoneStateBadge key={j} state={m.state} />
                  ))}
                </div>
              </GlassCard>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  )
}

function StatsCard({
  icon: Icon, label, value, sub, accent,
}: {
  icon: typeof TrendingUp
  label: string
  value: React.ReactNode
  sub: string
  accent: 'purple' | 'cyan' | 'emerald' | 'amber' | 'none'
}) {
  const accentColors = {
    purple: 'text-violet-400 bg-violet-500/10 border-violet-500/20',
    cyan: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/20',
    emerald: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
    amber: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
    none: 'text-slate-400 bg-white/[0.05] border-white/[0.08]',
  }[accent]

  return (
    <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-4">
      <div className={`w-8 h-8 rounded-lg border flex items-center justify-center mb-3 ${accentColors}`}>
        <Icon className="w-4 h-4" />
      </div>
      <div className="text-white font-bold text-xl tabular-nums">{value}</div>
      <div className="text-slate-500 text-xs mt-0.5">{sub}</div>
      <div className="text-slate-600 text-xs mt-1 uppercase tracking-wider">{label}</div>
    </div>
  )
}
