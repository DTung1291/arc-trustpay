import { useState } from 'react'
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useSwitchChain } from 'wagmi'
import { toast } from 'sonner'
import { ArrowLeft, ExternalLink, Download, RefreshCw } from 'lucide-react'
import { motion } from 'framer-motion'
import {
  MILESTONE_ESCROW_ADDRESS, MILESTONE_ESCROW_ABI, USDC_ADDRESS,
  ARC_TESTNET_ID, MilestoneState, AgreementState,
} from '@/contract'
import { formatUsdcDisplay, formatAddress, parseOnchainError } from '@/utils/format'
import { useAgreement, usePendingWithdrawal } from '@/hooks/useEscrow'
import { AgreementStateBadge } from './ui/StatusBadge'
import { TxButton } from './ui/TxButton'
import { GlassCard } from './ui/GlassCard'
import { NetworkGuard } from './ui/NetworkGuard'
import { MilestoneTimeline } from './ui/MilestoneTimeline'
import { buildTxExplorerUrl, buildAddressExplorerUrl } from '@/onchain-facts'

interface Props {
  agreementId: bigint
  onBack: () => void
}

export function AgreementDetail({ agreementId, onBack }: Props) {
  const { address, chainId } = useAccount()
  const { switchChain } = useSwitchChain()
  const { data: agreement, refetch } = useAgreement(agreementId)
  const { data: pendingWithdrawalRaw, refetch: refetchWithdrawal } = usePendingWithdrawal(address)
  const pendingWithdrawal = pendingWithdrawalRaw as bigint | undefined

  const [deliverableRef, setDeliverableRef] = useState('')
  const [disputeReason, setDisputeReason] = useState('')
  const [resolverFreelancerAmount, setResolverFreelancerAmount] = useState('')
  const [resolverNote, setResolverNote] = useState('')
  const [activeModal, setActiveModal] = useState<{
    type: string
    milestoneIndex: number
  } | null>(null)
  const [lastTxHash, setLastTxHash] = useState<`0x${string}` | null>(null)
  const [txLabels, setTxLabels] = useState<string[]>([])

  const { writeContract, data: txHash, isPending } = useWriteContract()
  const { isLoading: isConfirming } = useWaitForTransactionReceipt({ hash: txHash })
  const { writeContract: writeWithdraw, data: withdrawHash, isPending: withdrawPending } = useWriteContract()
  const { isLoading: withdrawConfirming } = useWaitForTransactionReceipt({ hash: withdrawHash })

  if (!agreement) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16 flex flex-col items-center gap-4">
        <div className="w-8 h-8 border-2 border-violet-500/40 border-t-violet-500 rounded-full animate-spin" />
        <p className="text-slate-500 text-sm">Loading agreement...</p>
      </div>
    )
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ag = agreement as Record<string, any>
  const isClient = address?.toLowerCase() === (ag.client as string)?.toLowerCase()
  const isFreelancer = address?.toLowerCase() === (ag.freelancer as string)?.toLowerCase()
  const isResolver = address?.toLowerCase() === (ag.resolver as string)?.toLowerCase()

  const ensureChain = () => {
    if (chainId !== ARC_TESTNET_ID) {
      void switchChain({ chainId: ARC_TESTNET_ID })
      return false
    }
    return true
  }

  const recordTx = (hash: `0x${string}`, label: string) => {
    setLastTxHash(hash)
    setTxLabels((prev) => [...prev.slice(-4), label])
  }

  const handleApprove = (index: number) => {
    if (!ensureChain()) return
    void writeContract({
      address: MILESTONE_ESCROW_ADDRESS, abi: MILESTONE_ESCROW_ABI,
      functionName: 'approveMilestone', args: [agreementId, BigInt(index)], chainId: ARC_TESTNET_ID,
    }, {
      onSuccess: (hash) => { recordTx(hash, `Approved milestone ${index + 1}`); toast.success('Milestone approved.'); void refetch() },
      onError: (e) => toast.error(parseOnchainError(e)),
    })
  }

  const handleSubmit = (index: number) => {
    if (!ensureChain()) return
    if (!deliverableRef.trim()) { toast.error('Enter a deliverable reference.'); return }
    void writeContract({
      address: MILESTONE_ESCROW_ADDRESS, abi: MILESTONE_ESCROW_ABI,
      functionName: 'submitMilestone', args: [agreementId, BigInt(index), deliverableRef.trim()], chainId: ARC_TESTNET_ID,
    }, {
      onSuccess: (hash) => {
        recordTx(hash, `Submitted milestone ${index + 1}`)
        toast.success('Milestone submitted for review.')
        setDeliverableRef(''); setActiveModal(null); void refetch()
      },
      onError: (e) => toast.error(parseOnchainError(e)),
    })
  }

  const handleClaim = (index: number) => {
    if (!ensureChain()) return
    void writeContract({
      address: MILESTONE_ESCROW_ADDRESS, abi: MILESTONE_ESCROW_ABI,
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

  const handleDispute = (index: number) => {
    if (!ensureChain()) return
    if (!disputeReason.trim()) { toast.error('Enter a dispute reason.'); return }
    void writeContract({
      address: MILESTONE_ESCROW_ADDRESS, abi: MILESTONE_ESCROW_ABI,
      functionName: 'disputeMilestone', args: [agreementId, BigInt(index), disputeReason.trim()], chainId: ARC_TESTNET_ID,
    }, {
      onSuccess: (hash) => {
        recordTx(hash, `Disputed milestone ${index + 1}`)
        toast.success('Dispute raised — resolver notified.')
        setDisputeReason(''); setActiveModal(null); void refetch()
      },
      onError: (e) => toast.error(parseOnchainError(e)),
    })
  }

  const handleResolve = (index: number, awardToFreelancer: boolean) => {
    if (!ensureChain()) return
    const milestone = (ag.milestones as { amount: bigint }[])[index]
    const amount = resolverFreelancerAmount
      ? BigInt(Math.round(parseFloat(resolverFreelancerAmount) * 1_000_000))
      : (awardToFreelancer ? milestone.amount : 0n)
    void writeContract({
      address: MILESTONE_ESCROW_ADDRESS, abi: MILESTONE_ESCROW_ABI,
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

  const handleClaimAfterExpiry = (index: number) => {
    if (!ensureChain()) return
    void writeContract({
      address: MILESTONE_ESCROW_ADDRESS, abi: MILESTONE_ESCROW_ABI,
      functionName: 'claimAfterReviewExpiry', args: [agreementId, BigInt(index)], chainId: ARC_TESTNET_ID,
    }, {
      onSuccess: (hash) => {
        recordTx(hash, `Claimed milestone ${index + 1} after review expiry`)
        toast.success('Payment credited — review window elapsed.')
        void refetch(); void refetchWithdrawal()
      },
      onError: (e) => toast.error(parseOnchainError(e)),
    })
  }

  const handleWithdraw = () => {
    if (!ensureChain()) return
    void writeWithdraw({
      address: MILESTONE_ESCROW_ADDRESS, abi: MILESTONE_ESCROW_ABI,
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

  type MilestoneShape = { state: number }
  const milestones: MilestoneShape[] = ag.milestones as MilestoneShape[]
  const done = milestones.filter((m) => m.state === MilestoneState.CLAIMED || m.state === MilestoneState.RESOLVED).length
  const progressPct = milestones.length > 0 ? Math.round((done / milestones.length) * 100) : 0

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
              <AgreementStateBadge state={ag.state as number} />
              <span className="text-slate-600 text-xs mono">#{agreementId.toString()}</span>
              <button
                onClick={() => void refetch()}
                className="ml-auto text-slate-600 hover:text-slate-300 transition-colors p-1 rounded"
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
            </div>
            <h1 className="display text-2xl font-bold text-white truncate" style={{ letterSpacing: '-0.02em' }}>
              {ag.title as string}
            </h1>
            {ag.description && (
              <p className="text-slate-500 text-sm mt-1 text-pretty">{ag.description as string}</p>
            )}
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
              <div className="text-emerald-300 font-semibold text-sm">Claimable Balance</div>
              <div className="text-white font-bold tabular-nums">
                {formatUsdcDisplay(pendingWithdrawal)} USDC ready to withdraw
              </div>
            </div>
            <TxButton
              variant="success" size="sm"
              onClick={handleWithdraw}
              loading={withdrawPending || withdrawConfirming}
              loadingText="Withdrawing..."
            >
              <Download className="w-4 h-4" />Withdraw
            </TxButton>
          </motion.div>
        )}

        {/* Stats row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
          <StatMini label="Total" value={`${formatUsdcDisplay(ag.totalAmount as bigint)} USDC`} accent />
          <StatMini label="Paid Out" value={`${formatUsdcDisplay(ag.totalPaid as bigint)} USDC`} />
          <StatMini label="Milestones" value={`${(milestones.length)}`} />
          <StatMini label="Progress" value={`${progressPct}%`} />
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
              initial={{ width: 0 }}
              animate={{ width: `${progressPct}%` }}
              transition={{ duration: 0.9, ease: 'easeOut' }}
            />
          </div>
        </GlassCard>

        {/* Parties */}
        <GlassCard className="p-5 mb-8">
          <h2 className="text-white font-semibold text-sm mb-4">Parties</h2>
          <div className="grid sm:grid-cols-3 gap-4">
            <PartyRow label="Client" address={ag.client as string} tag={isClient ? 'You' : undefined} />
            <PartyRow label="Freelancer" address={ag.freelancer as string} tag={isFreelancer ? 'You' : undefined} />
            <PartyRow label="Resolver" address={ag.resolver as string} tag={isResolver ? 'You' : undefined} />
          </div>
        </GlassCard>

        {/* Milestone Timeline */}
        <h2 className="text-white font-semibold mb-4">Milestone Timeline</h2>
        <MilestoneTimeline
          milestones={ag.milestones as Parameters<typeof MilestoneTimeline>[0]['milestones']}
          agreementActive={(ag.state as number) === AgreementState.ACTIVE}
          isClient={isClient}
          isFreelancer={isFreelancer}
          isResolver={isResolver}
          isPending={isPending}
          isConfirming={isConfirming}
          activeModal={activeModal}
          deliverableRef={deliverableRef}
          disputeReason={disputeReason}
          resolverFreelancerAmount={resolverFreelancerAmount}
          resolverNote={resolverNote}
          onDeliverableRefChange={setDeliverableRef}
          onDisputeReasonChange={setDisputeReason}
          onResolverFreelancerAmountChange={setResolverFreelancerAmount}
          onResolverNoteChange={setResolverNote}
          onSetActiveModal={setActiveModal}
          onSubmit={handleSubmit}
          onApprove={handleApprove}
          onClaim={handleClaim}
          onDispute={handleDispute}
          onResolve={handleResolve}
          onClaimAfterExpiry={handleClaimAfterExpiry}
        />

        {/* Transaction history */}
        {txLabels.length > 0 && lastTxHash && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="mt-6 rounded-xl border border-white/[0.07] bg-white/[0.02] overflow-hidden"
          >
            <div className="px-4 py-3 border-b border-white/[0.05] flex items-center justify-between">
              <span className="text-slate-500 text-xs font-semibold uppercase tracking-wider">Transactions</span>
              <a
                href={buildTxExplorerUrl(ARC_TESTNET_ID, lastTxHash)}
                target="_blank"
                rel="noopener noreferrer"
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
          target="_blank"
          rel="noopener noreferrer"
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
