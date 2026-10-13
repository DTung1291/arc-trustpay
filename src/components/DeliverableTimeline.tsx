import { useState, useEffect, useMemo } from 'react'
import { useWriteContract, useWaitForTransactionReceipt, useAccount } from 'wagmi'
import { toast } from 'sonner'
import { Clock, Hash, RotateCcw, ChevronDown, ChevronUp, FileText, CheckCircle, AlertCircle, MessageSquare } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  MILESTONE_ESCROW_V2_ADDRESS, MILESTONE_ESCROW_V2_ABI, ARC_TESTNET_ID,
  MilestoneStateV2, MILESTONE_STATE_LABELS_V2, MILESTONE_STATE_COLORS_V2,
} from '@/contractV2'
import { formatUsdcDisplay, parseOnchainError } from '@/utils/format'
import { useSubmissionHistory, type MilestoneV2, type SubmissionRecord } from '@/hooks/useEscrowV2'
import { TxButton } from './ui/TxButton'
import { GlassCard } from './ui/GlassCard'
import { buildTxExplorerUrl } from '@/onchain-facts'

interface Props {
  agreementId: bigint
  milestoneIndex: number
  milestone: MilestoneV2
  isClient: boolean
  isFreelancer: boolean
  onRefetch: () => void
}

function getNow(): number {
  return Math.floor(Date.now() / 1000)
}

function formatCountdown(endTs: bigint): string {
  const now = getNow()
  const end = Number(endTs)
  const diff = end - now
  if (diff <= 0) return 'Expired'
  const days = Math.floor(diff / 86400)
  const hours = Math.floor((diff % 86400) / 3600)
  const mins = Math.floor((diff % 3600) / 60)
  if (days > 0) return `${days}d ${hours}h remaining`
  if (hours > 0) return `${hours}h ${mins}m remaining`
  return `${mins}m remaining`
}

function useCountdown(endTs: bigint | undefined): string {
  const initial = endTs && endTs !== 0n ? formatCountdown(endTs) : ''
  const [label, setLabel] = useState(initial)
  useEffect(() => {
    if (!endTs || endTs === 0n) {
      // oxlint-disable-next-line react/set-state-in-effect
      setLabel('')
      return
    }
    const id = setInterval(() => setLabel(formatCountdown(endTs)), 30_000)
    return () => clearInterval(id)
  }, [endTs])
  return label
}

function truncateHash(h: string): string {
  if (!h || h === '0x' + '0'.repeat(64)) return '—'
  return `${h.slice(0, 10)}…${h.slice(-6)}`
}

function isZeroHash(h: string): boolean {
  return !h || h === '0x' + '0'.repeat(64) || h === '0x0'
}

