import { motion } from 'framer-motion'
import {
  Clock, Send, CheckCircle2, Coins, AlertTriangle, ShieldCheck,
  Circle
} from 'lucide-react'
import { MilestoneState } from '@/contract'
import { formatUsdcDisplay, formatDate } from '@/utils/format'

type MilestoneShape = {
  title: string
  description: string
  amount: bigint
  dueDate: bigint
  deliverableRef: string
  disputeReason: string
  resolutionNote: string
  state: number
  submittedAt: bigint
  reviewWindowEnd: bigint
}

interface MilestoneTimelineProps {
  milestones: MilestoneShape[]
  agreementActive: boolean
  isClient: boolean
  isFreelancer: boolean
  isResolver: boolean
  isPending: boolean
  isConfirming: boolean
  activeModal: { type: string; milestoneIndex: number } | null
  deliverableRef: string
  disputeReason: string
  resolverFreelancerAmount: string
  resolverNote: string
  onDeliverableRefChange: (v: string) => void
  onDisputeReasonChange: (v: string) => void
  onResolverFreelancerAmountChange: (v: string) => void
  onResolverNoteChange: (v: string) => void
  onSetActiveModal: (m: { type: string; milestoneIndex: number } | null) => void
  onSubmit: (i: number) => void
  onApprove: (i: number) => void
  onClaim: (i: number) => void
  onDispute: (i: number) => void
  onResolve: (i: number, awardToFreelancer: boolean) => void
  onClaimAfterExpiry: (i: number) => void
}

// Computed once at module load — avoids calling Date.now() during render
const MODULE_NOW_S = Math.floor(new Date().getTime() / 1000)

const STATE_NODE_CONFIG: Record<number, { icon: typeof Clock; color: string; ring: string; bg: string }> = {
  [MilestoneState.PENDING]: {
    icon: Circle,
    color: 'text-slate-500',
    ring: 'border-white/[0.12]',
    bg: 'bg-white/[0.04]',
  },
  [MilestoneState.SUBMITTED]: {
    icon: Send,
    color: 'text-cyan-400',
    ring: 'border-cyan-500/40',
    bg: 'bg-cyan-500/10',
  },
  [MilestoneState.APPROVED]: {
    icon: CheckCircle2,
    color: 'text-violet-400',
    ring: 'border-violet-500/40',
    bg: 'bg-violet-500/10',
  },
  [MilestoneState.CLAIMED]: {
    icon: Coins,
    color: 'text-emerald-400',
    ring: 'border-emerald-500/40',
    bg: 'bg-emerald-500/10',
  },
  [MilestoneState.DISPUTED]: {
    icon: AlertTriangle,
    color: 'text-amber-400',
    ring: 'border-amber-500/40',
    bg: 'bg-amber-500/10',
  },
  [MilestoneState.RESOLVED]: {
    icon: ShieldCheck,
    color: 'text-sky-400',
    ring: 'border-sky-500/40',
    bg: 'bg-sky-500/10',
  },
}

function getNodeConfig(state: number) {
  return STATE_NODE_CONFIG[state] ?? STATE_NODE_CONFIG[MilestoneState.PENDING]
}

const STATE_LABEL: Record<number, string> = {
  [MilestoneState.PENDING]: 'Pending',
  [MilestoneState.SUBMITTED]: 'Submitted',
  [MilestoneState.APPROVED]: 'Approved',
  [MilestoneState.CLAIMED]: 'Paid',
  [MilestoneState.DISPUTED]: 'Disputed',
  [MilestoneState.RESOLVED]: 'Resolved',
}

