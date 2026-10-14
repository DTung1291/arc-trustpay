import { useState, useMemo } from 'react'
import { usePublicClient, useBlockNumber } from 'wagmi'
import { useQuery } from '@tanstack/react-query'
import { decodeEventLog, type Abi } from 'viem'
import { motion } from 'framer-motion'
import {
  Activity, ExternalLink, Search, RefreshCw, Filter, X,
  ChevronDown, ChevronUp
} from 'lucide-react'
import { MILESTONE_ESCROW_ADDRESS, MILESTONE_ESCROW_ABI, ARC_TESTNET_ID } from '@/contract'
import { MILESTONE_ESCROW_V2_ADDRESS, MILESTONE_ESCROW_V2_ABI } from '@/contractV2'
import { formatAddress, formatUsdcDisplay } from '@/utils/format'
import { buildTxExplorerUrl, buildAddressExplorerUrl } from '@/onchain-facts'
import { GlassCard } from './ui/GlassCard'
import { EmptyState } from './ui/EmptyState'

const ALL_EVENT_TYPES = [
  'AgreementCreated', 'AgreementFunded', 'AgreementCancelled', 'AgreementCompleted',
  'MilestoneSubmitted', 'MilestoneResubmitted', 'RevisionRequested',
  'MilestoneApproved', 'MilestoneClaimed', 'MilestoneDisputed', 'DisputeResolved', 'Withdrawn',
] as const

const EVENT_META: Record<string, { label: string; color: string; description: string }> = {
  AgreementCreated:   { label: 'Agreement Created',   color: 'text-violet-300 bg-violet-500/10 border-violet-500/20',  description: 'New escrow agreement created' },
  AgreementFunded:    { label: 'USDC Deposited',       color: 'text-cyan-300 bg-cyan-500/10 border-cyan-500/20',        description: 'Agreement funded and activated' },
  AgreementCancelled: { label: 'Agreement Cancelled',  color: 'text-red-300 bg-red-500/10 border-red-500/20',           description: 'Agreement cancelled by client' },
  AgreementCompleted: { label: 'Agreement Completed',  color: 'text-violet-300 bg-violet-500/10 border-violet-500/20',  description: 'All milestones completed' },
  MilestoneSubmitted: { label: 'Milestone Submitted',  color: 'text-sky-300 bg-sky-500/10 border-sky-500/20',           description: 'Freelancer submitted deliverable' },
  MilestoneResubmitted: { label: 'Revision Submitted', color: 'text-sky-300 bg-sky-500/10 border-sky-500/20',           description: 'Freelancer submitted revision' },
  RevisionRequested:  { label: 'Revision Requested',  color: 'text-orange-300 bg-orange-500/10 border-orange-500/20',  description: 'Client requested changes' },
  MilestoneApproved:  { label: 'Milestone Approved',   color: 'text-emerald-300 bg-emerald-500/10 border-emerald-500/20', description: 'Client approved milestone' },
  MilestoneClaimed:   { label: 'Payment Claimed',      color: 'text-emerald-300 bg-emerald-500/10 border-emerald-500/20', description: 'Freelancer claimed milestone payment' },
  MilestoneDisputed:  { label: 'Dispute Opened',       color: 'text-amber-300 bg-amber-500/10 border-amber-500/20',    description: 'Client opened dispute on milestone' },
  DisputeResolved:    { label: 'Arbitration Decision', color: 'text-sky-300 bg-sky-500/10 border-sky-500/20',           description: 'Resolver issued arbitration decision' },
  Withdrawn:          { label: 'Payment Withdrawn',    color: 'text-emerald-300 bg-emerald-500/10 border-emerald-500/20', description: 'Funds withdrawn to wallet' },
}

interface AuditEvent {
  id: string
  txHash: string
  blockNumber: bigint
  blockTimestamp: number
  eventName: string
  args: Record<string, unknown>
  contractVersion: 'V1' | 'V2'
  contractAddress: string
}

function formatTs(ts: number): string {
  if (!ts) return '—'
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  }).format(new Date(ts * 1000))
}

