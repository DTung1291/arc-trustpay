import { useState, useMemo } from 'react'
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useSwitchChain } from 'wagmi'
import { toast } from 'sonner'
import { ArrowLeft, ExternalLink, Download, RefreshCw, Zap } from 'lucide-react'
import { motion } from 'framer-motion'
import {
  MILESTONE_ESCROW_V2_ADDRESS, MILESTONE_ESCROW_V2_ABI, USDC_ADDRESS,
  ARC_TESTNET_ID, MilestoneStateV2, AgreementState,
  MILESTONE_STATE_LABELS_V2, MILESTONE_STATE_COLORS_V2, AGREEMENT_STATE_COLORS,
} from '@/contractV2'
import { formatUsdcDisplay, formatAddress, parseOnchainError } from '@/utils/format'
import { useAgreementV2, usePendingWithdrawalV2, type AgreementV2 } from '@/hooks/useEscrowV2'
import { TxButton } from './ui/TxButton'
import { GlassCard } from './ui/GlassCard'
import { NetworkGuard } from './ui/NetworkGuard'
import { DeliverableTimeline } from './DeliverableTimeline'
import { buildTxExplorerUrl, buildAddressExplorerUrl } from '@/onchain-facts'

interface Props {
  agreementId: bigint
  onBack: () => void
}

function getNowSeconds(): bigint {
  return BigInt(Math.floor(Date.now() / 1000))
}

