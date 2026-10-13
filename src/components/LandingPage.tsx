import { useRef } from 'react'
import { motion, useInView } from 'framer-motion'
import {
  Shield, Zap, Lock, CheckCircle2, ArrowRight, ExternalLink,
  GitCommit, Send, ThumbsUp, Coins, Scale, Clock
} from 'lucide-react'
import { ConnectKitButton } from 'connectkit'
import { useAccount } from 'wagmi'
import { TxButton } from './ui/TxButton'
import { MILESTONE_ESCROW_ADDRESS, ARC_TESTNET_ID } from '@/contract'
import { buildAddressExplorerUrl } from '@/onchain-facts'

interface LandingPageProps {
  onGetStarted: () => void
}

const FEATURES = [
  {
    icon: Lock,
    title: 'Non-Custodial Escrow',
    description: 'USDC locks in a smart contract on Arc Testnet. No bank, no intermediary — just math.',
    accent: 'violet',
  },
  {
    icon: CheckCircle2,
    title: 'Milestone-Based Release',
    description: 'Each milestone has its own USDC allocation. Payment unlocks only when work is submitted and approved.',
    accent: 'cyan',
  },
  {
    icon: Shield,
    title: 'Built-In Dispute Resolution',
    description: 'A pre-agreed neutral resolver settles any disagreement with a binding onchain outcome.',
    accent: 'emerald',
  },
  {
    icon: Zap,
    title: 'Sub-Second on Arc',
    description: 'Arc Testnet settles transactions in under a second. USDC is the native gas — no ETH needed.',
    accent: 'amber',
  },
]

const HOW_IT_WORKS = [
  {
    icon: GitCommit,
    step: '01',
    actor: 'Client',
    title: 'Create Agreement',
    body: 'Define project, milestones, USDC amounts, due dates, and a dispute resolver.',
    accent: 'violet',
  },
  {
    icon: Lock,
    step: '02',
    actor: 'Client',
    title: 'Fund Escrow',
    body: 'Approve and deposit the full project amount. USDC is now locked in the smart contract.',
    accent: 'fuchsia',
  },
  {
    icon: Send,
    step: '03',
    actor: 'Freelancer',
    title: 'Submit Deliverables',
    body: 'Complete each milestone and submit an IPFS hash or URL as proof of delivery.',
    accent: 'cyan',
  },
  {
    icon: ThumbsUp,
    step: '04',
    actor: 'Client',
    title: 'Approve Work',
    body: "Review each submission. Approve to unlock the milestone's USDC, or raise a dispute.",
    accent: 'sky',
  },
  {
    icon: Coins,
    step: '05',
    actor: 'Freelancer',
    title: 'Claim Payment',
    body: 'Claim the approved milestone amount. Funds move to your withdrawal balance.',
    accent: 'emerald',
  },
  {
    icon: Scale,
    step: '06',
    actor: 'Resolver',
    title: 'Resolve Disputes',
    body: 'If disputed, the designated resolver splits or awards the escrowed amount onchain.',
    accent: 'amber',
  },
]

const SAMPLE_CARDS = [
  {
    title: 'Brand Identity Package',
    milestones: 3,
    total: '2,400.00',
    status: 'Active',
    tags: ['Logo', 'Typography', 'Style Guide'],
  },
  {
    title: 'Smart Contract Audit',
    milestones: 4,
    total: '8,000.00',
    status: 'Completed',
    tags: ['Solidity', 'Security', 'Report'],
  },
  {
    title: 'Mobile App MVP',
    milestones: 5,
    total: '15,000.00',
    status: 'Active',
    tags: ['React Native', 'API', 'Auth'],
  },
]

const ACCENT_MAP: Record<string, { border: string; bg: string; text: string; dot: string }> = {
  violet: { border: 'border-violet-500/30', bg: 'bg-violet-500/10', text: 'text-violet-300', dot: 'bg-violet-400' },
  fuchsia: { border: 'border-fuchsia-500/30', bg: 'bg-fuchsia-500/10', text: 'text-fuchsia-300', dot: 'bg-fuchsia-400' },
  cyan: { border: 'border-cyan-500/30', bg: 'bg-cyan-500/10', text: 'text-cyan-300', dot: 'bg-cyan-400' },
  sky: { border: 'border-sky-500/30', bg: 'bg-sky-500/10', text: 'text-sky-300', dot: 'bg-sky-400' },
  emerald: { border: 'border-emerald-500/30', bg: 'bg-emerald-500/10', text: 'text-emerald-300', dot: 'bg-emerald-400' },
  amber: { border: 'border-amber-500/30', bg: 'bg-amber-500/10', text: 'text-amber-300', dot: 'bg-amber-400' },
}

