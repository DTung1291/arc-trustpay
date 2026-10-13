import { useMemo, useState } from 'react'
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useSwitchChain } from 'wagmi'
import { toast } from 'sonner'
import { motion } from 'framer-motion'
import { Send, Download, Clock, CheckCircle2, AlertTriangle, ArrowRight, Briefcase } from 'lucide-react'
import { useAgreementsByFreelancer, useMultipleAgreements, usePendingWithdrawal } from '@/hooks/useEscrow'
import { formatUsdcDisplay, formatDate, parseOnchainError } from '@/utils/format'
import { MILESTONE_ESCROW_ADDRESS, MILESTONE_ESCROW_ABI, USDC_ADDRESS, ARC_TESTNET_ID, MilestoneState, AgreementState } from '@/contract'
import { MilestoneStateBadge } from './ui/StatusBadge'
import { TxButton } from './ui/TxButton'
import { GlassCard } from './ui/GlassCard'
import { EmptyState } from './ui/EmptyState'
import { NetworkGuard } from './ui/NetworkGuard'

interface Props {
  onViewAgreement: (id: bigint) => void
}

export function FreelancerWorkspace({ onViewAgreement }: Props) {
  const { address, chainId } = useAccount()
  const { switchChain } = useSwitchChain()
  const { data: ids = [], refetch } = useAgreementsByFreelancer(address)
  const { data: pendingWithdrawalRaw, refetch: refetchWithdrawal } = usePendingWithdrawal(address)
  const pendingWithdrawal = pendingWithdrawalRaw as bigint | undefined
  const { data: agreementsRaw } = useMultipleAgreements(ids as bigint[])

  const [deliverableRef, setDeliverableRef] = useState('')
  const [activeSubmit, setActiveSubmit] = useState<{ agId: bigint; mIdx: number } | null>(null)

  const { writeContract, data: txHash, isPending } = useWriteContract()
  const { isLoading: isConfirming } = useWaitForTransactionReceipt({ hash: txHash })
  const { writeContract: writeWithdraw, data: withdrawHash, isPending: withdrawPending } = useWriteContract()
  const { isLoading: withdrawConfirming } = useWaitForTransactionReceipt({ hash: withdrawHash })

  const agreements = useMemo(() => {
    if (!agreementsRaw) return []
    return agreementsRaw
      .map((r, i) => ({ id: (ids as bigint[])[i], data: r.result as any }))
      .filter((r) => !!r.data && r.data.state === AgreementState.ACTIVE)
  }, [agreementsRaw, ids])

  // Flatten actionable milestones
  type MilestoneEntry = { state: number; amount: bigint; title: string; dueDate: bigint }
  type AgreementEntry = { id: bigint; data: Record<string, unknown> }

  const actionable = useMemo(() => {
    return agreements.flatMap(({ id, data: ag }: AgreementEntry) =>
      (ag.milestones as MilestoneEntry[]).map((m, i: number) => ({ agId: id, agTitle: ag.title as string, mIdx: i, milestone: m }))
        .filter(({ milestone }) => milestone.state === MilestoneState.PENDING || milestone.state === MilestoneState.APPROVED)
    )
  }, [agreements])

  const claimable = useMemo(() => {
    return agreements.flatMap(({ id, data: ag }: AgreementEntry) =>
      (ag.milestones as MilestoneEntry[]).map((m, i: number) => ({ agId: id, agTitle: ag.title as string, mIdx: i, milestone: m }))
        .filter(({ milestone }) => milestone.state === MilestoneState.APPROVED)
    )
  }, [agreements])

  const handleSubmit = (agId: bigint, mIdx: number) => {
    if (chainId !== ARC_TESTNET_ID) { switchChain({ chainId: ARC_TESTNET_ID }); return }
    if (!deliverableRef.trim()) { toast.error('Please enter a deliverable reference.'); return }
    void writeContract({
      address: MILESTONE_ESCROW_ADDRESS,
      abi: MILESTONE_ESCROW_ABI,
      functionName: 'submitMilestone',
      args: [agId, BigInt(mIdx), deliverableRef.trim()],
      chainId: ARC_TESTNET_ID,
    }, {
      onSuccess: () => {
        toast.success('Milestone submitted for review.')
        setDeliverableRef('')
        setActiveSubmit(null)
        refetch()
      },
      onError: (e) => toast.error(parseOnchainError(e)),
    })
  }

  const handleClaim = (agId: bigint, mIdx: number) => {
    if (chainId !== ARC_TESTNET_ID) { switchChain({ chainId: ARC_TESTNET_ID }); return }
    void writeContract({
      address: MILESTONE_ESCROW_ADDRESS,
      abi: MILESTONE_ESCROW_ABI,
      functionName: 'claimMilestone',
      args: [agId, BigInt(mIdx)],
      chainId: ARC_TESTNET_ID,
    }, {
      onSuccess: () => {
        toast.success('Payment credited. Visit the agreement to withdraw.')
        refetch()
        refetchWithdrawal()
      },
      onError: (e) => toast.error(parseOnchainError(e)),
    })
  }

  const handleWithdraw = () => {
    if (chainId !== ARC_TESTNET_ID) { switchChain({ chainId: ARC_TESTNET_ID }); return }
    void writeWithdraw({
      address: MILESTONE_ESCROW_ADDRESS,
      abi: MILESTONE_ESCROW_ABI,
      functionName: 'withdraw',
      args: [USDC_ADDRESS],
      chainId: ARC_TESTNET_ID,
    }, {
      onSuccess: () => { toast.success('USDC withdrawn to your wallet.'); refetchWithdrawal() },
      onError: (e) => toast.error(parseOnchainError(e)),
    })
  }

  return (
    <NetworkGuard>
      <div className="max-w-3xl mx-auto px-4 py-10">
        <div className="mb-8">
          <h1 className="display text-3xl font-bold text-white" style={{ letterSpacing: '-0.02em' }}>Workspace</h1>
          <p className="text-slate-500 text-sm mt-1">Your active assignments and deliverables</p>
        </div>

        {/* Claimable banner */}
        {pendingWithdrawal !== undefined && pendingWithdrawal > 0n && (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
            className="mb-6 rounded-xl border border-emerald-500/30 bg-emerald-500/5 px-5 py-4 flex items-center justify-between gap-4">
            <div>
              <div className="text-emerald-300 font-semibold text-sm">Earnings Available</div>
              <div className="text-white font-bold tabular-nums">{formatUsdcDisplay(pendingWithdrawal)} USDC</div>
            </div>
            <TxButton variant="success" size="sm" onClick={handleWithdraw} loading={withdrawPending || withdrawConfirming} loadingText="Withdrawing...">
              <Download className="w-4 h-4" />Withdraw
            </TxButton>
          </motion.div>
        )}

        {/* Stats row */}
        <div className="grid grid-cols-3 gap-3 mb-8">
          <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-4 text-center">
            <div className="text-white font-bold text-2xl tabular-nums">{agreements.length}</div>
            <div className="text-slate-500 text-xs mt-1">Active Projects</div>
          </div>
          <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-4 text-center">
            <div className="text-cyan-400 font-bold text-2xl tabular-nums">{actionable.length}</div>
            <div className="text-slate-500 text-xs mt-1">Pending Action</div>
          </div>
          <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-4 text-center">
            <div className="text-emerald-400 font-bold text-2xl tabular-nums">{claimable.length}</div>
            <div className="text-slate-500 text-xs mt-1">Ready to Claim</div>
          </div>
        </div>

        {agreements.length === 0 ? (
          <EmptyState icon={Briefcase} title="No active assignments" description="You have no active freelance agreements yet. Share your wallet address with a client to get started." />
        ) : (
          <div className="space-y-4">
            {(agreements as AgreementEntry[]).map(({ id, data: ag }) => (
              <GlassCard key={id.toString()} className="p-5">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-white font-semibold">{ag.title as string}</h3>
                    <div className="text-slate-500 text-xs mt-0.5">Agreement #{id.toString()}</div>
                  </div>
                  <button onClick={() => onViewAgreement(id)} className="text-slate-500 hover:text-slate-200 transition-colors">
                    <ArrowRight className="w-5 h-5" />
                  </button>
                </div>

                <div className="space-y-2">
                  {(ag.milestones as MilestoneEntry[]).map((m, i: number) => (
                    <div key={i} className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                        <div className="flex items-center gap-2">
                          <div className="w-5 h-5 rounded-md bg-violet-500/20 border border-violet-500/30 flex items-center justify-center text-violet-300 text-xs font-bold">{i + 1}</div>
                          <span className="text-slate-200 text-sm font-medium">{m.title}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-white font-semibold tabular-nums text-sm">{formatUsdcDisplay(m.amount)} USDC</span>
                          <MilestoneStateBadge state={m.state} />
                        </div>
                      </div>

                      {m.dueDate > 0n && (
                        <div className="flex items-center gap-1 text-xs text-slate-600 mb-2">
                          <Clock className="w-3 h-3" />Due {formatDate(m.dueDate)}
                        </div>
                      )}

                      {/* Submit action */}
                      {m.state === MilestoneState.PENDING && (
                        activeSubmit?.agId === id && activeSubmit?.mIdx === i ? (
                          <div className="space-y-2 mt-1">
                            <input
                              className="input-base text-sm"
                              placeholder="IPFS hash or deliverable URL..."
                              value={deliverableRef}
                              onChange={(e) => setDeliverableRef(e.target.value)}
                            />
                            <div className="flex gap-2">
                              <TxButton variant="ghost" size="sm" onClick={() => setActiveSubmit(null)}>Cancel</TxButton>
                              <TxButton size="sm" onClick={() => handleSubmit(id, i)} loading={isPending || isConfirming} loadingText="Submitting...">
                                <Send className="w-4 h-4" />Submit
                              </TxButton>
                            </div>
                          </div>
                        ) : (
                          <TxButton size="sm" onClick={() => setActiveSubmit({ agId: id, mIdx: i })}>
                            <Send className="w-4 h-4" />Submit Deliverable
                          </TxButton>
                        )
                      )}

                      {/* Claim action */}
                      {m.state === MilestoneState.APPROVED && (
                        <TxButton variant="success" size="sm" onClick={() => handleClaim(id, i)} loading={isPending || isConfirming} loadingText="Claiming...">
                          <Download className="w-4 h-4" />Claim {formatUsdcDisplay(m.amount)} USDC
                        </TxButton>
                      )}

                      {m.state === MilestoneState.SUBMITTED && (
                        <div className="flex items-center gap-1.5 text-xs text-cyan-400">
                          <Clock className="w-3.5 h-3.5" />Awaiting client review
                        </div>
                      )}

                      {m.state === MilestoneState.DISPUTED && (
                        <div className="flex items-center gap-1.5 text-xs text-amber-400">
                          <AlertTriangle className="w-3.5 h-3.5" />Under dispute — awaiting resolver
                        </div>
                      )}

                      {(m.state === MilestoneState.CLAIMED || m.state === MilestoneState.RESOLVED) && (
                        <div className="flex items-center gap-1.5 text-xs text-emerald-400">
                          <CheckCircle2 className="w-3.5 h-3.5" />Complete
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </GlassCard>
            ))}
          </div>
        )}
      </div>
    </NetworkGuard>
  )
}


