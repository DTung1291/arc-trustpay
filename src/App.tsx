import { useState } from 'react'
import { useAccount } from 'wagmi'
import { ConnectKitButton } from 'connectkit'
import { motion, AnimatePresence } from 'framer-motion'
import {
  LayoutDashboard, Plus, Briefcase, Scale, Activity,
  Shield, ChevronDown, Menu, X, ExternalLink, Receipt, BookOpen
} from 'lucide-react'
import { LandingPage } from './components/LandingPage'
import { Dashboard } from './components/Dashboard'
import { CreateAgreement } from './components/CreateAgreement'
import { CreateAgreementV2 } from './components/CreateAgreementV2'
import { AgreementDetail } from './components/AgreementDetail'
import { AgreementDetailV2 } from './components/AgreementDetailV2'
import { FreelancerWorkspace } from './components/FreelancerWorkspace'
import { DisputeCenterV2 } from './components/DisputeCenterV2'
import { TxExplorer } from './components/TxExplorer'
import { PaymentReceipts } from './components/PaymentReceipts'
import { AuditTrail } from './components/AuditTrail'
import { formatAddress } from './utils/format'
import { NetworkGuard } from './components/ui/NetworkGuard'
import { MILESTONE_ESCROW_ADDRESS } from './contract'
import { useUsdcBalance } from './hooks/useEscrow'
import { formatUsdcDisplay } from './utils/format'

type Screen =
  | { id: 'landing' }
  | { id: 'dashboard' }
  | { id: 'create' }
  | { id: 'createV2' }
  | { id: 'agreement'; agreementId: bigint; version?: 'v1' | 'v2' }
  | { id: 'workspace' }
  | { id: 'disputes' }
  | { id: 'receipts' }
  | { id: 'audit' }
  | { id: 'explorer' }

const NAV_ITEMS = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'createV2', label: 'New (V2)', icon: Plus },
  { id: 'create', label: 'New (V1)', icon: Plus },
  { id: 'workspace', label: 'Workspace', icon: Briefcase },
  { id: 'disputes', label: 'Disputes', icon: Scale },
  { id: 'receipts', label: 'Receipts', icon: Receipt },
  { id: 'audit', label: 'Audit Trail', icon: BookOpen },
  { id: 'explorer', label: 'Explorer', icon: Activity },
]