export function AuditTrail() {
  const publicClient = usePublicClient({ chainId: ARC_TESTNET_ID })
  const { data: blockNumber } = useBlockNumber({ chainId: ARC_TESTNET_ID, watch: false })

  const [search, setSearch] = useState('')
  const [filterEvent, setFilterEvent] = useState<string>('')
  const [filterAgreement, setFilterAgreement] = useState('')
  const [filterVersion, setFilterVersion] = useState<'all' | 'V1' | 'V2'>('all')
  const [filterFromDate, setFilterFromDate] = useState('')
  const [filterToDate, setFilterToDate] = useState('')
  const [showFilters, setShowFilters] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const { data: events, isLoading, refetch } = useQuery({
    queryKey: ['audit-trail', blockNumber?.toString()],
    queryFn: async (): Promise<AuditEvent[]> => {
      if (!publicClient) return []
      const fromBlock = blockNumber && blockNumber > 5000n ? blockNumber - 5000n : 0n

      const [v1Raw, v2Raw] = await Promise.all([
        publicClient.getLogs({ address: MILESTONE_ESCROW_ADDRESS as `0x${string}`, fromBlock, toBlock: 'latest' }),
        publicClient.getLogs({ address: MILESTONE_ESCROW_V2_ADDRESS as `0x${string}`, fromBlock, toBlock: 'latest' }),
      ])

      const allRaw = [
        ...v1Raw.map((l) => ({ ...l, ver: 'V1' as const, addr: MILESTONE_ESCROW_ADDRESS, abi: MILESTONE_ESCROW_ABI })),
        ...v2Raw.map((l) => ({ ...l, ver: 'V2' as const, addr: MILESTONE_ESCROW_V2_ADDRESS, abi: MILESTONE_ESCROW_V2_ABI })),
      ]

      // Fetch timestamps for unique blocks
      const blockNums = new Set(allRaw.map((l) => l.blockNumber ?? 0n))
      const blockTs: Record<string, number> = {}
      await Promise.all(
        [...blockNums].map(async (bn) => {
          if (!bn) return
          try {
            const b = await publicClient.getBlock({ blockNumber: bn })
            blockTs[bn.toString()] = Number(b.timestamp)
          } catch { /* skip */ }
        })
      )

      const decoded: AuditEvent[] = []
      for (const log of allRaw) {
        try {
          const d = decodeEventLog({ abi: log.abi as Abi, data: log.data, topics: log.topics })
          const bn = log.blockNumber ?? 0n
          decoded.push({
            id: `${log.transactionHash ?? ''}-${log.logIndex ?? 0}`,
            txHash: log.transactionHash ?? '',
            blockNumber: bn,
            blockTimestamp: blockTs[bn.toString()] ?? 0,
            eventName: (d.eventName as unknown as string) ?? '',
            args: (d.args ?? {}) as Record<string, unknown>,
            contractVersion: log.ver,
            contractAddress: log.addr,
          })
        } catch { /* skip */ }
      }

      return decoded.sort((a, b) => Number(b.blockNumber) - Number(a.blockNumber))
    },
    enabled: !!publicClient,
    staleTime: 20_000,
  })

  const filtered = useMemo(() => {
    if (!events) return []
    return events.filter((e) => {
      if (filterEvent && e.eventName !== filterEvent) return false
      if (filterVersion !== 'all' && e.contractVersion !== filterVersion) return false
      if (filterAgreement.trim()) {
        const ag = e.args['agreementId']
        const agStr = typeof ag === 'bigint' ? ag.toString() : typeof ag === 'string' ? ag : ''
        if (!agStr || agStr !== filterAgreement.trim()) return false
      }
      if (filterFromDate) {
        const fromTs = new Date(filterFromDate).getTime() / 1000
        if (e.blockTimestamp < fromTs) return false
      }
      if (filterToDate) {
        const toTs = new Date(filterToDate).getTime() / 1000 + 86400
        if (e.blockTimestamp > toTs) return false
      }
      if (search.trim()) {
        const q = search.toLowerCase()
        return (
          e.eventName.toLowerCase().includes(q) ||
          e.txHash.toLowerCase().includes(q) ||
          JSON.stringify(e.args).toLowerCase().includes(q)
        )
      }
      return true
    })
  }, [events, filterEvent, filterVersion, filterAgreement, filterFromDate, filterToDate, search])

  const activeFilters = [filterEvent, filterVersion !== 'all' ? filterVersion : '', filterAgreement, filterFromDate, filterToDate].filter(Boolean).length

  return (
    <div className="max-w-4xl mx-auto px-4 py-10">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="display text-2xl font-bold text-white" style={{ letterSpacing: '-0.02em' }}>Audit Trail</h1>
          <p className="text-slate-500 text-sm mt-1">Chronological onchain event history from both V1 and V2 contracts</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowFilters((v) => !v)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-semibold transition-all ${showFilters ? 'border-violet-500/40 bg-violet-500/10 text-violet-300' : 'border-white/[0.08] bg-white/[0.04] text-slate-400 hover:text-slate-200'}`}
          >
            <Filter className="w-3.5 h-3.5" />
            Filters
            {activeFilters > 0 && (
              <span className="w-4 h-4 rounded-full bg-violet-500 text-white text-xs flex items-center justify-center">{activeFilters}</span>
            )}
          </button>
          <button
            onClick={() => void refetch()}
            className="w-9 h-9 rounded-lg bg-white/[0.05] border border-white/[0.08] flex items-center justify-center text-slate-500 hover:text-slate-300 hover:bg-white/[0.09] transition-all"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="relative mb-4">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-600 pointer-events-none" />
        <input
          className="input-base pl-10"
          placeholder="Search by event, tx hash, address, or argument..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {search && (
          <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-600 hover:text-slate-300">
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Filter panel */}
      {showFilters && (
        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="mb-5">
          <GlassCard className="p-4">
            <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-3">
              <div>
                <label className="text-xs text-slate-500 uppercase tracking-wider mb-1 block">Event Type</label>
                <select
                  className="input-base text-sm bg-transparent"
                  value={filterEvent}
                  onChange={(e) => setFilterEvent(e.target.value)}
                >
                  <option value="">All Events</option>
                  {ALL_EVENT_TYPES.map((t) => (
                    <option key={t} value={t}>{EVENT_META[t]?.label ?? t}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-slate-500 uppercase tracking-wider mb-1 block">Contract Version</label>
                <select
                  className="input-base text-sm bg-transparent"
                  value={filterVersion}
                  onChange={(e) => setFilterVersion(e.target.value as 'all' | 'V1' | 'V2')}
                >
                  <option value="all">V1 + V2</option>
                  <option value="V1">V1 only</option>
                  <option value="V2">V2 only</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-slate-500 uppercase tracking-wider mb-1 block">Agreement ID</label>
                <input
                  className="input-base text-sm"
                  placeholder="e.g. 3"
                  value={filterAgreement}
                  onChange={(e) => setFilterAgreement(e.target.value)}
                />
              </div>
              <div>
                <label className="text-xs text-slate-500 uppercase tracking-wider mb-1 block">From Date</label>
                <input
                  className="input-base text-sm"
                  type="date"
                  value={filterFromDate}
                  onChange={(e) => setFilterFromDate(e.target.value)}
                  style={{ colorScheme: 'dark' }}
                />
              </div>
              <div>
                <label className="text-xs text-slate-500 uppercase tracking-wider mb-1 block">To Date</label>
                <input
                  className="input-base text-sm"
                  type="date"
                  value={filterToDate}
                  onChange={(e) => setFilterToDate(e.target.value)}
                  style={{ colorScheme: 'dark' }}
                />
              </div>
              <div className="flex items-end">
                <button
                  onClick={() => { setFilterEvent(''); setFilterVersion('all'); setFilterAgreement(''); setFilterFromDate(''); setFilterToDate(''); setSearch('') }}
                  className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
                >
                  Clear all filters
                </button>
              </div>
            </div>
          </GlassCard>
        </motion.div>
      )}

      {/* Count */}
      {!isLoading && events && events.length > 0 && (
        <div className="text-slate-500 text-sm mb-4">
          Showing{' '}
          <span className="text-white font-semibold tabular-nums">{filtered.length}</span>
          {filtered.length !== events.length ? ` of ${events.length}` : ''} events
        </div>
      )}

      {/* Events */}
      {isLoading ? (
        <div className="flex flex-col items-center py-16 gap-3">
          <div className="w-6 h-6 border-2 border-violet-500/40 border-t-violet-500 rounded-full animate-spin" />
          <span className="text-slate-500 text-sm">Scanning last 5 000 blocks...</span>
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Activity}
          title="No events found"
          description={activeFilters > 0 || search ? 'No events match the active filters.' : 'No onchain events detected yet. Interact with the contracts to see activity here.'}
        />
      ) : (
        <div className="space-y-2">
          {filtered.map((ev, i) => {
            const meta = EVENT_META[ev.eventName]
            const isExpanded = expandedId === ev.id
            return (
              <motion.div
                key={ev.id}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(i * 0.015, 0.3) }}
              >
                <GlassCard className="overflow-hidden">
                  <button
                    className="w-full flex items-start gap-3 p-4 text-left hover:bg-white/[0.02] transition-colors"
                    onClick={() => setExpandedId(isExpanded ? null : ev.id)}
                  >
                    {/* Timeline dot */}
                    <div className="flex flex-col items-center shrink-0 mt-1">
                      <div className={`w-2.5 h-2.5 rounded-full border ${meta?.color ?? 'border-slate-600'}`} />
                      {i < filtered.length - 1 && <div className="w-px h-3 bg-white/[0.05] mt-1" />}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${meta?.color ?? 'text-slate-400 bg-white/[0.05] border-white/[0.08]'}`}>
                          {meta?.label ?? ev.eventName}
                        </span>
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold border ${ev.contractVersion === 'V2' ? 'border-violet-400/20 bg-violet-400/5 text-violet-400' : 'border-slate-600/30 bg-slate-600/10 text-slate-500'}`}>
                          {ev.contractVersion}
                        </span>
                        {ev.args['agreementId'] !== undefined && (
                          <span className="text-slate-600 text-xs">Ag #{typeof ev.args['agreementId'] === 'bigint' ? ev.args['agreementId'].toString() : (ev.args['agreementId'] as string | number | undefined)?.toString() ?? ''}</span>
                        )}
                        {ev.args['milestoneIndex'] !== undefined && (
                          <span className="text-slate-600 text-xs">· M{Number(ev.args['milestoneIndex']) + 1}</span>
                        )}
                      </div>
                      <div className="text-slate-400 text-xs">{meta?.description}</div>
                    </div>

                    <div className="text-right shrink-0 flex flex-col items-end gap-1">
                      {ev.blockTimestamp > 0 && (
                        <div className="text-slate-600 text-xs tabular-nums">{formatTs(ev.blockTimestamp)}</div>
                      )}
                      {ev.txHash && (
                        <a
                          href={buildTxExplorerUrl(ARC_TESTNET_ID, ev.txHash)}
                          target="_blank" rel="noopener noreferrer"
                          className="mono text-cyan-400/70 text-xs hover:text-cyan-300 flex items-center gap-0.5 transition-colors"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {ev.txHash.slice(0, 8)}…{ev.txHash.slice(-6)}<ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                      {isExpanded ? <ChevronUp className="w-3.5 h-3.5 text-slate-600" /> : <ChevronDown className="w-3.5 h-3.5 text-slate-600" />}
                    </div>
                  </button>

                  {/* Expanded details */}
                  {isExpanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.18 }}
                      className="overflow-hidden border-t border-white/[0.05]"
                    >
                      <div className="px-4 pb-4 pt-3 grid sm:grid-cols-2 gap-2">
                        {Object.entries(ev.args).map(([k, v]) => (
                          <div key={k} className="text-xs">
                            <span className="text-slate-600 capitalize">{k.replace(/([A-Z])/g, ' $1').trim()}: </span>
                            <ArgValue k={k} v={v} />
                          </div>
                        ))}
                        <div className="text-xs sm:col-span-2 pt-1 border-t border-white/[0.04] mt-1">
                          <span className="text-slate-600">Block: </span>
                          <span className="mono text-slate-400 tabular-nums">{ev.blockNumber.toString()}</span>
                          <span className="text-slate-700 mx-2">·</span>
                          <span className="text-slate-600">Contract: </span>
                          <a
                            href={buildAddressExplorerUrl(ARC_TESTNET_ID, ev.contractAddress)}
                            target="_blank" rel="noopener noreferrer"
                            className="mono text-slate-500 hover:text-cyan-300 text-xs transition-colors"
                          >
                            {formatAddress(ev.contractAddress)}
                          </a>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </GlassCard>
              </motion.div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function ArgValue({ k, v }: { k: string; v: unknown }) {
  if (typeof v === 'bigint') {
    if (k.toLowerCase().includes('amount') || k.toLowerCase().includes('total') || k.toLowerCase().includes('refund')) {
      return <span className="text-white font-semibold tabular-nums mono">{formatUsdcDisplay(v)} USDC</span>
    }
    return <span className="text-slate-300 tabular-nums mono">{v.toString()}</span>
  }
  if (typeof v === 'string' && v.startsWith('0x') && v.length === 42) {
    return (
      <a href={buildAddressExplorerUrl(ARC_TESTNET_ID, v)} target="_blank" rel="noopener noreferrer"
        className="mono text-cyan-400 hover:text-cyan-300 transition-colors">
        {formatAddress(v)}
      </a>
    )
  }
  if (typeof v === 'boolean') return <span className={v ? 'text-emerald-400' : 'text-red-400'}>{v ? 'Yes' : 'No'}</span>
  if (typeof v === 'string' && v.length > 80) return <span className="text-slate-400 mono break-all">{v.slice(0, 80)}…</span>
  return <span className="text-slate-300">{String(v)}</span>
}