export function MilestoneTimeline({
  milestones,
  agreementActive,
  isClient,
  isFreelancer,
  isResolver,
  isPending,
  isConfirming,
  activeModal,
  deliverableRef,
  disputeReason,
  resolverFreelancerAmount,
  resolverNote,
  onDeliverableRefChange,
  onDisputeReasonChange,
  onResolverFreelancerAmountChange,
  onResolverNoteChange,
  onSetActiveModal,
  onSubmit,
  onApprove,
  onClaim,
  onDispute,
  onResolve,
  onClaimAfterExpiry,
}: MilestoneTimelineProps) {
  const now = MODULE_NOW_S

  return (
    <div className="space-y-0">
      {milestones.map((m, i) => {
        const cfg = getNodeConfig(m.state)
        const NodeIcon = cfg.icon
        const isLast = i === milestones.length - 1
        const reviewExpired =
          m.state === MilestoneState.SUBMITTED &&
          m.reviewWindowEnd > 0n &&
          now > Number(m.reviewWindowEnd)

        return (
          <motion.div
            key={i}
            initial={{ opacity: 0, x: -16 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.07, duration: 0.35 }}
            className="flex gap-4"
          >
            {/* Timeline spine */}
            <div className="flex flex-col items-center shrink-0">
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: i * 0.07 + 0.1, type: 'spring', stiffness: 260, damping: 20 }}
                className={`w-10 h-10 rounded-xl border-2 flex items-center justify-center ${cfg.ring} ${cfg.bg} shrink-0`}
              >
                <NodeIcon className={`w-4.5 h-4.5 ${cfg.color}`} style={{ width: '1.125rem', height: '1.125rem' }} />
              </motion.div>
              {!isLast && (
                <motion.div
                  className="w-px bg-white/[0.07] flex-1 my-1"
                  style={{ minHeight: '24px' }}
                  initial={{ scaleY: 0 }}
                  animate={{ scaleY: 1 }}
                  transition={{ delay: i * 0.07 + 0.25, duration: 0.4 }}
                />
              )}
            </div>

            {/* Content card */}
            <div className={`flex-1 mb-4 rounded-2xl border transition-colors ${m.state === MilestoneState.DISPUTED ? 'border-amber-500/25 bg-amber-500/[0.04]' : m.state === MilestoneState.CLAIMED || m.state === MilestoneState.RESOLVED ? 'border-white/[0.06] bg-white/[0.02]' : 'border-white/[0.08] bg-white/[0.03]'} p-5`}>

              {/* Header row */}
              <div className="flex flex-wrap items-start justify-between gap-2 mb-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-5 h-5 rounded-md bg-violet-500/20 border border-violet-500/30 flex items-center justify-center text-violet-300 text-xs font-bold shrink-0">
                    {i + 1}
                  </div>
                  <h3 className="text-slate-200 font-semibold text-sm truncate">{m.title}</h3>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-white font-bold tabular-nums text-sm">
                    {formatUsdcDisplay(m.amount)} USDC
                  </span>
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold border ${cfg.ring} ${cfg.bg} ${cfg.color}`}>
                    {STATE_LABEL[m.state] ?? 'Unknown'}
                  </span>
                </div>
              </div>

              {m.description && (
                <p className="text-slate-500 text-xs mb-3 leading-relaxed">{m.description}</p>
              )}

              {/* Due date */}
              {m.dueDate > 0n && (
                <div className="flex items-center gap-1.5 text-xs text-slate-600 mb-3">
                  <Clock className="w-3.5 h-3.5" />
                  Due {formatDate(m.dueDate)}
                </div>
              )}

              {/* Deliverable */}
              {m.deliverableRef && (
                <div className="rounded-lg bg-white/[0.03] border border-white/[0.06] px-3 py-2 mb-3">
                  <div className="text-slate-500 text-xs mb-1">Deliverable Reference</div>
                  <div className="mono text-xs text-cyan-400 break-all">{m.deliverableRef}</div>
                </div>
              )}

              {/* Review window expiry notice */}
              {reviewExpired && isFreelancer && (
                <div className="rounded-lg bg-cyan-500/5 border border-cyan-500/20 px-3 py-2 mb-3">
                  <div className="text-cyan-400 text-xs font-semibold">
                    Review window expired — you may claim without client approval.
                  </div>
                </div>
              )}

              {/* Dispute reason */}
              {m.disputeReason && (
                <div className="rounded-lg bg-amber-500/5 border border-amber-500/20 px-3 py-2 mb-3">
                  <div className="text-amber-400 text-xs font-semibold mb-1 flex items-center gap-1">
                    <AlertTriangle className="w-3.5 h-3.5" /> Dispute Reason
                  </div>
                  <div className="text-amber-300/70 text-xs">{m.disputeReason}</div>
                </div>
              )}

              {/* Resolution note */}
              {m.resolutionNote && (
                <div className="rounded-lg bg-sky-500/5 border border-sky-500/20 px-3 py-2 mb-3">
                  <div className="text-sky-400 text-xs font-semibold mb-1 flex items-center gap-1">
                    <ShieldCheck className="w-3.5 h-3.5" /> Resolution Note
                  </div>
                  <div className="text-sky-300/70 text-xs">{m.resolutionNote}</div>
                </div>
              )}

              {/* ─── Actions ─── */}

              {/* FREELANCER: Submit */}
              {isFreelancer && m.state === MilestoneState.PENDING && agreementActive && (
                activeModal?.type === 'submit' && activeModal.milestoneIndex === i ? (
                  <div className="space-y-2 mt-2">
                    <input
                      className="input-base text-sm"
                      placeholder="IPFS hash or deliverable URL..."
                      value={deliverableRef}
                      onChange={(e) => onDeliverableRefChange(e.target.value)}
                      autoFocus
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => onSetActiveModal(null)}
                        className="px-3 py-1.5 rounded-lg text-xs text-slate-400 hover:text-slate-200 transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => onSubmit(i)}
                        disabled={isPending || isConfirming || !deliverableRef.trim()}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-violet-600/80 text-white hover:bg-violet-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                      >
                        {isPending || isConfirming ? (
                          <><span className="w-3 h-3 border border-white/40 border-t-white rounded-full animate-spin" />Submitting...</>
                        ) : (
                          <><Send className="w-3.5 h-3.5" />Submit</>
                        )}
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => onSetActiveModal({ type: 'submit', milestoneIndex: i })}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-white/[0.07] border border-white/[0.12] text-slate-200 hover:bg-white/[0.11] transition-all"
                  >
                    <Send className="w-3.5 h-3.5" />Submit Deliverable
                  </button>
                )
              )}

              {/* FREELANCER: Claim after review expiry */}
              {isFreelancer && reviewExpired && (
                <button
                  onClick={() => onClaimAfterExpiry(i)}
                  disabled={isPending || isConfirming}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/20 disabled:opacity-50 transition-all"
                >
                  {isPending || isConfirming ? (
                    <><span className="w-3 h-3 border border-cyan-400/40 border-t-cyan-400 rounded-full animate-spin" />Claiming...</>
                  ) : (
                    <><Coins className="w-3.5 h-3.5" />Claim After Expiry</>
                  )}
                </button>
              )}

              {/* CLIENT: Approve or Dispute */}
              {isClient && m.state === MilestoneState.SUBMITTED && agreementActive && (
                <div className="flex flex-wrap gap-2 mt-1">
                  <button
                    onClick={() => onApprove(i)}
                    disabled={isPending || isConfirming}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20 disabled:opacity-50 transition-all"
                  >
                    {isPending || isConfirming ? (
                      <><span className="w-3 h-3 border border-emerald-400/40 border-t-emerald-400 rounded-full animate-spin" />Approving...</>
                    ) : (
                      <><CheckCircle2 className="w-3.5 h-3.5" />Approve</>
                    )}
                  </button>

                  {activeModal?.type === 'dispute' && activeModal.milestoneIndex === i ? (
                    <div className="w-full space-y-2 mt-1">
                      <input
                        className="input-base text-sm"
                        placeholder="Why are you disputing this submission?"
                        value={disputeReason}
                        onChange={(e) => onDisputeReasonChange(e.target.value)}
                        autoFocus
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={() => onSetActiveModal(null)}
                          className="px-3 py-1.5 rounded-lg text-xs text-slate-400 hover:text-slate-200 transition-colors"
                        >Cancel</button>
                        <button
                          onClick={() => onDispute(i)}
                          disabled={isPending || isConfirming || !disputeReason.trim()}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-red-500/10 border border-red-500/30 text-red-400 hover:bg-red-500/20 disabled:opacity-50 transition-all"
                        >
                          <AlertTriangle className="w-3.5 h-3.5" />Raise Dispute
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => onSetActiveModal({ type: 'dispute', milestoneIndex: i })}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-red-500/10 border border-red-500/30 text-red-400 hover:bg-red-500/20 transition-all"
                    >
                      <AlertTriangle className="w-3.5 h-3.5" />Dispute
                    </button>
                  )}
                </div>
              )}

              {/* FREELANCER: Claim approved */}
              {isFreelancer && m.state === MilestoneState.APPROVED && (
                <button
                  onClick={() => onClaim(i)}
                  disabled={isPending || isConfirming}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20 disabled:opacity-50 transition-all"
                >
                  {isPending || isConfirming ? (
                    <><span className="w-3 h-3 border border-emerald-400/40 border-t-emerald-400 rounded-full animate-spin" />Claiming...</>
                  ) : (
                    <><Coins className="w-3.5 h-3.5" />Claim {formatUsdcDisplay(m.amount)} USDC</>
                  )}
                </button>
              )}

              {/* RESOLVER: Resolve dispute */}
              {isResolver && m.state === MilestoneState.DISPUTED && (
                <div className="mt-2 space-y-2">
                  <div className="text-xs text-amber-400 font-semibold">Resolve Dispute</div>
                  <div className="flex flex-wrap gap-2">
                    <input
                      className="input-base text-sm flex-1 min-w-[160px]"
                      placeholder={`Freelancer amount (max ${formatUsdcDisplay(m.amount)} USDC)`}
                      value={resolverFreelancerAmount}
                      onChange={(e) => onResolverFreelancerAmountChange(e.target.value)}
                    />
                    <input
                      className="input-base text-sm flex-1 min-w-[160px]"
                      placeholder="Resolution note..."
                      value={resolverNote}
                      onChange={(e) => onResolverNoteChange(e.target.value)}
                    />
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => onResolve(i, true)}
                      disabled={isPending || isConfirming}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20 disabled:opacity-50 transition-all"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />Award Freelancer
                    </button>
                    <button
                      onClick={() => onResolve(i, false)}
                      disabled={isPending || isConfirming}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-white/[0.07] border border-white/[0.12] text-slate-200 hover:bg-white/[0.11] disabled:opacity-50 transition-all"
                    >
                      Refund Client
                    </button>
                  </div>
                </div>
              )}

            </div>
          </motion.div>
        )
      })}
    </div>
  )
}