export default function App() {
  const { address, isConnected } = useAccount()
  const [screen, setScreen] = useState<Screen>({ id: 'landing' })
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const { data: usdcBalance } = useUsdcBalance(address)

  const navigate = (id: Screen['id']) => {
    setScreen({ id } as Screen)
    setMobileMenuOpen(false)
  }

  const currentNavId = screen.id === 'agreement' ? 'dashboard' : screen.id

  // Landing page (pre-connect or explicit)
  if (!isConnected || screen.id === 'landing') {
    return (
      <div className="min-h-dvh bg-[#080d18]" style={{ background: 'linear-gradient(180deg, #080d18 0%, #0b1020 60%, #0d1530 100%)' }}>
        <Header onLogoClick={() => setScreen({ id: 'landing' })} onNavClick={navigate} isApp={false} />
        <LandingPage onGetStarted={() => navigate('dashboard')} />
      </div>
    )
  }

  return (
    <div className="min-h-dvh" style={{ background: 'linear-gradient(180deg, #080d18 0%, #0b1020 60%, #0d1530 100%)' }}>
      {/* Top nav */}
      <header className="sticky top-0 z-50 border-b border-white/[0.07] bg-[#080d18]/80 backdrop-blur-xl">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between gap-4">
          {/* Logo */}
          <button onClick={() => navigate('dashboard')} className="flex items-center gap-2.5 shrink-0">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-violet-600 to-fuchsia-600 flex items-center justify-center shadow-lg shadow-violet-500/20">
              <Shield className="w-4 h-4 text-white" />
            </div>
            <span className="display font-bold text-white text-sm tracking-tight hidden sm:block">TRUSTPAY</span>
          </button>

          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-1">
            {NAV_ITEMS.map((item) => (
              <button
                key={item.id}
                onClick={() => navigate(item.id as Screen['id'])}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-all ${currentNavId === item.id ? 'bg-white/[0.08] text-white' : 'text-slate-500 hover:text-slate-200 hover:bg-white/[0.04]'}`}
              >
                <item.icon className="w-4 h-4" />
                {item.label}
              </button>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            {/* USDC balance chip */}
            {usdcBalance !== undefined && (
              <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/[0.05] border border-white/[0.07] text-xs">
                <span className="w-2 h-2 rounded-full bg-emerald-400" />
                <span className="tabular-nums text-slate-300 font-semibold">{formatUsdcDisplay(usdcBalance)}</span>
                <span className="text-slate-600">USDC</span>
              </div>
            )}
            {/* Network pill */}
            <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-violet-500/10 border border-violet-500/20 text-xs text-violet-300 font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-pulse" />
              Arc Testnet
            </div>
            <ConnectKitButton.Custom>
              {({ show, address: addr }) => (
                <button
                  onClick={show}
                  className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/[0.06] border border-white/[0.09] text-slate-300 hover:bg-white/[0.10] hover:text-white transition-all text-sm font-medium"
                >
                  <div className="w-5 h-5 rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-500" />
                  <span className="mono hidden sm:block">{addr ? formatAddress(addr) : 'Connect'}</span>
                  <ChevronDown className="w-3.5 h-3.5 opacity-60" />
                </button>
              )}
            </ConnectKitButton.Custom>
            {/* Mobile menu button */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden w-9 h-9 rounded-lg bg-white/[0.05] border border-white/[0.08] flex items-center justify-center text-slate-400"
            >
              {mobileMenuOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Mobile menu */}
        <AnimatePresence>
          {mobileMenuOpen && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="md:hidden border-t border-white/[0.07] bg-[#080d18]/95 backdrop-blur-xl overflow-hidden"
            >
              <div className="px-4 py-3 space-y-1">
                {NAV_ITEMS.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => navigate(item.id as Screen['id'])}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${currentNavId === item.id ? 'bg-white/[0.08] text-white' : 'text-slate-500 hover:text-slate-200'}`}
                  >
                    <item.icon className="w-5 h-5" />
                    {item.label}
                  </button>
                ))}
                {usdcBalance !== undefined && (
                  <div className="pt-2 px-4 text-xs text-slate-600">
                    Balance: <span className="tabular-nums text-slate-400 font-semibold">{formatUsdcDisplay(usdcBalance)} USDC</span>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </header>

      {/* Content */}
      <main>
        <AnimatePresence mode="wait">
          <motion.div
            key={screen.id + (screen.id === 'agreement' ? (screen).agreementId?.toString() : '')}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.18 }}
          >
            <NetworkGuard>
              {screen.id === 'dashboard' && (
                <Dashboard
                  onCreateAgreement={() => navigate('create')}
                  onViewAgreement={(id) => setScreen({ id: 'agreement', agreementId: id })}
                />
              )}
              {screen.id === 'create' && (
                <CreateAgreement
                  onBack={() => navigate('dashboard')}
                  onCreated={(id) => setScreen({ id: 'agreement', agreementId: id, version: 'v1' })}
                />
              )}
              {screen.id === 'createV2' && (
                <CreateAgreementV2
                  onBack={() => navigate('dashboard')}
                  onCreated={(id) => setScreen({ id: 'agreement', agreementId: id, version: 'v2' })}
                />
              )}
              {screen.id === 'agreement' && (screen).version !== 'v2' && (
                <AgreementDetail
                  agreementId={(screen).agreementId}
                  onBack={() => navigate('dashboard')}
                />
              )}
              {screen.id === 'agreement' && (screen).version === 'v2' && (
                <AgreementDetailV2
                  agreementId={(screen).agreementId}
                  onBack={() => navigate('dashboard')}
                />
              )}
              {screen.id === 'workspace' && (
                <FreelancerWorkspace onViewAgreement={(id) => setScreen({ id: 'agreement', agreementId: id })} />
              )}
              {screen.id === 'disputes' && (
                <DisputeCenterV2
                  onViewAgreement={(id, version) => setScreen({ id: 'agreement', agreementId: id, version: version ?? 'v1' })}
                />
              )}
              {screen.id === 'receipts' && <PaymentReceipts />}
              {screen.id === 'audit' && <AuditTrail />}
              {screen.id === 'explorer' && <TxExplorer />}
            </NetworkGuard>
          </motion.div>
        </AnimatePresence>
      </main>

      {/* Footer */}
      <footer className="border-t border-white/[0.05] mt-20 py-8 px-4">
        <div className="max-w-5xl mx-auto flex flex-wrap items-center justify-between gap-4 text-xs text-slate-700">
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded-lg bg-gradient-to-br from-violet-600 to-fuchsia-600 flex items-center justify-center">
              <Shield className="w-3 h-3 text-white" />
            </div>
            <span>ARC TRUSTPAY — Educational Testnet Prototype</span>
          </div>
          <div className="flex items-center gap-4">
            <a href={`https://explorer.testnet.arc.io/address/${MILESTONE_ESCROW_ADDRESS}`} target="_blank" rel="noopener noreferrer" className="hover:text-slate-400 transition-colors flex items-center gap-1">
              V1 <ExternalLink className="w-3 h-3" />
            </a>
            <a href="https://explorer.testnet.arc.io/address/0xbddde8b247f93748d8ef076848f5fac3238810db" target="_blank" rel="noopener noreferrer" className="hover:text-slate-400 transition-colors flex items-center gap-1">
              V2 <ExternalLink className="w-3 h-3" />
            </a>
            <span>Not audited for mainnet production use.</span>
          </div>
        </div>
      </footer>
    </div>
  )
}

interface HeaderProps {
  onLogoClick: () => void
  onNavClick: (id: Screen['id']) => void
  isApp: boolean
}

function Header({ onLogoClick }: HeaderProps) {
  return (
    <header className="sticky top-0 z-50 border-b border-white/[0.07] bg-[#080d18]/80 backdrop-blur-xl">
      <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
        <button onClick={onLogoClick} className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-violet-600 to-fuchsia-600 flex items-center justify-center shadow-lg shadow-violet-500/20">
            <Shield className="w-4 h-4 text-white" />
          </div>
          <div className="flex items-center gap-1.5">
            <span className="display font-bold text-white text-sm tracking-tight">ARC</span>
            <span className="text-violet-400 font-semibold text-sm tracking-wider">TRUSTPAY</span>
          </div>
        </button>
        <ConnectKitButton />
      </div>
    </header>
  )
}
