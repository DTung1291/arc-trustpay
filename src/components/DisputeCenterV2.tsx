/**
 * DisputeCenterV2 — enhanced dispute management for both V1 and V2 agreements.
 *
 * Financial settlement is enforced entirely by the onchain contracts:
 *   - disputeMilestone() transitions state to DISPUTED (blocks auto-release & normal approval)
 *   - resolveDispute() is the only path to release disputed funds; only the designated resolver can call it
 *   - Double-payout, reentrancy, and aggregate-payout guards are in the contract
 *
 * Evidence links and party statements are advisory UI only — they help the resolver
 * make an informed decision but are not stored onchain (to protect privacy).
 * The contracts emit MilestoneDisputed and DisputeResolved events that constitute
 * the immutable onchain record.
 *
 * Fallback for unavailable resolver: documented in the disclaimer. Funds remain
 * locked until the resolver acts. No unilateral recovery power is implemented here.
 */

import { useMemo, useState } from 'react'
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useSwitchChain } from 'wagmi'
import { toast } from 'sonner'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Scale, Shield, AlertTriangle, CheckCircle2, Clock,
  Plus, Trash2, Link2, FileText, User, Users, ChevronDown, ChevronUp, ExternalLink,
} from 'lucide-react'
import { useAgreementsByClient, useAgreementsByFreelancer, useMultipleAgreements } from '@/hooks/useEscrow'
import { useAgreementsByClientV2, useAgreementsByFreelancerV2, useMultipleAgreementsV2 } from '@/hooks/useEscrowV2'
import {
  MILESTONE_ESCROW_ADDRESS, MILESTONE_ESCROW_ABI,
  ARC_TESTNET_ID, MilestoneState,
} from '@/contract'
import {
  MILESTONE_ESCROW_V2_ADDRESS, MILESTONE_ESCROW_V2_ABI,
  MilestoneStateV2,
} from '@/contractV2'
import { formatUsdcDisplay, formatAddress, parseOnchainError } from '@/utils/format'
import { buildTxExplorerUrl } from '@/onchain-facts'
import { TxButton } from './ui/TxButton'
import { GlassCard } from './ui/GlassCard'
import { EmptyState } from './ui/EmptyState'
import { NetworkGuard } from './ui/NetworkGuard'

interface Props {
  onViewAgreement: (id: bigint, version?: 'v1' | 'v2') => void
}

// Dispute workflow phases (frontend advisory — financial state lives onchain)
type DisputePhase = 'open' | 'evidence' | 'review' | 'resolved'

interface EvidenceLink {
  url: string
  label: string
}

interface DisputeCase {
  agId: bigint
  agTitle: string
  mIdx: number
  milestone: Record<string, unknown>
  ag: Record<string, unknown>
  contractVersion: 'V1' | 'V2'
}

// Per-dispute local state (evidence + statements — offchain UI layer)
type DisputeLocalState = {
  phase: DisputePhase
  clientStatement: string
  freelancerStatement: string
  clientLinks: EvidenceLink[]
  freelancerLinks: EvidenceLink[]
  newClientLink: string
  newClientLinkLabel: string
  newFreelancerLink: string
  newFreelancerLinkLabel: string
}

function defaultLocal(): DisputeLocalState {
  return {
    phase: 'evidence',
    clientStatement: '',
    freelancerStatement: '',
    clientLinks: [],
    freelancerLinks: [],
    newClientLink: '',
    newClientLinkLabel: '',
    newFreelancerLink: '',
    newFreelancerLinkLabel: '',
  }
}

const PHASES: { id: DisputePhase; label: string }[] = [
  { id: 'open', label: 'Opened' },
  { id: 'evidence', label: 'Evidence' },
  { id: 'review', label: 'Under Review' },
  { id: 'resolved', label: 'Resolved' },
]

