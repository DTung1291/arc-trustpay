import { useState } from 'react'
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useSwitchChain, useReadContract } from 'wagmi'
import { erc20Abi, parseUnits } from 'viem'
import { toast } from 'sonner'
import { Plus, Trash2, ArrowLeft, CalendarDays, ChevronRight } from 'lucide-react'
import { motion } from 'framer-motion'
import { MILESTONE_ESCROW_ADDRESS, MILESTONE_ESCROW_ABI, USDC_ADDRESS, ARC_TESTNET_ID } from '@/contract'
import { parseUsdc, formatUsdcDisplay, parseOnchainError } from '@/utils/format'
import { TxButton } from './ui/TxButton'
import { GlassCard } from './ui/GlassCard'
import { NetworkGuard } from './ui/NetworkGuard'

interface MilestoneInput {
  title: string
  description: string
  amount: string
  dueDate: string
}

const DEFAULT_MILESTONE: MilestoneInput = {
  title: '',
  description: '',
  amount: '',
  dueDate: '',
}

interface Props {
  onBack: () => void
  onCreated: (id: bigint) => void
}

export function CreateAgreement({ onBack, onCreated }: Props) {
  const { address, chainId } = useAccount()
  const { switchChain } = useSwitchChain()

  const [step, setStep] = useState<'details' | 'milestones' | 'review'>('details')
  const [freelancer, setFreelancer] = useState('')
  const [resolver, setResolver] = useState('')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [milestones, setMilestones] = useState<MilestoneInput[]>([{ ...DEFAULT_MILESTONE }])
  const [fundingStep, setFundingStep] = useState<'idle' | 'approving' | 'funding' | 'done'>('idle')

  const totalAmount = milestones.reduce((sum, m) => {
    try { return sum + parseUsdc(m.amount || '0') } catch { return sum }
  }, 0n)

  // Create agreement
  const {
    writeContract: writeCreate,
    data: createHash,
    isPending: createPending,
    reset: resetCreate,
  } = useWriteContract()
  const { isLoading: createConfirming, isSuccess: createSuccess, data: createReceipt } = useWaitForTransactionReceipt({ hash: createHash })

  // Get agreement ID from logs after create
  const [pendingFundId, setPendingFundId] = useState<bigint | null>(null)

  // USDC approve
  const { writeContract: writeApprove, data: approveHash, isPending: approvePending, reset: resetApprove } = useWriteContract()
  const { isLoading: approveConfirming, isSuccess: approveSuccess } = useWaitForTransactionReceipt({ hash: approveHash })

  // Fund agreement
  const { writeContract: writeFund, data: fundHash, isPending: fundPending, reset: resetFund } = useWriteContract()
  const { isLoading: fundConfirming, isSuccess: fundSuccess } = useWaitForTransactionReceipt({ hash: fundHash })

  // USDC allowance
  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: USDC_ADDRESS,
    abi: erc20Abi,
    functionName: 'allowance',
    args: address ? [address, MILESTONE_ESCROW_ADDRESS] : undefined,
    chainId: ARC_TESTNET_ID,
    query: { enabled: !!address },
  })

  const addMilestone = () => {
    if (milestones.length >= 20) return
    setMilestones([...milestones, { ...DEFAULT_MILESTONE }])
  }

  const removeMilestone = (i: number) => {
    if (milestones.length <= 1) return
    setMilestones(milestones.filter((_, idx) => idx !== i))
  }

  const updateMilestone = (i: number, field: keyof MilestoneInput, value: string) => {
    const updated = [...milestones]
    updated[i] = { ...updated[i], [field]: value }
    setMilestones(updated)
  }

  const handleCreate = () => {
    if (chainId !== ARC_TESTNET_ID) {
      void switchChain({ chainId: ARC_TESTNET_ID })
      return
    }
    try {
      const ms = milestones.map((m) => ({
        title: m.title,
        description: m.description,
        amount: parseUsdc(m.amount),
        dueDate: m.dueDate ? BigInt(Math.floor(new Date(m.dueDate).getTime() / 1000)) : 0n,
      }))
      void writeCreate({
        address: MILESTONE_ESCROW_ADDRESS,
        abi: MILESTONE_ESCROW_ABI,
        functionName: 'createAgreement',
        args: [freelancer as `0x${string}`, resolver as `0x${string}`, title, description, ms, USDC_ADDRESS],
        chainId: ARC_TESTNET_ID,
      })
    } catch (e) {
      toast.error(parseOnchainError(e))
    }
  }

  // Parse agreement ID from receipt logs
  const getAgreementIdFromReceipt = () => {
    if (!createReceipt) return null
    // AgreementCreated event: first topic is agreementId (indexed)
    for (const log of createReceipt.logs) {
      if (log.topics.length >= 2) {
        try {
          return BigInt(log.topics[1] as string)
        } catch { /* skip */ }
      }
    }
    return null
  }

  const handleApprove = () => {
    const id = getAgreementIdFromReceipt()
    if (!id) return
    setPendingFundId(id)
    setFundingStep('approving')
    void writeApprove({
      address: USDC_ADDRESS,
      abi: erc20Abi,
      functionName: 'approve',
      args: [MILESTONE_ESCROW_ADDRESS, totalAmount],
      chainId: ARC_TESTNET_ID,
    })
  }

  const handleFund = () => {
    if (!pendingFundId) return
    setFundingStep('funding')
    void writeFund({
      address: MILESTONE_ESCROW_ADDRESS,
      abi: MILESTONE_ESCROW_ABI,
      functionName: 'fundAgreement',
      args: [pendingFundId],
      chainId: ARC_TESTNET_ID,
    })
  }

  if (fundSuccess && pendingFundId) {
    return (
      <motion.div initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} className="max-w-xl mx-auto px-4 py-16 text-center">
        <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center mx-auto mb-6">
          <svg className="w-8 h-8 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h2 className="display text-2xl font-bold text-white mb-2" style={{ letterSpacing: '-0.02em' }}>Agreement Funded!</h2>
        <p className="text-slate-400 mb-2">
          <span className="tabular-nums font-semibold text-white">{formatUsdcDisplay(totalAmount)} USDC</span> is now locked in escrow.
        </p>
        <p className="text-slate-500 text-sm mb-8">Agreement #{pendingFundId.toString()} is active. Share it with your freelancer.</p>
        <TxButton onClick={() => onCreated(pendingFundId)} size="lg">
          View Agreement
          <ChevronRight className="w-5 h-5" />
        </TxButton>
      </motion.div>
    )
  }

  if (createSuccess && !fundSuccess) {
    const id = getAgreementIdFromReceipt()
    return (
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="max-w-xl mx-auto px-4 py-12">
        <GlassCard className="p-8">
          <h2 className="display text-2xl font-bold text-white mb-2" style={{ letterSpacing: '-0.02em' }}>Agreement Created</h2>
          <p className="text-slate-400 text-sm mb-6">
            Agreement #{id?.toString()} is created. Now fund it with{' '}
            <span className="text-white font-semibold tabular-nums">{formatUsdcDisplay(totalAmount)} USDC</span> to activate it.
          </p>

          <div className="space-y-4">
            {/* Step 1: Approve */}
            <div className={`rounded-xl border p-4 transition-colors ${fundingStep === 'approving' || fundingStep === 'idle' ? 'border-violet-500/30 bg-violet-500/5' : 'border-white/[0.06] bg-white/[0.02]'}`}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-semibold text-slate-200">Step 1: Approve USDC</span>
                {approveSuccess && <span className="text-emerald-400 text-xs font-semibold">Done</span>}
              </div>
              <p className="text-slate-500 text-xs mb-3">Allow the escrow contract to pull {formatUsdcDisplay(totalAmount)} USDC from your wallet.</p>
              <TxButton
                onClick={handleApprove}
                disabled={approveSuccess}
                loading={approvePending || approveConfirming}
                loadingText={approveConfirming ? 'Confirming...' : 'Waiting for wallet...'}
                variant={approveSuccess ? 'success' : 'primary'}
                size="sm"
              >
                {approveSuccess ? 'Approved' : 'Approve USDC'}
              </TxButton>
            </div>

            {/* Step 2: Fund */}
            <div className={`rounded-xl border p-4 transition-colors ${fundingStep === 'funding' ? 'border-cyan-500/30 bg-cyan-500/5' : 'border-white/[0.06] bg-white/[0.02]'}`}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-semibold text-slate-200">Step 2: Fund Escrow</span>
                {fundSuccess && <span className="text-emerald-400 text-xs font-semibold">Done</span>}
              </div>
              <p className="text-slate-500 text-xs mb-3">Lock the USDC in the escrow contract. Funds are released per milestone only.</p>
              <TxButton
                onClick={handleFund}
                disabled={!approveSuccess || fundSuccess}
                loading={fundPending || fundConfirming}
                loadingText={fundConfirming ? 'Confirming...' : 'Waiting for wallet...'}
                variant="primary"
                size="sm"
              >
                Fund Escrow
              </TxButton>
            </div>
          </div>
        </GlassCard>
      </motion.div>
    )
  }

  return (
    <NetworkGuard>
      <div className="max-w-2xl mx-auto px-4 py-10">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <button
            onClick={onBack}
            className="w-10 h-10 rounded-xl bg-white/[0.05] border border-white/[0.08] flex items-center justify-center text-slate-400 hover:text-slate-200 hover:bg-white/[0.09] transition-all"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="display text-2xl font-bold text-white" style={{ letterSpacing: '-0.02em' }}>Create Agreement</h1>
            <p className="text-slate-500 text-sm">Set up a milestone-based USDC escrow</p>
          </div>
        </div>

        {/* Step indicators */}
        <div className="flex gap-2 mb-8">
          {(['details', 'milestones', 'review'] as const).map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              <button
                onClick={() => {
                  if (s === 'milestones' && !title && !freelancer) return
                  setStep(s)
                }}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${step === s ? 'bg-violet-500/20 text-violet-300 border border-violet-500/30' : i < ['details', 'milestones', 'review'].indexOf(step) ? 'text-slate-400 hover:text-slate-300' : 'text-slate-600'}`}
              >
                <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs ${step === s ? 'bg-violet-500 text-white' : 'bg-white/[0.07] text-slate-500'}`}>{i + 1}</span>
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </button>
              {i < 2 && <ChevronRight className="w-3 h-3 text-slate-700" />}
            </div>
          ))}
        </div>

        <motion.div key={step} initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.25 }}>
          {step === 'details' && (
            <div className="space-y-5">
              <GlassCard className="p-6">
                <h2 className="text-white font-semibold mb-4">Project Details</h2>
                <div className="space-y-4">
                  <Field label="Project Title" required>
                    <input
                      className="input-base"
                      placeholder="e.g. Brand Identity Package"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                    />
                  </Field>
                  <Field label="Description">
                    <textarea
                      className="input-base min-h-[80px] resize-none"
                      placeholder="Describe the scope of work..."
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                    />
                  </Field>
                </div>
              </GlassCard>

              <GlassCard className="p-6">
                <h2 className="text-white font-semibold mb-4">Parties</h2>
                <div className="space-y-4">
                  <Field label="Your Wallet (Client)" hint="Your connected address">
                    <input className="input-base opacity-60 cursor-not-allowed" value={address ?? ''} readOnly />
                  </Field>
                  <Field label="Freelancer Wallet" required>
                    <input
                      className="input-base"
                      placeholder="0x..."
                      value={freelancer}
                      onChange={(e) => setFreelancer(e.target.value)}
                    />
                  </Field>
                  <Field label="Dispute Resolver Wallet" required hint="Neutral third-party who resolves disputes">
                    <input
                      className="input-base"
                      placeholder="0x..."
                      value={resolver}
                      onChange={(e) => setResolver(e.target.value)}
                    />
                  </Field>
                </div>
              </GlassCard>

              <TxButton
                onClick={() => setStep('milestones')}
                disabled={!title || !freelancer.startsWith('0x') || !resolver.startsWith('0x')}
                size="lg"
                className="w-full"
              >
                Next: Define Milestones
                <ChevronRight className="w-5 h-5" />
              </TxButton>
            </div>
          )}

          {step === 'milestones' && (
            <div className="space-y-4">
              {milestones.map((m, i) => (
                <GlassCard key={i} className="p-6">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-7 h-7 rounded-lg bg-violet-500/20 border border-violet-500/30 flex items-center justify-center text-violet-300 text-xs font-bold">{i + 1}</div>
                      <span className="text-white font-semibold text-sm">Milestone {i + 1}</span>
                    </div>
                    {milestones.length > 1 && (
                      <button
                        onClick={() => removeMilestone(i)}
                        className="text-slate-600 hover:text-red-400 transition-colors p-1"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                  <div className="grid sm:grid-cols-2 gap-4">
                    <Field label="Title" required>
                      <input
                        className="input-base"
                        placeholder="e.g. Logo design concepts"
                        value={m.title}
                        onChange={(e) => updateMilestone(i, 'title', e.target.value)}
                      />
                    </Field>
                    <Field label="USDC Amount" required>
                      <div className="relative">
                        <input
                          className="input-base pr-16 tabular-nums"
                          placeholder="0.00"
                          value={m.amount}
                          onChange={(e) => updateMilestone(i, 'amount', e.target.value)}
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm">USDC</span>
                      </div>
                    </Field>
                    <Field label="Description">
                      <input
                        className="input-base"
                        placeholder="What will be delivered..."
                        value={m.description}
                        onChange={(e) => updateMilestone(i, 'description', e.target.value)}
                      />
                    </Field>
                    <Field label="Due Date">
                      <div className="relative">
                        <input
                          className="input-base pr-10"
                          type="date"
                          value={m.dueDate}
                          onChange={(e) => updateMilestone(i, 'dueDate', e.target.value)}
                          style={{ colorScheme: 'dark' }}
                        />
                        <CalendarDays className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
                      </div>
                    </Field>
                  </div>
                </GlassCard>
              ))}

              {milestones.length < 20 && (
                <button
                  onClick={addMilestone}
                  className="w-full rounded-xl border border-dashed border-white/[0.12] py-4 text-slate-500 hover:text-slate-300 hover:border-white/[0.2] hover:bg-white/[0.02] transition-all text-sm flex items-center justify-center gap-2"
                >
                  <Plus className="w-4 h-4" />
                  Add Milestone
                </button>
              )}

              {totalAmount > 0n && (
                <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] px-5 py-4 flex justify-between items-center">
                  <span className="text-slate-400 text-sm">Total escrow amount</span>
                  <span className="text-white font-bold tabular-nums text-lg">{formatUsdcDisplay(totalAmount)} <span className="text-slate-400 font-normal text-sm">USDC</span></span>
                </div>
              )}

              <div className="flex gap-3">
                <TxButton variant="secondary" onClick={() => setStep('details')} className="flex-1">
                  Back
                </TxButton>
                <TxButton
                  onClick={() => setStep('review')}
                  disabled={milestones.some((m) => !m.title || !m.amount)}
                  className="flex-[2]"
                >
                  Review Agreement
                  <ChevronRight className="w-5 h-5" />
                </TxButton>
              </div>
            </div>
          )}

          {step === 'review' && (
            <div className="space-y-5">
              <GlassCard className="p-6">
                <h2 className="text-white font-semibold mb-4">Agreement Summary</h2>
                <div className="space-y-3">
                  <ReviewRow label="Title" value={title} />
                  {description && <ReviewRow label="Description" value={description} />}
                  <ReviewRow label="Freelancer" value={`${freelancer.slice(0, 10)}...${freelancer.slice(-6)}`} mono />
                  <ReviewRow label="Resolver" value={`${resolver.slice(0, 10)}...${resolver.slice(-6)}`} mono />
                  <ReviewRow label="Total USDC" value={`${formatUsdcDisplay(totalAmount)} USDC`} highlight />
                </div>
              </GlassCard>

              <GlassCard className="p-6">
                <h2 className="text-white font-semibold mb-4">Milestones</h2>
                <div className="space-y-3">
                  {milestones.map((m, i) => (
                    <div key={i} className="flex justify-between items-center py-2 border-b border-white/[0.05] last:border-0">
                      <div>
                        <div className="text-slate-200 text-sm font-medium">{m.title}</div>
                        {m.dueDate && <div className="text-slate-600 text-xs mt-0.5">Due {m.dueDate}</div>}
                      </div>
                      <span className="text-white font-semibold tabular-nums text-sm">{m.amount} USDC</span>
                    </div>
                  ))}
                </div>
              </GlassCard>

              <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-amber-300/70 text-xs">
                By proceeding you will first approve the USDC spend, then fund the escrow. Both are separate transactions. Review window per milestone: 7 days.
              </div>

              <div className="flex gap-3">
                <TxButton variant="secondary" onClick={() => setStep('milestones')} className="flex-1">Back</TxButton>
                <TxButton
                  onClick={handleCreate}
                  loading={createPending || createConfirming}
                  loadingText={createConfirming ? 'Confirming...' : 'Waiting for wallet...'}
                  className="flex-[2]"
                >
                  Create Agreement
                </TxButton>
              </div>
            </div>
          )}
        </motion.div>
      </div>
    </NetworkGuard>
  )
}

function Field({ label, children, required, hint }: { label: string; children: React.ReactNode; required?: boolean; hint?: string }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
        {label}{required && <span className="text-violet-400 ml-0.5">*</span>}
      </label>
      {children}
      {hint && <p className="text-slate-600 text-xs mt-1">{hint}</p>}
    </div>
  )
}

function ReviewRow({ label, value, mono, highlight }: { label: string; value: string; mono?: boolean; highlight?: boolean }) {
  return (
    <div className="flex justify-between items-start gap-4">
      <span className="text-slate-500 text-sm shrink-0">{label}</span>
      <span className={`text-right text-sm break-all ${mono ? 'mono text-slate-400' : highlight ? 'text-white font-bold' : 'text-slate-300'}`}>{value}</span>
    </div>
  )
}
