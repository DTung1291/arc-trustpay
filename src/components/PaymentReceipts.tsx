import { useState, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Receipt, Download, Printer, Copy, ExternalLink, CheckCircle2,
  Search, RefreshCw, FileText, ChevronRight, ArrowLeft, X
} from 'lucide-react'
import { GlassCard } from './ui/GlassCard'
import { EmptyState } from './ui/EmptyState'
import { useReceipts, type Receipt as ReceiptType } from '@/hooks/useReceipts'
import { formatUsdcDisplay, formatAddress } from '@/utils/format'
import { buildTxExplorerUrl } from '@/onchain-facts'
import { ARC_TESTNET_ID } from '@/contract'

const PAYMENT_TYPE_COLORS: Record<string, string> = {
  'Approved': 'text-emerald-300 bg-emerald-500/10 border-emerald-500/20',
  'Auto Release': 'text-cyan-300 bg-cyan-500/10 border-cyan-500/20',
  'Dispute Settlement – Freelancer': 'text-sky-300 bg-sky-500/10 border-sky-500/20',
  'Dispute Settlement – Client Refund': 'text-amber-300 bg-amber-500/10 border-amber-500/20',
}

function formatTs(ts: number): string {
  if (!ts) return '—'
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
    timeZoneName: 'short',
  }).format(new Date(ts * 1000))
}