function PhaseBreadcrumb({ current }: { current: DisputePhase }) {
  const idx = PHASES.findIndex((p) => p.id === current)
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {PHASES.map((p, i) => (
        <div key={p.id} className="flex items-center gap-1.5">
          <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border transition-all ${i <= idx ? 'border-violet-500/30 bg-violet-500/10 text-violet-300' : 'border-white/[0.06] bg-white/[0.02] text-slate-600'}`}>
            {i < idx && <CheckCircle2 className="w-3 h-3" />}
            {i === idx && <div className="w-2 h-2 rounded-full bg-violet-400 animate-pulse" />}
            {p.label}
          </div>
          {i < PHASES.length - 1 && <div className="w-3 h-px bg-white/[0.1]" />}
        </div>
      ))}
    </div>
  )
}

export function DisputeCenterV2({ onViewAgreement }: Props) {
  const { address, chainId: walletChainId } = useAccount()
  const { switchChain } = useSwitchChain()

  // Load from both V1 and V2
  const { data: clientIdsV1 = [] } = useAgreementsByClient(address)
  const { data: freelancerIdsV1 = [] } = useAgreementsByFreelancer(address)
  const { data: clientIdsV2 = [] } = useAgreementsByClientV2(address)
  const { data: freelancerIdsV2 = [] } = useAgreementsByFreelancerV2(address)

  const v1Ids = useMemo(() => {
    const seen = new Set<string>()
    const out: bigint[] = []
    for (const id of [...(clientIdsV1 as bigint[]), ...(freelancerIdsV1 as bigint[])]) {
      const k = id.toString()
      if (!seen.has(k)) { seen.add(k); out.push(id) }
    }
    return out
  }, [clientIdsV1, freelancerIdsV1])

  const v2Ids = useMemo(() => {
    const seen = new Set<string>()
    const out: bigint[] = []
    for (const id of [...(clientIdsV2 as bigint[]), ...(freelancerIdsV2 as bigint[])]) {
      const k = id.toString()
      if (!seen.has(k)) { seen.add(k); out.push(id) }
    }
    return out
  }, [clientIdsV2, freelancerIdsV2])

  const { data: v1Data, refetch: refetchV1 } = useMultipleAgreements(v1Ids)
  const { data: v2Data, refetch: refetchV2 } = useMultipleAgreementsV2(v2Ids)

  const refetch = () => { void refetchV1(); void refetchV2() }

  const disputes = useMemo((): DisputeCase[] => {
    const out: DisputeCase[] = []

    if (v1Data) {
      v1Data.forEach((r, i) => {
        const ag = r.result as Record<string, unknown> | undefined
        if (!ag) return
        const ms = (ag['milestones'] as unknown[]) ?? []
        ms.forEach((m, mIdx) => {
          const milestone = m as Record<string, unknown>
          if (milestone['state'] === MilestoneState.DISPUTED) {
            out.push({ agId: v1Ids[i], agTitle: typeof ag['title'] === 'string' ? ag['title'] : '', mIdx, milestone, ag, contractVersion: 'V1' })
          }
        })
      })
    }

    if (v2Data) {
      v2Data.forEach((r, i) => {
        const ag = r.result as Record<string, unknown> | undefined
        if (!ag) return
        const ms = (ag['milestones'] as unknown[]) ?? []
        ms.forEach((m, mIdx) => {
          const milestone = m as Record<string, unknown>
          if (milestone['state'] === MilestoneStateV2.DISPUTED) {
            out.push({ agId: v2Ids[i], agTitle: typeof ag['title'] === 'string' ? ag['title'] : '', mIdx, milestone, ag, contractVersion: 'V2' })
          }
        })
      })
    }

    return out
  }, [v1Data, v2Data, v1Ids, v2Ids])

  // Per-dispute local state
  const [localStates, setLocalStates] = useState<Record<string, DisputeLocalState>>({})
  const getLocal = (key: string): DisputeLocalState => localStates[key] ?? defaultLocal()
  const setLocal = (key: string, patch: Partial<DisputeLocalState>) =>
    setLocalStates((prev) => ({ ...prev, [key]: { ...getLocal(key), ...patch } }))

  // Resolution inputs
  const [resolverAmt, setResolverAmt] = useState<Record<string, string>>({})
  const [resolverNote, setResolverNote] = useState<Record<string, string>>({})
  const [expanded, setExpanded] = useState<string | null>(null)

  const { writeContract, data: txHash, isPending } = useWriteContract()
  const { isLoading: isConfirming } = useWaitForTransactionReceipt({ hash: txHash })



  const handleResolve = (dc: DisputeCase, awardToFreelancer: boolean) => {
    if (walletChainId !== ARC_TESTNET_ID) { void switchChain({ chainId: ARC_TESTNET_ID }); return }
    const key = `${dc.contractVersion}-${dc.agId}-${dc.mIdx}`
    const rawAmt = resolverAmt[key]
    const milestoneAmt = dc.milestone['amount'] as bigint
    const amount = rawAmt
      ? BigInt(Math.round(parseFloat(rawAmt) * 1_000_000))
      : (awardToFreelancer ? milestoneAmt : 0n)
    const note = resolverNote[key] || 'Resolved by designated resolver.'

    const abi = dc.contractVersion === 'V2' ? MILESTONE_ESCROW_V2_ABI : MILESTONE_ESCROW_ABI
    const addr = dc.contractVersion === 'V2' ? MILESTONE_ESCROW_V2_ADDRESS : MILESTONE_ESCROW_ADDRESS

    void writeContract({
      address: addr,
      abi,
      functionName: 'resolveDispute',
      args: [dc.agId, BigInt(dc.mIdx), awardToFreelancer, amount, note],
      chainId: ARC_TESTNET_ID,
    }, {
      onSuccess: () => {
        toast.success('Dispute resolved.')
        setLocal(key, { phase: 'resolved' })
        void refetch()
      },
      onError: (e) => toast.error(parseOnchainError(e)),
    })
  }

  return (
    <NetworkGuard>
      <div className="max-w-3xl mx-auto px-4 py-10">
        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
            <Scale className="w-5 h-5 text-amber-400" />
          </div>
          <div>
            <h1 className="display text-2xl font-bold text-white" style={{ letterSpacing: '-0.02em' }}>Dispute Center</h1>
            <p className="text-slate-500 text-sm">Active disputes across V1 and V2 agreements</p>
          </div>
        </div>

        {/* Info / Security disclaimer */}
        <GlassCard className="p-4 mb-6">
          <div className="flex gap-3">
            <Shield className="w-5 h-5 text-slate-400 shrink-0 mt-0.5" />
            <div className="text-slate-400 text-sm leading-relaxed space-y-1">
              <p>Settlement is enforced entirely onchain. Only the resolver named in the original agreement can call <code className="mono text-xs text-slate-300">resolveDispute</code>. Disputed funds cannot be auto-released or claimed via the normal approval path.</p>
              <p className="text-slate-500 text-xs">Evidence links and statements added here are advisory only — they are not stored onchain and are visible only in this browser session. The onchain record is the <code className="mono text-xs">MilestoneDisputed</code> and <code className="mono text-xs">DisputeResolved</code> events.</p>
              <p className="text-slate-500 text-xs">If the resolver is permanently unavailable, funds remain locked. No unilateral recovery mechanism exists by design. Choose a reliable resolver before funding.</p>
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
            {disputes.map((dc) => {
              const key = `${dc.contractVersion}-${dc.agId}-${dc.mIdx}`
              const local = getLocal(key)
              const isOpen = expanded === key
              const agResolver = typeof dc.ag['resolver'] === 'string' ? dc.ag['resolver'] : ''
              const agClient = typeof dc.ag['client'] === 'string' ? dc.ag['client'] : ''
              const agFreelancer = typeof dc.ag['freelancer'] === 'string' ? dc.ag['freelancer'] : ''
              const isResolver = address?.toLowerCase() === agResolver.toLowerCase()
              const isClient = address?.toLowerCase() === agClient.toLowerCase()
              const isFreelancer = address?.toLowerCase() === agFreelancer.toLowerCase()
              const milestoneAmt = dc.milestone['amount'] as bigint

              return (
                <motion.div key={key} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
                  <GlassCard className="overflow-hidden" accent="amber">
                    {/* Summary row */}
                    <button
                      className="w-full flex items-start justify-between gap-4 p-5 text-left hover:bg-white/[0.02] transition-colors"
                      onClick={() => setExpanded(isOpen ? null : key)}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2 mb-1.5">
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold border border-amber-500/30 bg-amber-500/10 text-amber-300">
                            <AlertTriangle className="w-3 h-3" />DISPUTED
                          </span>
                          <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold border ${dc.contractVersion === 'V2' ? 'border-violet-400/20 bg-violet-400/5 text-violet-400' : 'border-slate-600/30 bg-slate-600/10 text-slate-500'}`}>
                            {dc.contractVersion}
                          </span>
                          {isResolver && <span className="text-amber-400 text-xs font-semibold">You are the resolver</span>}
                          {isClient && !isResolver && <span className="text-slate-400 text-xs">You are the client</span>}
                          {isFreelancer && !isResolver && <span className="text-slate-400 text-xs">You are the freelancer</span>}
                        </div>
                        <div className="text-white font-semibold text-sm">{typeof dc.milestone['title'] === 'string' ? dc.milestone['title'] : `Milestone #${dc.mIdx + 1}`}</div>
                        <div className="text-slate-500 text-xs mt-0.5">{dc.agTitle} — Agreement #{dc.agId.toString()}</div>
                        <div className="mt-2">
                          <PhaseBreadcrumb current={local.phase} />
                        </div>
                      </div>
                      <div className="text-right shrink-0 flex flex-col items-end gap-1">
                        <div className="text-white font-bold tabular-nums">{formatUsdcDisplay(milestoneAmt)} USDC</div>
                        <div className="text-amber-400/70 text-xs">at stake</div>
                        {isOpen ? <ChevronUp className="w-4 h-4 text-slate-600 mt-1" /> : <ChevronDown className="w-4 h-4 text-slate-600 mt-1" />}
                      </div>
                    </button>

                    {/* Expanded panel */}
                    <AnimatePresence>
                      {isOpen && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.22 }}
                          className="overflow-hidden border-t border-white/[0.05]"
                        >
                          <div className="p-5 space-y-5">

                            {/* Dispute reason */}
                            <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
                              <div className="text-amber-400 text-xs font-semibold mb-1.5 flex items-center gap-1.5">
                                <AlertTriangle className="w-3.5 h-3.5" />Client Dispute Reason
                              </div>
                              <p className="text-amber-300/80 text-sm text-pretty">
                                {typeof dc.milestone['disputeReason'] === 'string' ? dc.milestone['disputeReason'] : 'No reason provided.'}
                              </p>
                            </div>

                            {/* Deliverable */}
                            {Boolean(dc.milestone['deliverableRef']) && (
                              <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-4">
                                <div className="text-slate-500 text-xs font-semibold mb-1.5 flex items-center gap-1.5">
                                  <FileText className="w-3.5 h-3.5" />Freelancer Deliverable
                                </div>
                                <a
                                  href={String(dc.milestone['deliverableRef']).startsWith('http') ? String(dc.milestone['deliverableRef']) : undefined}
                                  target="_blank" rel="noopener noreferrer"
                                  className="mono text-cyan-400 text-xs break-all hover:text-cyan-300 transition-colors"
                                >
                                  {String(dc.milestone['deliverableRef'])}
                                </a>
                              </div>
                            )}

                            {/* Parties */}
                            <div className="grid grid-cols-3 gap-3 text-xs">
                              {[
                                { label: 'Client', addr: agClient, highlight: isClient },
                                { label: 'Freelancer', addr: agFreelancer, highlight: isFreelancer },
                                { label: 'Resolver', addr: agResolver, highlight: isResolver },
                              ].map(({ label, addr, highlight }) => (
                                <div key={label}>
                                  <div className="text-slate-600 mb-1">{label}</div>
                                  <span className="mono text-slate-400">{formatAddress(addr)}</span>
                                  {highlight && <span className="text-violet-400 ml-1 font-semibold">You</span>}
                                </div>
                              ))}
                            </div>

                            {/* Evidence tabs */}
                            <div className="space-y-3">
                              <div className="text-slate-500 text-xs font-semibold uppercase tracking-wider">Evidence Links</div>

                              {/* Client evidence */}
                              <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-4 space-y-2">
                                <div className="flex items-center gap-2 text-xs font-semibold text-slate-400 mb-2">
                                  <User className="w-3.5 h-3.5" />Client Evidence
                                </div>
                                {local.clientLinks.length === 0 && (
                                  <p className="text-slate-600 text-xs">No evidence links added yet.</p>
                                )}
                                {local.clientLinks.map((link, li) => (
                                  <div key={li} className="flex items-center gap-2">
                                    <Link2 className="w-3 h-3 text-slate-600 shrink-0" />
                                    <a href={link.url} target="_blank" rel="noopener noreferrer" className="text-cyan-400 text-xs truncate hover:text-cyan-300 flex-1">{link.label || link.url}</a>
                                    {isClient && (
                                      <button onClick={() => setLocal(key, { clientLinks: local.clientLinks.filter((_, x) => x !== li) })} className="text-slate-600 hover:text-red-400 transition-colors">
                                        <Trash2 className="w-3.5 h-3.5" />
                                      </button>
                                    )}
                                  </div>
                                ))}
                                {isClient && (
                                  <div className="flex gap-2 mt-2">
                                    <input className="input-base text-xs flex-1" placeholder="URL (GitHub, Figma, demo…)" value={local.newClientLink} onChange={(e) => setLocal(key, { newClientLink: e.target.value })} />
                                    <input className="input-base text-xs w-28" placeholder="Label" value={local.newClientLinkLabel} onChange={(e) => setLocal(key, { newClientLinkLabel: e.target.value })} />
                                    <button
                                      onClick={() => {
                                        if (!local.newClientLink.trim()) return
                                        setLocal(key, {
                                          clientLinks: [...local.clientLinks, { url: local.newClientLink.trim(), label: local.newClientLinkLabel.trim() || local.newClientLink.trim() }],
                                          newClientLink: '',
                                          newClientLinkLabel: '',
                                        })
                                      }}
                                      className="px-2.5 py-1.5 rounded-lg bg-violet-500/20 border border-violet-500/30 text-violet-300 text-xs hover:bg-violet-500/30 transition-colors"
                                    >
                                      <Plus className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                )}
                                {isClient && (
                                  <div className="mt-2">
                                    <textarea
                                      className="input-base w-full min-h-[64px] resize-none text-xs"
                                      placeholder="Your statement for the resolver..."
                                      value={local.clientStatement}
                                      onChange={(e) => setLocal(key, { clientStatement: e.target.value })}
                                    />
                                  </div>
                                )}
                                {!isClient && local.clientStatement && (
                                  <p className="text-slate-400 text-xs text-pretty italic mt-2">&ldquo;{local.clientStatement}&rdquo;</p>
                                )}
                              </div>

                              {/* Freelancer evidence */}
                              <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-4 space-y-2">
                                <div className="flex items-center gap-2 text-xs font-semibold text-slate-400 mb-2">
                                  <Users className="w-3.5 h-3.5" />Freelancer Evidence
                                </div>
                                {local.freelancerLinks.length === 0 && (
                                  <p className="text-slate-600 text-xs">No evidence links added yet.</p>
                                )}
                                {local.freelancerLinks.map((link, li) => (
                                  <div key={li} className="flex items-center gap-2">
                                    <Link2 className="w-3 h-3 text-slate-600 shrink-0" />
                                    <a href={link.url} target="_blank" rel="noopener noreferrer" className="text-cyan-400 text-xs truncate hover:text-cyan-300 flex-1">{link.label || link.url}</a>
                                    {isFreelancer && (
                                      <button onClick={() => setLocal(key, { freelancerLinks: local.freelancerLinks.filter((_, x) => x !== li) })} className="text-slate-600 hover:text-red-400 transition-colors">
                                        <Trash2 className="w-3.5 h-3.5" />
                                      </button>
                                    )}
                                  </div>
                                ))}
                                {isFreelancer && (
                                  <div className="flex gap-2 mt-2">
                                    <input className="input-base text-xs flex-1" placeholder="URL (GitHub, Figma, demo…)" value={local.newFreelancerLink} onChange={(e) => setLocal(key, { newFreelancerLink: e.target.value })} />
                                    <input className="input-base text-xs w-28" placeholder="Label" value={local.newFreelancerLinkLabel} onChange={(e) => setLocal(key, { newFreelancerLinkLabel: e.target.value })} />
                                    <button
                                      onClick={() => {
                                        if (!local.newFreelancerLink.trim()) return
                                        setLocal(key, {
                                          freelancerLinks: [...local.freelancerLinks, { url: local.newFreelancerLink.trim(), label: local.newFreelancerLinkLabel.trim() || local.newFreelancerLink.trim() }],
                                          newFreelancerLink: '',
                                          newFreelancerLinkLabel: '',
                                        })
                                      }}
                                      className="px-2.5 py-1.5 rounded-lg bg-violet-500/20 border border-violet-500/30 text-violet-300 text-xs hover:bg-violet-500/30 transition-colors"
                                    >
                                      <Plus className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                )}
                                {isFreelancer && (
                                  <div className="mt-2">
                                    <textarea
                                      className="input-base w-full min-h-[64px] resize-none text-xs"
                                      placeholder="Your statement for the resolver..."
                                      value={local.freelancerStatement}
                                      onChange={(e) => setLocal(key, { freelancerStatement: e.target.value })}
                                    />
                                  </div>
                                )}
                                {!isFreelancer && local.freelancerStatement && (
                                  <p className="text-slate-400 text-xs text-pretty italic mt-2">&ldquo;{local.freelancerStatement}&rdquo;</p>
                                )}
                              </div>
                            </div>

                            {/* Phase advance (non-resolver parties) */}
                            {!isResolver && local.phase !== 'resolved' && (
                              <div className="flex gap-2">
                                {local.phase === 'evidence' && (
                                  <button
                                    onClick={() => setLocal(key, { phase: 'review' })}
                                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-violet-500/20 bg-violet-500/5 text-violet-300 text-xs font-semibold hover:bg-violet-500/10 transition-colors"
                                  >
                                    <Clock className="w-3.5 h-3.5" />Mark Ready for Review
                                  </button>
                                )}
                              </div>
                            )}

                            {/* Resolver panel */}
                            {isResolver && local.phase !== 'resolved' && (
                              <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-5 space-y-4">
                                <div className="text-amber-300 font-semibold text-sm">Arbitration Decision</div>
                                <p className="text-slate-500 text-xs text-pretty">
                                  Review the agreement, milestone requirements, and evidence above. Your decision is final and irreversible. The combined payout must not exceed the milestone escrow balance ({formatUsdcDisplay(milestoneAmt)} USDC).
                                </p>
                                <div className="grid sm:grid-cols-2 gap-3">
                                  <div>
                                    <label className="text-xs text-slate-500 mb-1 block">Freelancer award (USDC)</label>
                                    <input
                                      className="input-base text-sm tabular-nums"
                                      placeholder={`0 – ${formatUsdcDisplay(milestoneAmt)}`}
                                      value={resolverAmt[key] ?? ''}
                                      onChange={(e) => setResolverAmt((p) => ({ ...p, [key]: e.target.value }))}
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

                                {/* Preview split */}
                                {resolverAmt[key] && (() => {
                                  const fl = parseFloat(resolverAmt[key] || '0')
                                  const ms = parseFloat(formatUsdcDisplay(milestoneAmt).replace(/,/g, ''))
                                  const cl = Math.max(0, ms - fl)
                                  return (
                                    <div className="rounded-lg border border-white/[0.07] bg-white/[0.02] px-4 py-2.5 text-xs flex gap-4 flex-wrap">
                                      <span>Freelancer: <strong className="text-emerald-300 tabular-nums">{fl.toFixed(2)} USDC</strong></span>
                                      <span>Client refund: <strong className="text-cyan-300 tabular-nums">{cl.toFixed(2)} USDC</strong></span>
                                    </div>
                                  )
                                })()}

                                <div className="flex flex-wrap gap-2">
                                  <TxButton
                                    variant="success"
                                    size="sm"
                                    onClick={() => handleResolve(dc, true)}
                                    loading={isPending || isConfirming}
                                    loadingText="Resolving..."
                                  >
                                    Award Freelancer
                                  </TxButton>
                                  <TxButton
                                    variant="secondary"
                                    size="sm"
                                    onClick={() => handleResolve(dc, false)}
                                    loading={isPending || isConfirming}
                                    loadingText="Resolving..."
                                  >
                                    Full Refund to Client
                                  </TxButton>
                                </div>
                              </div>
                            )}

                            {/* Footer: view agreement */}
                            <div className="flex flex-wrap gap-3 pt-1">
                              <button
                                onClick={() => onViewAgreement(dc.agId, dc.contractVersion === 'V2' ? 'v2' : 'v1')}
                                className="text-xs text-slate-500 hover:text-slate-300 transition-colors flex items-center gap-1"
                              >
                                View full agreement <ExternalLink className="w-3 h-3" />
                              </button>
                              {txHash && (
                                <a
                                  href={buildTxExplorerUrl(ARC_TESTNET_ID, txHash)}
                                  target="_blank" rel="noopener noreferrer"
                                  className="mono text-cyan-400/70 text-xs hover:text-cyan-300 transition-colors flex items-center gap-1"
                                >
                                  Last tx <ExternalLink className="w-3 h-3" />
                                </a>
                              )}
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
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