function InViewSection({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  const ref = useRef(null)
  const inView = useInView(ref, { once: true, margin: '-80px' })
  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 24 }}
      animate={inView ? { opacity: 1, y: 0 } : { opacity: 0, y: 24 }}
      transition={{ duration: 0.5 }}
      className={className}
    >
      {children}
    </motion.div>
  )
}

export function LandingPage({ onGetStarted }: LandingPageProps) {
  const { isConnected } = useAccount()
  const contractExplorerUrl = buildAddressExplorerUrl(ARC_TESTNET_ID, MILESTONE_ESCROW_ADDRESS)

  return (
    <div className="min-h-dvh overflow-x-hidden">

      {/* ── Hero ── */}
      <section className="relative px-4 pt-20 pb-24 text-center overflow-hidden">

        {/* Background blobs */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[900px] h-[500px] bg-violet-600/[0.07] rounded-full blur-3xl" />
          <div className="absolute top-32 left-1/2 -translate-x-1/2 w-[500px] h-[260px] bg-fuchsia-600/[0.06] rounded-full blur-2xl" />
          <div className="absolute -top-20 left-[10%] w-[300px] h-[300px] bg-cyan-500/[0.03] rounded-full blur-3xl" />
          <div className="absolute -top-10 right-[8%] w-[250px] h-[250px] bg-violet-500/[0.04] rounded-full blur-3xl" />
        </div>

        <motion.div
          initial={{ opacity: 0, y: 28 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
          className="relative max-w-4xl mx-auto"
        >
          {/* Pill */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.1, duration: 0.5 }}
            className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-violet-500/10 border border-violet-500/20 text-violet-300 text-xs font-semibold tracking-widest uppercase mb-8"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-pulse" />
            Testnet Prototype · Arc Testnet
          </motion.div>

          {/* Headline */}
          <h1
            className="display text-5xl sm:text-6xl lg:text-7xl font-bold text-white mb-6 text-balance"
            style={{ letterSpacing: '-0.035em', lineHeight: 1.05 }}
          >
            Escrow that works
            <br />
            <span
              className="bg-clip-text text-transparent"
              style={{ backgroundImage: 'linear-gradient(135deg, #a78bfa 0%, #e879f9 40%, #67e8f9 100%)' }}
            >
              as hard as you do.
            </span>
          </h1>

          <motion.p
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.25, duration: 0.5 }}
            className="text-slate-400 text-lg sm:text-xl max-w-2xl mx-auto mb-10 text-pretty leading-relaxed"
          >
            ARC TRUSTPAY locks testnet USDC in a milestone-based smart contract.
            Clients fund. Freelancers deliver. The blockchain enforces — no middlemen, no disputes left unresolved.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.35, duration: 0.4 }}
            className="flex flex-col sm:flex-row gap-4 justify-center items-center"
          >
            {isConnected ? (
              <TxButton onClick={onGetStarted} size="lg" className="min-w-[220px]">
                Open Dashboard
                <ArrowRight className="w-5 h-5" />
              </TxButton>
            ) : (
              <ConnectKitButton.Custom>
                {({ show }) => (
                  <TxButton onClick={show} size="lg" className="min-w-[240px]">
                    Connect Wallet to Start
                    <ArrowRight className="w-5 h-5" />
                  </TxButton>
                )}
              </ConnectKitButton.Custom>
            )}
            <a
              href={contractExplorerUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-slate-500 hover:text-slate-200 text-sm transition-colors"
            >
              <span className="mono text-xs">{MILESTONE_ESCROW_ADDRESS.slice(0, 10)}...</span>
              <ExternalLink className="w-4 h-4" />
            </a>
          </motion.div>
        </motion.div>
      </section>

      {/* ── Stats bar ── */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5, duration: 0.6 }}
        className="border-y border-white/[0.06] bg-white/[0.015]"
      >
        <div className="max-w-4xl mx-auto px-4 py-5 grid grid-cols-3 sm:grid-cols-5 gap-0 divide-x divide-white/[0.06]">
          {[
            { label: 'Network', value: 'Arc Testnet' },
            { label: 'Gas Token', value: 'USDC' },
            { label: 'Finality', value: '< 1s' },
            { label: 'Max Milestones', value: '20' },
            { label: 'Review Window', value: '7 days' },
          ].map((s) => (
            <div key={s.label} className="px-6 py-1 text-center first:pl-0 last:pr-0">
              <div className="text-white font-semibold display text-sm">{s.value}</div>
              <div className="text-slate-600 text-xs mt-0.5 uppercase tracking-widest">{s.label}</div>
            </div>
          ))}
        </div>
      </motion.div>

      {/* ── How it Works ── */}
      <section className="max-w-5xl mx-auto px-4 py-24">
        <InViewSection className="text-center mb-16">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/[0.04] border border-white/[0.08] text-slate-500 text-xs font-semibold uppercase tracking-widest mb-4">
            Process
          </div>
          <h2
            className="display text-3xl sm:text-4xl font-bold text-white text-balance"
            style={{ letterSpacing: '-0.025em' }}
          >
            Six steps, zero surprises.
          </h2>
          <p className="text-slate-500 text-base mt-3 max-w-xl mx-auto text-pretty">
            Every action is a real onchain transaction. No hidden rules, no hidden fees.
          </p>
        </InViewSection>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {HOW_IT_WORKS.map((step, i) => {
            const a = ACCENT_MAP[step.accent] ?? ACCENT_MAP.violet
            const StepIcon = step.icon
            return (
              <InViewSection key={step.step}>
                <motion.div
                  initial={{ opacity: 0, y: 16 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.06, duration: 0.4 }}
                  className={`rounded-2xl border ${a.border} bg-white/[0.025] p-6 h-full hover:bg-white/[0.04] transition-colors`}
                >
                  <div className="flex items-start justify-between mb-4">
                    <div className={`w-10 h-10 rounded-xl ${a.bg} border ${a.border} flex items-center justify-center`}>
                      <StepIcon className={`w-5 h-5 ${a.text}`} />
                    </div>
                    <span className="text-slate-700 font-mono text-xs font-bold">{step.step}</span>
                  </div>
                  <div className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-semibold ${a.bg} border ${a.border} ${a.text} mb-3`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${a.dot}`} />
                    {step.actor}
                  </div>
                  <h3 className="text-white font-semibold mb-2">{step.title}</h3>
                  <p className="text-slate-500 text-sm leading-relaxed text-pretty">{step.body}</p>
                </motion.div>
              </InViewSection>
            )
          })}
        </div>
      </section>

      {/* ── Features ── */}
      <section className="max-w-5xl mx-auto px-4 pb-20">
        <InViewSection className="text-center mb-12">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/[0.04] border border-white/[0.08] text-slate-500 text-xs font-semibold uppercase tracking-widest mb-4">
            Built-In Protections
          </div>
          <h2
            className="display text-3xl sm:text-4xl font-bold text-white"
            style={{ letterSpacing: '-0.025em' }}
          >
            Every edge case, covered.
          </h2>
        </InViewSection>

        <div className="grid sm:grid-cols-2 gap-5">
          {FEATURES.map((f, i) => {
            const a = ACCENT_MAP[f.accent] ?? ACCENT_MAP.violet
            const FIcon = f.icon
            return (
              <motion.div
                key={f.title}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.07, duration: 0.4 }}
                className={`rounded-2xl border ${a.border} bg-white/[0.025] p-6 hover:bg-white/[0.04] transition-colors`}
              >
                <div className={`w-10 h-10 rounded-xl ${a.bg} border ${a.border} flex items-center justify-center mb-4`}>
                  <FIcon className={`w-5 h-5 ${a.text}`} />
                </div>
                <h3 className="text-white font-semibold mb-2">{f.title}</h3>
                <p className="text-slate-500 text-sm leading-relaxed text-pretty">{f.description}</p>
              </motion.div>
            )
          })}
        </div>
      </section>

      {/* ── Timeline protection callouts ── */}
      <section className="max-w-5xl mx-auto px-4 pb-20">
        <InViewSection>
          <div className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-6 sm:p-8">
            <h3 className="text-white font-semibold display text-lg mb-6" style={{ letterSpacing: '-0.02em' }}>
              Smart contract protections
            </h3>
            <div className="grid sm:grid-cols-3 gap-4">
              {[
                { icon: Clock, title: '7-day Review Window', body: 'If the client does not respond in 7 days, the freelancer can claim automatically.', accent: 'cyan' },
                { icon: Shield, title: 'Reentrancy Protected', body: 'OpenZeppelin ReentrancyGuard on all token-moving functions. No double-spend exploits.', accent: 'violet' },
                { icon: CheckCircle2, title: 'Pull-Payment Payouts', body: 'Payments credit a withdrawal mapping, not a direct push — one blocked address cannot freeze the others.', accent: 'emerald' },
              ].map((item) => {
                const a = ACCENT_MAP[item.accent] ?? ACCENT_MAP.violet
                const ItemIcon = item.icon
                return (
                  <div key={item.title} className={`rounded-xl border ${a.border} ${a.bg} p-4`}>
                    <div className="flex items-center gap-2 mb-2">
                      <ItemIcon className={`w-4 h-4 ${a.text} shrink-0`} />
                      <span className={`text-sm font-semibold ${a.text}`}>{item.title}</span>
                    </div>
                    <p className="text-slate-500 text-xs leading-relaxed">{item.body}</p>
                  </div>
                )
              })}
            </div>
          </div>
        </InViewSection>
      </section>

      {/* ── Sample Cards ── */}
      <section className="max-w-5xl mx-auto px-4 pb-20">
        <InViewSection className="mb-6">
          <h2 className="display text-2xl font-bold text-white" style={{ letterSpacing: '-0.02em' }}>
            Sample agreements
          </h2>
          <p className="text-slate-500 text-sm mt-1">What real projects might look like on TRUSTPAY.</p>
        </InViewSection>
        <div className="grid sm:grid-cols-3 gap-4">
          {SAMPLE_CARDS.map((card, i) => (
            <motion.div
              key={card.title}
              initial={{ opacity: 0, scale: 0.97 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.07 }}
              className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-5 hover:bg-white/[0.04] transition-colors"
            >
              <div
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border mb-3 ${card.status === 'Active' ? 'text-cyan-300 bg-cyan-400/10 border-cyan-400/20' : 'text-emerald-300 bg-emerald-400/10 border-emerald-400/20'}`}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-current" />
                {card.status}
              </div>
              <h3 className="text-slate-200 font-semibold text-sm mb-2">{card.title}</h3>
              <div className="flex flex-wrap gap-1 mb-3">
                {card.tags.map((t) => (
                  <span key={t} className="px-1.5 py-0.5 rounded text-xs text-slate-500 bg-white/[0.04] border border-white/[0.06]">{t}</span>
                ))}
              </div>
              <div className="space-y-1.5 text-xs text-slate-500">
                <div className="flex justify-between">
                  <span>Milestones</span>
                  <span className="text-slate-400 tabular-nums">{card.milestones}</span>
                </div>
                <div className="flex justify-between">
                  <span>Total</span>
                  <span className="text-slate-300 font-semibold tabular-nums">{card.total} USDC</span>
                </div>
              </div>
              <div className="mt-3 pt-3 border-t border-white/[0.06] text-xs text-slate-700 italic">
                Demo only — testnet USDC, no real funds
              </div>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ── CTA Band ── */}
      <InViewSection>
        <section className="max-w-5xl mx-auto px-4 pb-20">
          <div
            className="rounded-2xl p-8 sm:p-12 text-center relative overflow-hidden"
            style={{ background: 'linear-gradient(135deg, rgba(124,58,237,0.18) 0%, rgba(217,70,239,0.12) 50%, rgba(14,165,233,0.10) 100%)', border: '1px solid rgba(124,58,237,0.25)' }}
          >
            <div className="absolute inset-0 pointer-events-none">
              <div className="absolute inset-0 bg-gradient-to-b from-transparent to-[#080d18]/60" />
            </div>
            <div className="relative">
              <h2 className="display text-3xl sm:text-4xl font-bold text-white mb-4" style={{ letterSpacing: '-0.025em' }}>
                Ready to try it?
              </h2>
              <p className="text-slate-400 max-w-lg mx-auto mb-8 text-pretty">
                Connect your wallet, get free testnet USDC from the sidebar, and create your first milestone agreement in minutes.
              </p>
              {isConnected ? (
                <TxButton onClick={onGetStarted} size="lg">
                  Open Dashboard
                  <ArrowRight className="w-5 h-5" />
                </TxButton>
              ) : (
                <ConnectKitButton.Custom>
                  {({ show }) => (
                    <TxButton onClick={show} size="lg">
                      Connect Wallet
                      <ArrowRight className="w-5 h-5" />
                    </TxButton>
                  )}
                </ConnectKitButton.Custom>
              )}
            </div>
          </div>
        </section>
      </InViewSection>

      {/* ── Disclaimer ── */}
      <div className="max-w-5xl mx-auto px-4 pb-16">
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 px-5 py-4 text-amber-300/70 text-xs leading-relaxed">
          <strong className="text-amber-300">Educational Testnet Prototype.</strong>{' '}
          ARC TRUSTPAY runs on Arc Testnet. All USDC is testnet-only with no real monetary value.
          The smart contract has not been audited for mainnet production use.
          The designated resolver is a trust assumption — onchain verification of subjective work quality is not possible.
          Do not use this with real funds.
        </div>
      </div>
    </div>
  )
}