function ReceiptDetail({ receipt, onClose }: { receipt: ReceiptType; onClose: () => void }) {
  const [copied, setCopied] = useState(false)
  const printRef = useRef<HTMLDivElement>(null)

  const copyHash = () => {
    void navigator.clipboard.writeText(receipt.txHash)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handlePrint = () => {
    window.print()
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      className="max-w-2xl mx-auto"
    >
      {/* Back */}
      <button
        onClick={onClose}
        className="flex items-center gap-2 text-slate-500 hover:text-slate-300 text-sm mb-6 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to receipts
      </button>

      {/* Receipt card — printable area */}
      <div ref={printRef}>
        <GlassCard className="overflow-hidden print:shadow-none print:border-slate-300">
          {/* Header band */}
          <div className="bg-gradient-to-r from-violet-900/60 to-fuchsia-900/60 px-6 py-5 border-b border-white/[0.07] print:bg-violet-50 print:text-slate-900">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <Receipt className="w-5 h-5 text-violet-400 print:text-violet-700" />
                  <span className="text-violet-300 text-xs font-semibold uppercase tracking-wider print:text-violet-700">
                    ARC TRUSTPAY — Payment Receipt
                  </span>
                </div>
                <h2 className="display text-xl font-bold text-white print:text-slate-900" style={{ letterSpacing: '-0.02em' }}>
                  {receipt.projectTitle}
                </h2>
                <p className="text-slate-400 text-sm mt-0.5 print:text-slate-600">{receipt.milestoneTitle}</p>
              </div>
              <div className="text-right shrink-0">
                <div className="text-white font-bold tabular-nums text-2xl print:text-slate-900">
                  {formatUsdcDisplay(receipt.amount)} USDC
                </div>
                <span className={`mt-1 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${PAYMENT_TYPE_COLORS[receipt.paymentType] ?? 'text-slate-400 bg-slate-400/10 border-slate-400/20'}`}>
                  {receipt.paymentType}
                </span>
              </div>
            </div>
          </div>

          {/* Body */}
          <div className="px-6 py-5 space-y-4">
            {/* Disclaimer */}
            <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-4 py-2.5 text-amber-300/80 text-xs print:border-amber-300 print:text-amber-800">
              This document is a record of a testnet USDC payment on Arc Testnet. It is not a legally compliant tax invoice.
            </div>

            {/* Reference row */}
            <div className="grid sm:grid-cols-2 gap-x-6 gap-y-3">
              <Field label="Receipt Reference">
                <span className="mono text-slate-300 text-xs break-all">{receipt.id}</span>
              </Field>
              <Field label="Contract Version">
                <span className="inline-flex items-center px-2 py-0.5 rounded-md border border-violet-400/20 bg-violet-400/5 text-violet-300 text-xs font-semibold">{receipt.contractVersion}</span>
              </Field>
              <Field label="Agreement ID">
                <span className="mono text-slate-300 tabular-nums">#{receipt.agreementId.toString()}</span>
              </Field>
              <Field label="Milestone">
                <span className="text-slate-300">{receipt.milestoneTitle}</span>
              </Field>
              <Field label="Payment Status">
                <span className="flex items-center gap-1.5 text-emerald-300">
                  <CheckCircle2 className="w-3.5 h-3.5" />Confirmed
                </span>
              </Field>
              <Field label="Payment Type">
                <span className="text-slate-300">{receipt.paymentType}</span>
              </Field>
              <Field label="Chain">
                <span className="text-slate-300">Arc Testnet (ID: {ARC_TESTNET_ID})</span>
              </Field>
              <Field label="Block Number">
                <span className="mono tabular-nums text-slate-300">{receipt.blockNumber.toString()}</span>
              </Field>
              <Field label="Confirmed">
                <span className="text-slate-300 tabular-nums">{formatTs(receipt.confirmedAt)}</span>
              </Field>
              <Field label="USDC Amount">
                <span className="tabular-nums font-semibold text-white">{formatUsdcDisplay(receipt.amount)} USDC</span>
              </Field>
            </div>

            <div className="border-t border-white/[0.05] print:border-slate-200" />

            {/* Parties */}
            <div className="grid sm:grid-cols-2 gap-x-6 gap-y-3">
              <Field label="Client Wallet">
                <span className="mono text-slate-400 text-xs break-all">{receipt.clientAddress || '—'}</span>
              </Field>
              <Field label="Freelancer Wallet">
                <span className="mono text-slate-400 text-xs break-all">{receipt.freelancerAddress || '—'}</span>
              </Field>
            </div>

            <div className="border-t border-white/[0.05] print:border-slate-200" />

            {/* Transaction hash */}
            <Field label="Transaction Hash">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="mono text-cyan-400 text-xs break-all">{receipt.txHash || '—'}</span>
              </div>
            </Field>

            {/* Contract address */}
            <Field label="Contract Address">
              <span className="mono text-slate-400 text-xs break-all">{receipt.contractAddress}</span>
            </Field>

            {receipt.note && (
              <Field label="Resolver Note">
                <p className="text-slate-400 text-sm text-pretty">{receipt.note}</p>
              </Field>
            )}
          </div>

          {/* Actions footer — hidden in print */}
          <div className="px-6 pb-5 flex flex-wrap gap-2 print:hidden">
            <button
              onClick={copyHash}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/[0.05] border border-white/[0.08] text-slate-400 hover:text-slate-200 hover:bg-white/[0.09] transition-all text-xs font-semibold"
            >
              {copied ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              {copied ? 'Copied' : 'Copy Tx Hash'}
            </button>
            <a
              href={receipt.txHash ? buildTxExplorerUrl(ARC_TESTNET_ID, receipt.txHash) : '#'}
              target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/[0.05] border border-white/[0.08] text-slate-400 hover:text-cyan-300 hover:bg-white/[0.09] transition-all text-xs font-semibold"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              View in Explorer
            </a>
            <button
              onClick={handlePrint}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/[0.05] border border-white/[0.08] text-slate-400 hover:text-slate-200 hover:bg-white/[0.09] transition-all text-xs font-semibold"
            >
              <Printer className="w-3.5 h-3.5" />
              Print / Save PDF
            </button>
            <button
              onClick={handlePrint}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/[0.05] border border-white/[0.08] text-slate-400 hover:text-slate-200 hover:bg-white/[0.09] transition-all text-xs font-semibold"
            >
              <Download className="w-3.5 h-3.5" />
              Download PDF
            </button>
          </div>
        </GlassCard>
      </div>
    </motion.div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs text-slate-600 uppercase tracking-wider mb-1 font-semibold print:text-slate-500">{label}</div>
      <div className="text-sm print:text-slate-800">{children}</div>
    </div>
  )
}

export function PaymentReceipts() {
  const { data: receipts, isLoading, refetch } = useReceipts()
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<ReceiptType | null>(null)

  const filtered = (receipts ?? []).filter((r) => {
    if (!search.trim()) return true
    const q = search.toLowerCase()
    return (
      r.projectTitle.toLowerCase().includes(q) ||
      r.txHash.toLowerCase().includes(q) ||
      r.paymentType.toLowerCase().includes(q) ||
      r.agreementId.toString().includes(q) ||
      r.clientAddress.toLowerCase().includes(q) ||
      r.freelancerAddress.toLowerCase().includes(q)
    )
  })

  if (selected) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-10">
        <AnimatePresence mode="wait">
          <ReceiptDetail key={selected.id} receipt={selected} onClose={() => setSelected(null)} />
        </AnimatePresence>
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-10">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="display text-2xl font-bold text-white" style={{ letterSpacing: '-0.02em' }}>Payment Receipts</h1>
          <p className="text-slate-500 text-sm mt-1">Confirmed USDC payment records from both V1 and V2 contracts</p>
        </div>
        <button
          onClick={() => void refetch()}
          className="w-9 h-9 rounded-lg bg-white/[0.05] border border-white/[0.08] flex items-center justify-center text-slate-500 hover:text-slate-300 hover:bg-white/[0.09] transition-all"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* Disclaimer */}
      <GlassCard className="p-4 mb-6">
        <div className="flex gap-3">
          <FileText className="w-5 h-5 text-slate-400 shrink-0 mt-0.5" />
          <p className="text-slate-400 text-sm leading-relaxed">
            Receipts are generated from confirmed onchain transactions only. Pending transactions are not shown. These records are not legally compliant tax invoices. All amounts are testnet USDC with no real monetary value.
          </p>
        </div>
      </GlassCard>

      {/* Search */}
      <div className="relative mb-6">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-600 pointer-events-none" />
        <input
          className="input-base pl-10"
          placeholder="Search by project, tx hash, payment type, wallet..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {search && (
          <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-600 hover:text-slate-300 transition-colors">
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Count */}
      {!isLoading && filtered.length > 0 && (
        <div className="text-slate-500 text-sm mb-4">
          <span className="text-white font-semibold tabular-nums">{filtered.length}</span> receipt{filtered.length !== 1 ? 's' : ''}
          {search ? ` matching "${search}"` : ''}
        </div>
      )}

      {/* Content */}
      {isLoading ? (
        <div className="flex flex-col items-center py-16 gap-3">
          <div className="w-6 h-6 border-2 border-violet-500/40 border-t-violet-500 rounded-full animate-spin" />
          <span className="text-slate-500 text-sm">Scanning contract events...</span>
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Receipt}
          title="No receipts yet"
          description={search ? 'No receipts match your search.' : 'Receipts appear here once milestone payments are confirmed onchain. Complete or resolve a milestone to generate one.'}
        />
      ) : (
        <div className="space-y-3">
          {filtered.map((r, i) => (
            <motion.div
              key={r.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(i * 0.03, 0.3) }}
            >
              <GlassCard className="p-5 hover:bg-white/[0.03] cursor-pointer transition-colors" onClick={() => setSelected(r)}>
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-1.5">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${PAYMENT_TYPE_COLORS[r.paymentType] ?? ''}`}>
                        {r.paymentType}
                      </span>
                      <span className="inline-flex items-center px-2 py-0.5 rounded-md border border-violet-400/20 bg-violet-400/5 text-violet-400 text-xs font-semibold">{r.contractVersion}</span>
                    </div>
                    <div className="text-white font-semibold text-sm truncate">{r.projectTitle}</div>
                    <div className="text-slate-500 text-xs mt-0.5">{r.milestoneTitle} · Agreement #{r.agreementId.toString()}</div>
                    {r.confirmedAt > 0 && (
                      <div className="text-slate-600 text-xs mt-1 tabular-nums">{formatTs(r.confirmedAt)}</div>
                    )}
                    <div className="flex items-center gap-1.5 mt-1.5">
                      <span className="text-slate-600 text-xs">Tx:</span>
                      <a
                        href={buildTxExplorerUrl(ARC_TESTNET_ID, r.txHash as `0x${string}`)}
                        target="_blank" rel="noopener noreferrer"
                        className="mono text-cyan-400/70 text-xs hover:text-cyan-300 transition-colors flex items-center gap-0.5"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {formatAddress(r.txHash)}<ExternalLink className="w-2.5 h-2.5" />
                      </a>
                    </div>
                  </div>
                  <div className="text-right shrink-0 flex flex-col items-end gap-2">
                    <div className="text-white font-bold tabular-nums">{formatUsdcDisplay(r.amount)} USDC</div>
                    <div className="flex items-center gap-1 text-emerald-400 text-xs">
                      <CheckCircle2 className="w-3.5 h-3.5" />Confirmed
                    </div>
                    <ChevronRight className="w-4 h-4 text-slate-600" />
                  </div>
                </div>
              </GlassCard>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  )
}