export function DeliverableTimeline({ agreementId, milestoneIndex, milestone, isClient, isFreelancer, onRefetch }: Props) {
  const { address, chainId } = useAccount()
  void address

  const { data: historyRaw, refetch: refetchHistory } = useSubmissionHistory(agreementId, milestoneIndex)
  const history = (historyRaw ?? []) as SubmissionRecord[]

  const [expanded, setExpanded] = useState(true)
  const [historyOpen, setHistoryOpen] = useState(false)

  // Submit / resubmit form
  const [deliverableRef, setDeliverableRef] = useState('')
  const [evidenceHashInput, setEvidenceHashInput] = useState('')
  const [revisionComment, setRevisionComment] = useState('')
  const [showRevisionForm, setShowRevisionForm] = useState(false)

  const { writeContract, data: txHash, isPending } = useWriteContract()
  const { isLoading: isConfirming } = useWaitForTransactionReceipt({ hash: txHash })

  const reviewWindowLabel = useCountdown(
    milestone.reviewWindowEnd > 0n ? milestone.reviewWindowEnd : undefined
  )

  const isExpired = useMemo(
    () =>
      milestone.reviewWindowEnd > 0n &&
      BigInt(getNow()) > milestone.reviewWindowEnd,
    // Re-evaluate every 30 s via reviewWindowLabel changing
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [milestone.reviewWindowEnd, reviewWindowLabel]
  )

  const handleSubmit = () => {
    if (chainId !== ARC_TESTNET_ID) { toast.error('Switch to Arc Testnet.'); return }
    if (!deliverableRef.trim()) { toast.error('Enter a deliverable reference (URL or IPFS hash).'); return }
    const rawHash = evidenceHashInput.trim()
    const evidenceHash: `0x${string}` = rawHash.startsWith('0x') && rawHash.length === 66
      ? rawHash as `0x${string}`
      : `0x${'0'.repeat(64)}`
    void writeContract({
      address: MILESTONE_ESCROW_V2_ADDRESS,
      abi: MILESTONE_ESCROW_V2_ABI,
      functionName: 'submitMilestone',
      args: [agreementId, BigInt(milestoneIndex), deliverableRef.trim(), evidenceHash],
      chainId: ARC_TESTNET_ID,
    }, {
      onSuccess: (hash) => {
        toast.success(milestone.state === MilestoneStateV2.REVISION_REQUESTED ? 'Revision submitted.' : 'Deliverable submitted for review.')
        void buildTxExplorerUrl(ARC_TESTNET_ID, hash)
        setDeliverableRef('')
        setEvidenceHashInput('')
        void onRefetch()
        void refetchHistory()
      },
      onError: (e) => toast.error(parseOnchainError(e)),
    })
  }

  const handleRequestRevision = () => {
    if (chainId !== ARC_TESTNET_ID) { toast.error('Switch to Arc Testnet.'); return }
    if (!revisionComment.trim()) { toast.error('Describe what needs to change.'); return }
    void writeContract({
      address: MILESTONE_ESCROW_V2_ADDRESS,
      abi: MILESTONE_ESCROW_V2_ABI,
      functionName: 'requestRevision',
      args: [agreementId, BigInt(milestoneIndex), revisionComment.trim()],
      chainId: ARC_TESTNET_ID,
    }, {
      onSuccess: () => {
        toast.success('Revision requested.')
        setRevisionComment('')
        setShowRevisionForm(false)
        void onRefetch()
        void refetchHistory()
      },
      onError: (e) => toast.error(parseOnchainError(e)),
    })
  }

  const stateColor = MILESTONE_STATE_COLORS_V2[milestone.state] ?? 'text-slate-400 bg-slate-400/10 border-slate-400/20'
  const stateLabel = MILESTONE_STATE_LABELS_V2[milestone.state] ?? 'Unknown'

  return (
    <GlassCard className="overflow-hidden">
      {/* Header row */}
      <button
        className="w-full flex items-start gap-4 p-5 text-left hover:bg-white/[0.02] transition-colors"
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <span className={`inline-flex items-center px-2 py-0.5 rounded-md border text-xs font-semibold ${stateColor}`}>
              {stateLabel}
            </span>
            {milestone.revisionCount > 0n && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md border border-orange-400/20 bg-orange-400/5 text-orange-300 text-xs">
                <RotateCcw className="w-3 h-3" />{milestone.revisionCount.toString()} revision{milestone.revisionCount > 1n ? 's' : ''}
              </span>
            )}
          </div>
          <div className="text-white font-semibold text-sm">{milestone.title}</div>
          {milestone.acceptanceCriteria && (
            <p className="text-slate-500 text-xs mt-0.5 text-pretty line-clamp-2">{milestone.acceptanceCriteria}</p>
          )}
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <span className="text-white font-bold tabular-nums text-sm">{formatUsdcDisplay(milestone.amount)} USDC</span>
          {expanded ? <ChevronUp className="w-4 h-4 text-slate-500" /> : <ChevronDown className="w-4 h-4 text-slate-500" />}
        </div>
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22 }}
            className="overflow-hidden"
          >
            <div className="px-5 pb-5 space-y-4 border-t border-white/[0.05]">

              {/* Review window countdown */}
              {milestone.state === MilestoneStateV2.SUBMITTED && milestone.reviewWindowEnd > 0n && (
                <div className={`mt-4 flex items-center gap-2.5 rounded-lg border px-4 py-3 ${isExpired ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-cyan-500/20 bg-cyan-500/5'}`}>
                  <Clock className={`w-4 h-4 shrink-0 ${isExpired ? 'text-emerald-400' : 'text-cyan-400'}`} />
                  <div>
                    <div className={`text-xs font-semibold ${isExpired ? 'text-emerald-300' : 'text-cyan-300'}`}>
                      {isExpired ? 'Review window expired' : 'Review window'}
                    </div>
                    <div className="text-slate-400 text-xs tabular-nums">
                      {isExpired ? 'Freelancer may claim auto-release (if enabled).' : reviewWindowLabel}
                    </div>
                  </div>
                </div>
              )}

              {/* Current deliverable */}
              {milestone.deliverableRef && (
                <div className="mt-4 rounded-xl border border-white/[0.07] bg-white/[0.02] p-4">
                  <div className="text-slate-500 text-xs uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <FileText className="w-3.5 h-3.5" />Latest Submission
                  </div>
                  <a
                    href={milestone.deliverableRef.startsWith('http') ? milestone.deliverableRef : undefined}
                    target="_blank" rel="noopener noreferrer"
                    className="text-cyan-300 text-sm break-all hover:text-cyan-200 transition-colors"
                  >
                    {milestone.deliverableRef}
                  </a>
                  {!isZeroHash(milestone.evidenceHash) && (
                    <div className="mt-2 flex items-center gap-2">
                      <Hash className="w-3.5 h-3.5 text-slate-600 shrink-0" />
                      <span className="mono text-slate-500 text-xs" title={milestone.evidenceHash}>
                        SHA-256: {truncateHash(milestone.evidenceHash)}
                      </span>
                    </div>
                  )}
                  {milestone.submittedAt > 0n && (
                    <div className="mt-1.5 text-slate-600 text-xs tabular-nums">
                      First submitted {new Date(Number(milestone.submittedAt) * 1000).toLocaleString()}
                    </div>
                  )}
                </div>
              )}

              {/* Revision comment (when REVISION_REQUESTED) */}
              {milestone.state === MilestoneStateV2.REVISION_REQUESTED && milestone.disputeReason && (
                <div className="rounded-xl border border-orange-500/20 bg-orange-500/5 p-4">
                  <div className="flex items-center gap-2 text-orange-300 text-xs font-semibold mb-2">
                    <MessageSquare className="w-3.5 h-3.5" />Client Revision Request
                  </div>
                  <p className="text-slate-300 text-sm text-pretty">{milestone.disputeReason}</p>
                </div>
              )}

              {/* Resolution note */}
              {milestone.state === MilestoneStateV2.RESOLVED && milestone.resolutionNote && (
                <div className="rounded-xl border border-sky-500/20 bg-sky-500/5 p-4">
                  <div className="flex items-center gap-2 text-sky-300 text-xs font-semibold mb-2">
                    <CheckCircle className="w-3.5 h-3.5" />Resolution Note
                  </div>
                  <p className="text-slate-300 text-sm text-pretty">{milestone.resolutionNote}</p>
                </div>
              )}

              {/* Dispute reason */}
              {milestone.state === MilestoneStateV2.DISPUTED && milestone.disputeReason && (
                <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
                  <div className="flex items-center gap-2 text-amber-300 text-xs font-semibold mb-2">
                    <AlertCircle className="w-3.5 h-3.5" />Dispute Reason
                  </div>
                  <p className="text-slate-300 text-sm text-pretty">{milestone.disputeReason}</p>
                </div>
              )}

              {/* Acceptance criteria (full) */}
              {milestone.acceptanceCriteria && (
                <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
                  <div className="text-slate-500 text-xs uppercase tracking-wider mb-2">Acceptance Criteria</div>
                  <p className="text-slate-300 text-sm text-pretty">{milestone.acceptanceCriteria}</p>
                </div>
              )}

              {/* Submission history toggle */}
              {history.length > 0 && (
                <div>
                  <button
                    onClick={() => setHistoryOpen((v) => !v)}
                    className="flex items-center gap-2 text-slate-500 hover:text-slate-300 text-xs font-semibold uppercase tracking-wider transition-colors"
                  >
                    {historyOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    Submission History ({history.length})
                  </button>
                  <AnimatePresence>
                    {historyOpen && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.18 }}
                        className="overflow-hidden mt-3 space-y-2"
                      >
                        {history.map((rec, idx) => (
                          <div key={idx} className="rounded-lg border border-white/[0.06] bg-white/[0.015] px-4 py-3">
                            <div className="flex items-center justify-between mb-1.5">
                              <span className="text-slate-500 text-xs font-semibold uppercase tracking-wider">
                                {rec.revisionNumber === 0n ? 'Initial' : `Revision ${rec.revisionNumber.toString()}`}
                              </span>
                              <span className="text-slate-600 text-xs tabular-nums">
                                {new Date(Number(rec.submittedAt) * 1000).toLocaleDateString()}
                              </span>
                            </div>
                            <a
                              href={rec.deliverableRef.startsWith('http') ? rec.deliverableRef : undefined}
                              target="_blank" rel="noopener noreferrer"
                              className="text-cyan-400/80 text-xs break-all hover:text-cyan-300 transition-colors"
                            >
                              {rec.deliverableRef}
                            </a>
                            {!isZeroHash(rec.evidenceHash) && (
                              <div className="mt-1 flex items-center gap-1.5">
                                <Hash className="w-3 h-3 text-slate-700 shrink-0" />
                                <span className="mono text-slate-600 text-xs">{truncateHash(rec.evidenceHash)}</span>
                              </div>
                            )}
                            {rec.clientComment && (
                              <p className="text-slate-500 text-xs mt-2 text-pretty italic">&ldquo;{rec.clientComment}&rdquo;</p>
                            )}
                          </div>
                        ))}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )}

              {/* Freelancer submit / resubmit form */}
              {isFreelancer && (
                milestone.state === MilestoneStateV2.PENDING || milestone.state === MilestoneStateV2.REVISION_REQUESTED
              ) && (
                <div className="rounded-xl border border-violet-500/20 bg-violet-500/5 p-4 space-y-3">
                  <div className="text-violet-300 text-xs font-semibold uppercase tracking-wider">
                    {milestone.state === MilestoneStateV2.REVISION_REQUESTED ? 'Submit Revision' : 'Submit Deliverable'}
                  </div>
                  <div>
                    <label className="block text-xs text-slate-400 mb-1.5">Deliverable URL or IPFS hash <span className="text-violet-400">*</span></label>
                    <input
                      className="input-base text-sm"
                      placeholder="https://... or ipfs://Qm..."
                      value={deliverableRef}
                      onChange={(e) => setDeliverableRef(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-400 mb-1.5">
                      Evidence SHA-256 hash <span className="text-slate-600">(optional, 0x prefixed)</span>
                    </label>
                    <input
                      className="input-base mono text-sm"
                      placeholder="0xabc123..."
                      value={evidenceHashInput}
                      onChange={(e) => setEvidenceHashInput(e.target.value)}
                    />
                    <p className="text-slate-600 text-xs mt-1">
                      Commit a SHA-256 hash of your evidence bundle to bind it onchain. Leave blank to submit without a hash.
                    </p>
                  </div>
                  <TxButton
                    onClick={handleSubmit}
                    loading={isPending || isConfirming}
                    loadingText={isConfirming ? 'Confirming...' : 'Waiting for wallet...'}
                    size="sm"
                  >
                    {milestone.state === MilestoneStateV2.REVISION_REQUESTED ? 'Submit Revision' : 'Submit for Review'}
                  </TxButton>
                </div>
              )}

              {/* Client revision request form */}
              {isClient && milestone.state === MilestoneStateV2.SUBMITTED && (
                <div>
                  {!showRevisionForm ? (
                    <button
                      onClick={() => setShowRevisionForm(true)}
                      className="flex items-center gap-2 text-slate-500 hover:text-orange-300 text-xs font-semibold uppercase tracking-wider transition-colors"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />Request Revision
                    </button>
                  ) : (
                    <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} className="rounded-xl border border-orange-500/20 bg-orange-500/5 p-4 space-y-3">
                      <div className="text-orange-300 text-xs font-semibold uppercase tracking-wider">Request Revision</div>
                      <div>
                        <label className="block text-xs text-slate-400 mb-1.5">What needs to change? <span className="text-orange-400">*</span></label>
                        <textarea
                          className="input-base min-h-[80px] resize-none text-sm"
                          placeholder="Describe what needs to be revised..."
                          value={revisionComment}
                          onChange={(e) => setRevisionComment(e.target.value)}
                        />
                      </div>
                      <div className="flex gap-2">
                        <TxButton variant="secondary" size="sm" onClick={() => { setShowRevisionForm(false); setRevisionComment('') }}>
                          Cancel
                        </TxButton>
                        <TxButton
                          onClick={handleRequestRevision}
                          loading={isPending || isConfirming}
                          loadingText="Submitting..."
                          size="sm"
                        >
                          Request Revision
                        </TxButton>
                      </div>
                    </motion.div>
                  )}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </GlassCard>
  )
}
