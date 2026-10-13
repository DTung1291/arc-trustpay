import { useMemo, useState } from 'react'
import { useBlockNumber, usePublicClient } from 'wagmi'
import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { ExternalLink, Search, Activity, RefreshCw } from 'lucide-react'
import { decodeEventLog, type Abi } from 'viem'
import { MILESTONE_ESCROW_ADDRESS, MILESTONE_ESCROW_ABI, ARC_TESTNET_ID } from '@/contract'
import { formatAddress, formatUsdcDisplay } from '@/utils/format'
import { buildTxExplorerUrl, buildAddressExplorerUrl } from '@/onchain-facts'
import { GlassCard } from './ui/GlassCard'
import { EmptyState } from './ui/EmptyState'

const EVENT_COLORS: Record<string, string> = {
  AgreementCreated: 'text-violet-300 bg-violet-500/10 border-violet-500/20',
  AgreementFunded: 'text-cyan-300 bg-cyan-500/10 border-cyan-500/20',
  MilestoneSubmitted: 'text-sky-300 bg-sky-500/10 border-sky-500/20',
  MilestoneApproved: 'text-emerald-300 bg-emerald-500/10 border-emerald-500/20',
  MilestoneClaimed: 'text-emerald-300 bg-emerald-500/10 border-emerald-500/20',
  MilestoneDisputed: 'text-amber-300 bg-amber-500/10 border-amber-500/20',
  DisputeResolved: 'text-sky-300 bg-sky-500/10 border-sky-500/20',
  AgreementCancelled: 'text-red-300 bg-red-500/10 border-red-500/20',
  AgreementCompleted: 'text-violet-300 bg-violet-500/10 border-violet-500/20',
  Withdrawn: 'text-emerald-300 bg-emerald-500/10 border-emerald-500/20',
}

interface DecodedLog {
  txHash: string
  blockNumber: bigint
  blockTimestamp?: number
  eventName: string
  args: Record<string, unknown>
}

