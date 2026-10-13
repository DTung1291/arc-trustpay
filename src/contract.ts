import artifact from '../contracts/out/MilestoneEscrow.sol/MilestoneEscrow.json'

export const MILESTONE_ESCROW_ADDRESS = '0x7bc763a8f42426030e67f36f7b334d2cc9e0dd76' as const
export const MILESTONE_ESCROW_ABI = artifact.abi

export const ARC_TESTNET_ID = 5042002
export const USDC_ADDRESS = '0x3600000000000000000000000000000000000000' as const

// Enum mirrors (must stay in sync with MilestoneEscrow.sol)
export enum AgreementState {
  PENDING = 0,
  ACTIVE = 1,
  COMPLETED = 2,
  CANCELLED = 3,
}

export enum MilestoneState {
  PENDING = 0,
  SUBMITTED = 1,
  APPROVED = 2,
  CLAIMED = 3,
  DISPUTED = 4,
  RESOLVED = 5,
}

export const AGREEMENT_STATE_LABELS: Record<number, string> = {
  0: 'Pending Funding',
  1: 'Active',
  2: 'Completed',
  3: 'Cancelled',
}

export const MILESTONE_STATE_LABELS: Record<number, string> = {
  0: 'Pending',
  1: 'Under Review',
  2: 'Approved',
  3: 'Paid',
  4: 'Disputed',
  5: 'Resolved',
}

export const MILESTONE_STATE_COLORS: Record<number, string> = {
  0: 'text-slate-400 bg-slate-400/10 border-slate-400/20',
  1: 'text-cyan-300 bg-cyan-400/10 border-cyan-400/20',
  2: 'text-emerald-300 bg-emerald-400/10 border-emerald-400/20',
  3: 'text-violet-300 bg-violet-400/10 border-violet-400/20',
  4: 'text-amber-300 bg-amber-400/10 border-amber-400/20',
  5: 'text-sky-300 bg-sky-400/10 border-sky-400/20',
}

export const AGREEMENT_STATE_COLORS: Record<number, string> = {
  0: 'text-slate-400 bg-slate-400/10 border-slate-400/20',
  1: 'text-cyan-300 bg-cyan-400/10 border-cyan-400/20',
  2: 'text-emerald-300 bg-emerald-400/10 border-emerald-400/20',
  3: 'text-red-400 bg-red-400/10 border-red-400/20',
}
