import { useMemo, useState } from 'react'
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useSwitchChain } from 'wagmi'
import { toast } from 'sonner'
import { motion } from 'framer-motion'
import { Shield, AlertTriangle, CheckCircle2, Scale } from 'lucide-react'
import { useAgreementsByClient, useAgreementsByFreelancer, useMultipleAgreements } from '@/hooks/useEscrow'
import { formatUsdcDisplay, formatAddress, parseOnchainError } from '@/utils/format'
import { MILESTONE_ESCROW_ADDRESS, MILESTONE_ESCROW_ABI, ARC_TESTNET_ID, MilestoneState } from '@/contract'
import { TxButton } from './ui/TxButton'
import { GlassCard } from './ui/GlassCard'
import { EmptyState } from './ui/EmptyState'
import { NetworkGuard } from './ui/NetworkGuard'

interface Props {
  onViewAgreement: (id: bigint) => void
}

export function DisputeCenter({ onViewAgreement }: Props) {
  const { address, chainId } = useAccount()
  const { switchChain } = useSwitchChain()

  const { data: clientIds = [] } = useAgreementsByClient(address)
  const { data: freelancerIds = [] } = useAgreementsByFreelancer(address)

  const allIds = useMemo(() => {
    const set = new Set<string>()
    const result: bigint[] = []
    for (const id of [...(clientIds as bigint[]), ...(freelancerIds as bigint[])]) {
      if (!set.has(id.toString())) {
        set.add(id.toString())
        result.push(id)
      }
    }
    return result
  }, [clientIds, freelancerIds])

  const { data: agreementsRaw, refetch } = useMultipleAgreements(allIds)

  const [resolverFreelancerAmount, setResolverFreelancerAmount] = useState<Record<string, string>>({})
  const [resolverNote, setResolverNote] = useState<Record<string, string>>({})

  const { writeContract, data: txHash, isPending } = useWriteContract()
  const { isLoading: isConfirming } = useWaitForTransactionReceipt({ hash: txHash })

  const disputes = useMemo(() => {
    if (!agreementsRaw) return []
    return agreementsRaw
      .map((r, i) => ({ id: allIds[i], data: r.result as any }))
      .filter((r) => !!r.data)
      .flatMap(({ id, data: ag }) =>
        (ag.milestones as any[])
          .map((m: any, i: number) => ({ agId: id, agTitle: ag.title, mIdx: i, milestone: m, ag }))
          .filter(({ milestone }) => milestone.state === MilestoneState.DISPUTED)
      )
  }, [agreementsRaw, allIds])

  const handleResolve = (agId: bigint, mIdx: number, milestone: any, awardToFreelancer: boolean) => {
    if (chainId !== ARC_TESTNET_ID) { switchChain({ chainId: ARC_TESTNET_ID }); return }
    const key = `${agId}-${mIdx}`
    const freelancerAmt = resolverFreelancerAmount[key]
    const amount = freelancerAmt
      ? BigInt(Math.round(parseFloat(freelancerAmt) * 1_000_000))
      : (awardToFreelancer ? milestone.amount : 0n)
    const note = resolverNote[key] || 'Resolved.'

    void writeContract({
      address: MILESTONE_ESCROW_ADDRESS,
      abi: MILESTONE_ESCROW_ABI,
      functionName: 'resolveDispute',
      args: [agId, BigInt(mIdx), awardToFreelancer, amount, note],
      chainId: ARC_TESTNET_ID,
    }, {
      onSuccess: () => {
        toast.success('Dispute resolved.')
        void refetch()
      },
      onError: (e) => toast.error(parseOnchainError(e)),
    })
  }

  const isResolver = (ag: any) => address?.toLowerCase() === ag.resolver?.toLowerCase()
  const isClient = (ag: any) => address?.toLowerCase() === ag.client?.toLowerCase()
  const isFreelancer = (ag: any) => address?.toLowerCase() === ag.freelancer?.toLowerCase()

  return (
    <NetworkGuard>
      <div className="max-w-3xl mx-auto px-4 py-10">
        <div className="flex items-center gap-3 mb-8">
          <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
            <Scale className="w-5 h-5 text-amber-400" />
          </div>
          <div>
            <h1 className="display text-2xl font-bold text-white" style={{ letterSpacing: '-0.02em' }}>Dispute Center</h1>
            <p className="text-slate-500 text-sm">Open disputes across your agreements</p>
          </div>
        </div>

        {/* Info box */}
        <GlassCard className="p-4 mb-6">
          <div className="flex gap-3">
            <Shield className="w-5 h-5 text-slate-400 shrink-0 mt-0.5" />
            <div className="text-slate-400 text-sm leading-relaxed">
              Disputes are resolved by the designated resolver set when the agreement was created. The resolver is a trust assumption — no onchain verification of subjective work quality is possible.
            </div>
          </div>
        </GlassCard>

        {disputes.length === 0 ? (
          <EmptyState
            icon={CheckCircle2}
            title="No open disputes"
            description="All your agreements are running smoothly. Disputes appear here when a client raises one on a submitted milestone."
          />
        ) : (
          <div className="space-y-4">
            {disputes.map(({ agId, agTitle, mIdx, milestone, ag }, i) => {
              const key = `${agId}-${mIdx}`
              const canResolve = isResolver(ag)
              return (
                <motion.div key={key} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
                  <GlassCard className="p-5" accent="amber">
                    {/* Header */}
                    <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
                      <div>
                        <div className="text-amber-400 text-xs font-semibold uppercase tracking-wider mb-1 flex items-center gap-1.5">
                          <AlertTriangle className="w-3.5 h-3.5" />Disputed Milestone
                        </div>
                        <div className="text-white font-semibold">{milestone.title}</div>
                        <div className="text-slate-500 text-xs mt-0.5">{agTitle} — Agreement #{agId.toString()}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-white font-bold tabular-nums">{formatUsdcDisplay(milestone.amount)} USDC</div>
                        <div className="text-slate-500 text-xs">at stake</div>
                      </div>
                    </div>

                    {/* Dispute reason */}
                    <div className="rounded-lg bg-amber-500/5 border border-amber-500/20 px-4 py-3 mb-4">
                      <div className="text-amber-400 text-xs font-semibold mb-1">Client Dispute Reason</div>
                      <p className="text-amber-300/80 text-sm">{milestone.disputeReason || 'No reason provided.'}</p>
                    </div>

                    {/* Deliverable ref */}
                    {milestone.deliverableRef && (
                      <div className="rounded-lg bg-white/[0.03] border border-white/[0.06] px-4 py-3 mb-4">
                        <div className="text-slate-500 text-xs font-semibold mb-1">Freelancer Deliverable</div>
                        <p className="mono text-cyan-400 text-xs break-all">{milestone.deliverableRef}</p>
                      </div>
                    )}

                    {/* Parties */}
                    <div className="grid grid-cols-3 gap-3 mb-4 text-xs">
                      <div>
                        <div className="text-slate-600 mb-1">Client</div>
                        <span className="mono text-slate-400">{formatAddress(ag.client)}</span>
                        {isClient(ag) && <span className="text-violet-400 ml-1 font-semibold">You</span>}
                      </div>
                      <div>
                        <div className="text-slate-600 mb-1">Freelancer</div>
                        <span className="mono text-slate-400">{formatAddress(ag.freelancer)}</span>
                        {isFreelancer(ag) && <span className="text-violet-400 ml-1 font-semibold">You</span>}
                      </div>
                      <div>
                        <div className="text-slate-600 mb-1">Resolver</div>
                        <span className="mono text-slate-400">{formatAddress(ag.resolver)}</span>
                        {canResolve && <span className="text-amber-400 ml-1 font-semibold">You</span>}
                      </div>
                    </div>

                    {/* Resolver actions */}
                    {canResolve && (
                      <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 space-y-3">
                        <div className="text-amber-300 font-semibold text-sm">Your Resolution</div>
                        <div className="grid sm:grid-cols-2 gap-3">
                          <div>
                            <label className="text-xs text-slate-500 mb-1 block">Freelancer award (USDC)</label>
                            <input
                              className="input-base text-sm"
                              placeholder={`0 – ${formatUsdcDisplay(milestone.amount)}`}
                              value={resolverFreelancerAmount[key] ?? ''}
                              onChange={(e) => setResolverFreelancerAmount((p) => ({ ...p, [key]: e.target.value }))}
                            />
                          </div>
                          <div>
                            <label className="text-xs text-slate-500 mb-1 block">Resolution note</label>
                            <input
                              className="input-base text-sm"
                              placeholder="Explain your decision..."
                              value={resolverNote[key] ?? ''}
                              onChange={(e) => setResolverNote((p) => ({ ...p, [key]: e.target.value }))}
                            />
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <TxButton
                            variant="success"
                            size="sm"
                            onClick={() => handleResolve(agId, mIdx, milestone, true)}
                            loading={isPending || isConfirming}
                            loadingText="Resolving..."
                          >
                            Award Freelancer
                          </TxButton>
                          <TxButton
                            variant="secondary"
                            size="sm"
                            onClick={() => handleResolve(agId, mIdx, milestone, false)}
                            loading={isPending || isConfirming}
                            loadingText="Resolving..."
                          >
                            Refund Client
                          </TxButton>
                        </div>
                      </div>
                    )}

                    {!canResolve && (
                      <div className="text-slate-600 text-xs">Waiting for resolver ({formatAddress(ag.resolver)}) to act.</div>
                    )}

                    <button
                      onClick={() => onViewAgreement(agId)}
                      className="mt-3 text-xs text-slate-500 hover:text-slate-300 transition-colors"
                    >
                      View full agreement →
                    </button>
                  </GlassCard>
                </motion.div>
              )
            })}
          </div>
        )}
      </div>
    </NetworkGuard>
  )
}