export function AgreementDetailV2({ agreementId, onBack }: Props) {
  const { address, chainId } = useAccount()
  const { switchChain } = useSwitchChain()
  const { data: agreementRaw, refetch } = useAgreementV2(agreementId)
  const agreement = agreementRaw as AgreementV2 | undefined
  const { data: pendingWithdrawalRaw, refetch: refetchWithdrawal } = usePendingWithdrawalV2(address)
  const pendingWithdrawal = pendingWithdrawalRaw as bigint | undefined

  const [disputeReason, setDisputeReason] = useState('')
  const [resolverFreelancerAmount, setResolverFreelancerAmount] = useState('')
  const [resolverNote, setResolverNote] = useState('')
  const [activeModal, setActiveModal] = useState<{ type: string; milestoneIndex: number } | null>(null)
  const [lastTxHash, setLastTxHash] = useState<`0x${string}` | null>(null)
  const [txLabels, setTxLabels] = useState<string[]>([])
  const [activeTab, setActiveTab] = useState<'timeline' | 'deliverables'>('timeline')

  const { writeContract, data: txHash, isPending } = useWriteContract()
  const { isLoading: isConfirming } = useWaitForTransactionReceipt({ hash: txHash })
  const { writeContract: writeWithdraw, data: withdrawHash, isPending: withdrawPending } = useWriteContract()
  const { isLoading: withdrawConfirming } = useWaitForTransactionReceipt({ hash: withdrawHash })

  const nowSeconds = useMemo(() => getNowSeconds(), [])

  if (!agreement) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16 flex flex-col items-center gap-4">
        <div className="w-8 h-8 border-2 border-violet-500/40 border-t-violet-500 rounded-full animate-spin" />
        <p className="text-slate-500 text-sm">Loading agreement...</p>
      </div>
    )
  }

  const isClient = address?.toLowerCase() === agreement.client?.toLowerCase()
  const isFreelancer = address?.toLowerCase() === agreement.freelancer?.toLowerCase()
  const isResolver = address?.toLowerCase() === agreement.resolver?.toLowerCase()

  const ensureChain = () => {
    if (chainId !== ARC_TESTNET_ID) { void switchChain({ chainId: ARC_TESTNET_ID }); return false }
    return true
  }

  const recordTx = (hash: `0x${string}`, label: string) => {
    setLastTxHash(hash)
    setTxLabels((prev) => [...prev.slice(-4), label])
  }

  const handleApprove = (index: number) => {
    if (!ensureChain()) return
    void writeContract({
      address: MILESTONE_ESCROW_V2_ADDRESS, abi: MILESTONE_ESCROW_V2_ABI,
      functionName: 'approveMilestone', args: [agreementId, BigInt(index)], chainId: ARC_TESTNET_ID,
    }, {
      onSuccess: (hash) => { recordTx(hash, `Approved milestone ${index + 1}`); toast.success('Milestone approved.'); void refetch() },
      onError: (e) => toast.error(parseOnchainError(e)),
    })
  }

  const handleClaim = (index: number) => {
    if (!ensureChain()) return
    void writeContract({
      address: MILESTONE_ESCROW_V2_ADDRESS, abi: MILESTONE_ESCROW_V2_ABI,
      functionName: 'claimMilestone', args: [agreementId, BigInt(index)], chainId: ARC_TESTNET_ID,
    }, {
      onSuccess: (hash) => {
        recordTx(hash, `Claimed milestone ${index + 1}`)
        toast.success('Payment credited — use Withdraw to receive USDC.')
        void refetch(); void refetchWithdrawal()
      },
      onError: (e) => toast.error(parseOnchainError(e)),
    })
  }

  const handleClaimAfterExpiry = (index: number) => {
    if (!ensureChain()) return
    void writeContract({
      address: MILESTONE_ESCROW_V2_ADDRESS, abi: MILESTONE_ESCROW_V2_ABI,
      functionName: 'claimAfterReviewExpiry', args: [agreementId, BigInt(index)], chainId: ARC_TESTNET_ID,
    }, {
      onSuccess: (hash) => {
        recordTx(hash, `Auto-release claim: milestone ${index + 1}`)
        toast.success('Auto-release payment credited.')
        void refetch(); void refetchWithdrawal()
      },
      onError: (e) => toast.error(parseOnchainError(e)),
    })
  }

  const handleDispute = (index: number) => {
    if (!ensureChain()) return
    if (!disputeReason.trim()) { toast.error('Enter a dispute reason.'); return }
    void writeContract({
      address: MILESTONE_ESCROW_V2_ADDRESS, abi: MILESTONE_ESCROW_V2_ABI,
      functionName: 'disputeMilestone', args: [agreementId, BigInt(index), disputeReason.trim()], chainId: ARC_TESTNET_ID,
    }, {
      onSuccess: (hash) => {
        recordTx(hash, `Disputed milestone ${index + 1}`)
        toast.success('Dispute raised.')
        setDisputeReason(''); setActiveModal(null); void refetch()
      },
      onError: (e) => toast.error(parseOnchainError(e)),
    })
  }

  const handleResolve = (index: number, awardToFreelancer: boolean) => {
    if (!ensureChain()) return
    const ms = agreement.milestones[index]
    const amount = resolverFreelancerAmount
      ? BigInt(Math.round(parseFloat(resolverFreelancerAmount) * 1_000_000))
      : (awardToFreelancer ? ms.amount : 0n)
    void writeContract({
      address: MILESTONE_ESCROW_V2_ADDRESS, abi: MILESTONE_ESCROW_V2_ABI,
      functionName: 'resolveDispute',
      args: [agreementId, BigInt(index), awardToFreelancer, amount, resolverNote || 'Resolved by designated resolver.'],
      chainId: ARC_TESTNET_ID,
    }, {
      onSuccess: (hash) => {
        recordTx(hash, `Resolved dispute on milestone ${index + 1}`)
        toast.success('Dispute resolved.')
        setResolverFreelancerAmount(''); setResolverNote(''); setActiveModal(null)
        void refetch(); void refetchWithdrawal()
      },
      onError: (e) => toast.error(parseOnchainError(e)),
    })
  }

  const handleWithdraw = () => {
    if (!ensureChain()) return
    void writeWithdraw({
      address: MILESTONE_ESCROW_V2_ADDRESS, abi: MILESTONE_ESCROW_V2_ABI,
      functionName: 'withdraw', args: [USDC_ADDRESS], chainId: ARC_TESTNET_ID,
    }, {
      onSuccess: (hash) => {
        recordTx(hash, 'Withdrew USDC')
        toast.success('USDC withdrawn to your wallet.')
        void refetchWithdrawal()
      },
      onError: (e) => toast.error(parseOnchainError(e)),
    })
  }

  const milestones = agreement.milestones ?? []
  const done = milestones.filter((m) => m.state === MilestoneStateV2.CLAIMED || m.state === MilestoneStateV2.RESOLVED).length
  const progressPct = milestones.length > 0 ? Math.round((done / milestones.length) * 100) : 0
  const stateColorAg = AGREEMENT_STATE_COLORS[agreement.state] ?? 'text-slate-400 bg-slate-400/10 border-slate-400/20'

  return (
    <NetworkGuard>
      <div className="max-w-3xl mx-auto px-4 py-10">

        {/* Header */}
        <div className="flex items-start gap-4 mb-8">
          <button
            onClick={onBack}
            className="mt-1 w-10 h-10 rounded-xl bg-white/[0.05] border border-white/[0.08] flex items-center justify-center text-slate-400 hover:text-slate-200 hover:bg-white/[0.09] transition-all"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <span className={`inline-flex items-center px-2 py-0.5 rounded-md border text-xs font-semibold ${stateColorAg}`}>
                {agreement.state === AgreementState.PENDING ? 'Pending Funding' : agreement.state === AgreementState.ACTIVE ? 'Active' : agreement.state === AgreementState.COMPLETED ? 'Completed' : 'Cancelled'}
              </span>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md border border-violet-400/20 bg-violet-400/5 text-violet-400 text-xs font-semibold">V2</span>
              {agreement.autoRelease && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md border border-amber-400/20 bg-amber-400/5 text-amber-300 text-xs">
                  <Zap className="w-3 h-3" />Auto-Release
                </span>
              )}
              <span className="text-slate-600 text-xs mono">#{agreementId.toString()}</span>
              <button onClick={() => void refetch()} className="ml-auto text-slate-600 hover:text-slate-300 transition-colors p-1 rounded">
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
            </div>
            <h1 className="display text-2xl font-bold text-white truncate" style={{ letterSpacing: '-0.02em' }}>
              {agreement.title}
            </h1>
            {agreement.description && (
              <p className="text-slate-500 text-sm mt-1 text-pretty">{agreement.description}</p>
            )}
          </div>
        </div>

        {/* Pending withdrawal banner */}
        {pendingWithdrawal !== undefined && pendingWithdrawal > 0n && (
          <motion.div
            initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
            className="mb-6 rounded-xl border border-emerald-500/30 bg-emerald-500/5 px-5 py-4 flex items-center justify-between gap-4"
          >
            <div>
              <div className="text-emerald-300 font-semibold text-sm">Claimable Balance</div>
              <div className="text-white font-bold tabular-nums">{formatUsdcDisplay(pendingWithdrawal)} USDC ready to withdraw</div>
            </div>
            <TxButton variant="success" size="sm" onClick={handleWithdraw} loading={withdrawPending || withdrawConfirming} loadingText="Withdrawing...">
              <Download className="w-4 h-4" />Withdraw
            </TxButton>
          </motion.div>
        )}

        {/* Stats row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
          <StatMini label="Total" value={`${formatUsdcDisplay(agreement.totalAmount)} USDC`} accent />
          <StatMini label="Paid Out" value={`${formatUsdcDisplay(agreement.totalPaid)} USDC`} />
          <StatMini label="Progress" value={`${progressPct}%`} />
          <StatMini label="Review Window" value={agreement.reviewWindowSeconds > 0n ? formatDuration(agreement.reviewWindowSeconds) : '7 days'} />
        </div>

        {/* Progress bar */}
        <GlassCard className="p-4 mb-6">
          <div className="flex justify-between text-xs text-slate-500 mb-2">
            <span>Milestone Progress</span>
            <span className="tabular-nums">{done}/{milestones.length} complete</span>
          </div>
          <div className="h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
            <motion.div
              className="h-full bg-gradient-to-r from-violet-500 to-fuchsia-500 rounded-full"
              initial={{ width: 0 }} animate={{ width: `${progressPct}%` }}
              transition={{ duration: 0.9, ease: 'easeOut' }}
            />
          </div>
        </GlassCard>

        {/* Parties */}
        <GlassCard className="p-5 mb-6">
          <h2 className="text-white font-semibold text-sm mb-4">Parties</h2>
          <div className="grid sm:grid-cols-3 gap-4">
            <PartyRow label="Client" address={agreement.client} tag={isClient ? 'You' : undefined} />
            <PartyRow label="Freelancer" address={agreement.freelancer} tag={isFreelancer ? 'You' : undefined} />
            <PartyRow label="Resolver" address={agreement.resolver} tag={isResolver ? 'You' : undefined} />
          </div>
        </GlassCard>

        {/* Tab bar */}
        <div className="flex gap-2 mb-5">
          {(['timeline', 'deliverables'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${activeTab === tab ? 'bg-violet-500/20 text-violet-300 border border-violet-500/30' : 'text-slate-500 hover:text-slate-300 border border-transparent'}`}
            >
              {tab === 'timeline' ? 'Milestone Actions' : 'Proof of Work'}
            </button>
          ))}
        </div>

        {/* Timeline tab (classic actions) */}
        {activeTab === 'timeline' && (
          <div className="space-y-3">
            {milestones.map((ms, i) => (
              <GlassCard key={i} className="p-5">
                <div className="flex items-start justify-between gap-4 mb-3">
                  <div className="flex items-start gap-3">
                    <div className="w-7 h-7 rounded-lg bg-violet-500/20 border border-violet-500/30 flex items-center justify-center text-violet-300 text-xs font-bold shrink-0 mt-0.5">{i + 1}</div>
                    <div>
                      <div className="text-white font-semibold text-sm">{ms.title}</div>
                      {ms.description && <div className="text-slate-500 text-xs mt-0.5">{ms.description}</div>}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-white font-bold tabular-nums text-sm">{formatUsdcDisplay(ms.amount)} USDC</div>
                    <span className={`mt-1 inline-flex items-center px-2 py-0.5 rounded-md border text-xs font-semibold ${MILESTONE_STATE_COLORS_V2[ms.state] ?? ''}`}>
                      {MILESTONE_STATE_LABELS_V2[ms.state] ?? 'Unknown'}
                    </span>
                  </div>
                </div>

                {/* Actions by role + state */}
                <div className="flex flex-wrap gap-2 mt-2">
                  {/* Freelancer: claim */}
                  {isFreelancer && ms.state === MilestoneStateV2.APPROVED && (
                    <TxButton size="sm" onClick={() => handleClaim(i)} loading={isPending || isConfirming} loadingText="Claiming...">
                      Claim Payment
                    </TxButton>
                  )}
                  {/* Freelancer: auto-release claim */}
                  {isFreelancer && ms.state === MilestoneStateV2.SUBMITTED && agreement.autoReleaseEnabled &&
                    ms.reviewWindowEnd > 0n && nowSeconds > ms.reviewWindowEnd && (
                    <TxButton size="sm" variant="secondary" onClick={() => handleClaimAfterExpiry(i)} loading={isPending || isConfirming} loadingText="Claiming...">
                      <Zap className="w-3.5 h-3.5" />Claim (Auto-Release)
                    </TxButton>
                  )}
                  {/* Client: approve */}
                  {isClient && ms.state === MilestoneStateV2.SUBMITTED && (
                    <TxButton size="sm" variant="success" onClick={() => handleApprove(i)} loading={isPending || isConfirming} loadingText="Approving...">
                      Approve
                    </TxButton>
                  )}
                  {/* Client: dispute */}
                  {isClient && ms.state === MilestoneStateV2.SUBMITTED && activeModal?.milestoneIndex !== i && (
                    <button
                      onClick={() => setActiveModal({ type: 'dispute', milestoneIndex: i })}
                      className="px-3 py-1.5 rounded-lg border border-amber-500/20 bg-amber-500/5 text-amber-300 text-xs font-semibold hover:bg-amber-500/10 transition-colors"
                    >
                      Dispute
                    </button>
                  )}
                  {/* Dispute form */}
                  {isClient && activeModal?.type === 'dispute' && activeModal.milestoneIndex === i && (
                    <div className="w-full mt-2 space-y-2">
                      <textarea
                        className="input-base w-full min-h-[72px] resize-none text-sm"
                        placeholder="Describe the issue..."
                        value={disputeReason}
                        onChange={(e) => setDisputeReason(e.target.value)}
                      />
                      <div className="flex gap-2">
                        <TxButton size="sm" variant="secondary" onClick={() => setActiveModal(null)}>Cancel</TxButton>
                        <TxButton size="sm" onClick={() => handleDispute(i)} loading={isPending || isConfirming} loadingText="Raising...">
                          Raise Dispute
                        </TxButton>
                      </div>
                    </div>
                  )}
                  {/* Resolver: resolve */}
                  {isResolver && ms.state === MilestoneStateV2.DISPUTED && activeModal?.milestoneIndex !== i && (
                    <button
                      onClick={() => setActiveModal({ type: 'resolve', milestoneIndex: i })}
                      className="px-3 py-1.5 rounded-lg border border-sky-500/20 bg-sky-500/5 text-sky-300 text-xs font-semibold hover:bg-sky-500/10 transition-colors"
                    >
                      Resolve Dispute
                    </button>
                  )}
                  {isResolver && activeModal?.type === 'resolve' && activeModal.milestoneIndex === i && (
                    <div className="w-full mt-2 space-y-2">
                      <input className="input-base text-sm" placeholder="Freelancer award amount (USDC, leave blank for full)" value={resolverFreelancerAmount} onChange={(e) => setResolverFreelancerAmount(e.target.value)} />
                      <textarea className="input-base w-full min-h-[56px] resize-none text-sm" placeholder="Resolution note..." value={resolverNote} onChange={(e) => setResolverNote(e.target.value)} />
                      <div className="flex gap-2">
                        <TxButton size="sm" variant="secondary" onClick={() => setActiveModal(null)}>Cancel</TxButton>
                        <TxButton size="sm" variant="success" onClick={() => handleResolve(i, true)} loading={isPending || isConfirming} loadingText="Resolving...">Award Freelancer</TxButton>
                        <TxButton size="sm" onClick={() => handleResolve(i, false)} loading={isPending || isConfirming} loadingText="Resolving...">Refund Client</TxButton>
                      </div>
                    </div>
                  )}
                </div>
              </GlassCard>
            ))}
          </div>
        )}

        {/* Deliverables tab */}
        {activeTab === 'deliverables' && (
          <div className="space-y-3">
            {milestones.length === 0 && (
              <div className="text-center py-12 text-slate-600 text-sm">No milestones yet.</div>
            )}
            {milestones.map((ms, i) => (
              <DeliverableTimeline
                key={i}
                agreementId={agreementId}
                milestoneIndex={i}
                milestone={ms}
                isClient={isClient}
                isFreelancer={isFreelancer}
                onRefetch={() => void refetch()}
              />
            ))}
          </div>
        )}

        {/* Transaction log */}
        {txLabels.length > 0 && lastTxHash && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-6 rounded-xl border border-white/[0.07] bg-white/[0.02] overflow-hidden">
            <div className="px-4 py-3 border-b border-white/[0.05] flex items-center justify-between">
              <span className="text-slate-500 text-xs font-semibold uppercase tracking-wider">Transactions</span>
              <a
                href={buildTxExplorerUrl(ARC_TESTNET_ID, lastTxHash)}
                target="_blank" rel="noopener noreferrer"
                className="mono text-cyan-400 text-xs hover:text-cyan-300 flex items-center gap-1.5 transition-colors"
              >
                {lastTxHash.slice(0, 10)}...{lastTxHash.slice(-6)}
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
            <div className="divide-y divide-white/[0.04]">
              {txLabels.slice().reverse().map((label, i) => (
                <div key={i} className="px-4 py-2.5 flex items-center gap-2 text-xs">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
                  <span className="text-slate-400">{label}</span>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </div>
    </NetworkGuard>
  )
}

function formatDuration(seconds: bigint): string {
  const s = Number(seconds)
  if (s >= 86400 * 2) return `${Math.floor(s / 86400)} days`
  if (s >= 3600) return `${Math.floor(s / 3600)} hours`
  return `${s}s`
}

function StatMini({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-4">
      <div className="text-slate-500 text-xs mb-1.5 uppercase tracking-wider">{label}</div>
      <div className={`font-bold tabular-nums text-sm ${accent ? 'text-white' : 'text-slate-300'}`}>{value}</div>
    </div>
  )
}

function PartyRow({ label, address, tag }: { label: string; address: string; tag?: string }) {
  return (
    <div>
      <div className="text-slate-600 text-xs uppercase tracking-wider mb-1">{label}</div>
      <div className="flex items-center gap-1.5">
        <a
          href={buildAddressExplorerUrl(ARC_TESTNET_ID, address)}
          target="_blank" rel="noopener noreferrer"
          className="mono text-xs text-slate-400 hover:text-cyan-300 transition-colors flex items-center gap-1"
        >
          {formatAddress(address)}
          <ExternalLink className="w-2.5 h-2.5 opacity-60" />
        </a>
        {tag && <span className="text-violet-400 text-xs font-semibold">{tag}</span>}
      </div>
    </div>
  )
}