export function TxExplorer() {
  const publicClient = usePublicClient({ chainId: ARC_TESTNET_ID })
  const { data: blockNumber } = useBlockNumber({ chainId: ARC_TESTNET_ID, watch: false })
  const [search, setSearch] = useState('')

  const { data: logs, isLoading, refetch } = useQuery({
    queryKey: ['escrow-logs', blockNumber?.toString()],
    queryFn: async () => {
      if (!publicClient) return []
      const fromBlock = blockNumber && blockNumber > 500n ? blockNumber - 500n : 0n
      const raw = await publicClient.getLogs({
        address: MILESTONE_ESCROW_ADDRESS,
        fromBlock,
        toBlock: 'latest',
      })
      const decoded: DecodedLog[] = []
      for (const log of raw) {
        try {
          const d = decodeEventLog({
            abi: MILESTONE_ESCROW_ABI as Abi,
            data: log.data,
            topics: log.topics,
          })
          decoded.push({
            txHash: (log.transactionHash) ?? '',
            blockNumber: log.blockNumber ?? 0n,
            eventName: (d.eventName as string | undefined) ?? '',
            args: (d.args ?? {}) as Record<string, unknown>,
          })
        } catch { /* skip undecodable */ }
      }
      return decoded.reverse()
    },
    enabled: !!publicClient,
    staleTime: 15_000,
  })

  const filtered = useMemo(() => {
    if (!logs) return []
    if (!search.trim()) return logs
    const q = search.toLowerCase()
    return logs.filter((l) =>
      l.eventName.toLowerCase().includes(q) ||
      l.txHash.toLowerCase().includes(q) ||
      JSON.stringify(l.args).toLowerCase().includes(q)
    )
  }, [logs, search])

  return (
    <div className="max-w-4xl mx-auto px-4 py-10">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="display text-2xl font-bold text-white" style={{ letterSpacing: '-0.02em' }}>Transaction Explorer</h1>
          <p className="text-slate-500 text-sm mt-1">Live decoded events from the escrow contract</p>
        </div>
        <div className="flex items-center gap-2">
          <a
            href={`https://explorer.testnet.arc.io/address/${MILESTONE_ESCROW_ADDRESS}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-slate-500 hover:text-slate-300 text-xs flex items-center gap-1 transition-colors"
          >
            Contract <ExternalLink className="w-3.5 h-3.5" />
          </a>
          <button onClick={() => { void refetch() }} className="w-9 h-9 rounded-lg bg-white/[0.05] border border-white/[0.08] flex items-center justify-center text-slate-500 hover:text-slate-300 hover:bg-white/[0.09] transition-all">
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="relative mb-6">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-600 pointer-events-none" />
        <input
          className="input-base pl-10"
          placeholder="Search by event name, tx hash, address..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Contract info */}
      <GlassCard className="p-4 mb-6">
        <div className="grid sm:grid-cols-2 gap-4 text-sm">
          <div>
            <div className="text-slate-600 text-xs uppercase tracking-wider mb-1">Contract</div>
            <a href={`https://explorer.testnet.arc.io/address/${MILESTONE_ESCROW_ADDRESS}`} target="_blank" rel="noopener noreferrer"
              className="mono text-cyan-400 hover:text-cyan-300 text-xs break-all flex items-center gap-1 transition-colors">
              {MILESTONE_ESCROW_ADDRESS}<ExternalLink className="w-3 h-3" />
            </a>
          </div>
          <div>
            <div className="text-slate-600 text-xs uppercase tracking-wider mb-1">Current Block</div>
            <span className="mono text-slate-300 text-xs tabular-nums">{blockNumber?.toString() ?? '...'}</span>
          </div>
        </div>
      </GlassCard>

      {/* Event count */}
      {!isLoading && logs && logs.length > 0 && (
        <div className="flex items-center gap-2 mb-4">
          <span className="text-slate-500 text-sm">
            Showing{' '}
            <span className="text-white font-semibold tabular-nums">{filtered.length}</span>
            {search ? ` of ${logs.length}` : ''} events
          </span>
          {search && filtered.length < logs.length && (
            <button onClick={() => setSearch('')} className="text-xs text-slate-600 hover:text-slate-400 transition-colors">
              Clear filter
            </button>
          )}
        </div>
      )}

      {/* Events */}
      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3">
          <div className="w-6 h-6 border-2 border-violet-500/40 border-t-violet-500 rounded-full animate-spin" />
          <span className="text-slate-500 text-sm">Scanning last 500 blocks...</span>
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Activity}
          title="No events found"
          description={search ? 'No events match your search.' : 'No events have been emitted yet. Interact with the contract to see activity here.'}
        />
      ) : (
        <div className="space-y-2.5">
          {filtered.map((log, i) => (
            <motion.div key={`${log.txHash}-${i}`} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: Math.min(i * 0.02, 0.4) }}>
              <GlassCard className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
                  <div className="flex items-center gap-2">
                    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold border ${EVENT_COLORS[log.eventName] ?? 'text-slate-400 bg-white/[0.05] border-white/[0.08]'}`}>
                      {log.eventName}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="mono text-slate-600 text-xs tabular-nums">Block {log.blockNumber.toString()}</span>
                    {log.txHash && (
                      <a
                        href={buildTxExplorerUrl(ARC_TESTNET_ID, log.txHash as `0x${string}`)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mono text-cyan-400 text-xs hover:text-cyan-300 flex items-center gap-1 transition-colors"
                      >
                        {log.txHash.slice(0, 8)}...{log.txHash.slice(-6)}
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </div>
                </div>

                <div className="grid sm:grid-cols-2 gap-2">
                  {Object.entries(log.args).map(([k, v]) => (
                    <div key={k} className="text-xs">
                      <span className="text-slate-600 capitalize">{k.replace(/([A-Z])/g, ' $1').trim()}: </span>
                      <ArgValue k={k} v={v} />
                    </div>
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

function ArgValue({ k, v }: { k: string; v: unknown }) {
  if (typeof v === 'bigint') {
    if (k.toLowerCase().includes('amount') || k.toLowerCase().includes('total')) {
      return <span className="text-white font-semibold tabular-nums mono">{formatUsdcDisplay(v)} USDC</span>
    }
    if (k.toLowerCase().includes('id') || k.toLowerCase().includes('index')) {
      return <span className="text-slate-300 tabular-nums mono">{v.toString()}</span>
    }
    return <span className="text-slate-300 mono tabular-nums">{v.toString()}</span>
  }
  if (typeof v === 'string' && v.startsWith('0x') && v.length === 42) {
    return (
      <a href={buildAddressExplorerUrl(ARC_TESTNET_ID, v)} target="_blank" rel="noopener noreferrer"
        className="mono text-cyan-400 hover:text-cyan-300 transition-colors">
        {formatAddress(v)}
      </a>
    )
  }
  if (typeof v === 'boolean') {
    return <span className={v ? 'text-emerald-400' : 'text-red-400'}>{v ? 'Yes' : 'No'}</span>
  }
  if (typeof v === 'string' && v.length > 60) {
    return <span className="text-slate-400 mono break-all">{v.slice(0, 60)}…</span>
  }
  return <span className="text-slate-300">{String(v)}</span>
}
