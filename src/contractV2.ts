import artifact from '../contracts/out/MilestoneEscrowV2.sol/MilestoneEscrowV2.json'

export const MILESTONE_ESCROW_V2_ADDRESS = '0xbddde8b247f93748d8ef076848f5fac3238810db' as const
export const MILESTONE_ESCROW_V2_ABI = artifact.abi

export const ARC_TESTNET_ID = 5042002
export const USDC_ADDRESS = '0x3600000000000000000000000000000000000000' as const

// V2 extends V1 enum with REVISION_REQUESTED = 6
export enum AgreementState {
  PENDING = 0,
  ACTIVE = 1,
  COMPLETED = 2,
  CANCELLED = 3,
}

export enum MilestoneStateV2 {
  PENDING = 0,
  SUBMITTED = 1,
  APPROVED = 2,
  CLAIMED = 3,
  DISPUTED = 4,
  RESOLVED = 5,
  REVISION_REQUESTED = 6,
}

export const AGREEMENT_STATE_LABELS: Record<number, string> = {
  0: 'Pending Funding',
  1: 'Active',
  2: 'Completed',
  3: 'Cancelled',
}

export const MILESTONE_STATE_LABELS_V2: Record<number, string> = {
  0: 'Pending',
  1: 'Under Review',
  2: 'Approved',
  3: 'Paid',
  4: 'Disputed',
  5: 'Resolved',
  6: 'Revision Requested',
}

export const MILESTONE_STATE_COLORS_V2: Record<number, string> = {
  0: 'text-slate-400 bg-slate-400/10 border-slate-400/20',
  1: 'text-cyan-300 bg-cyan-400/10 border-cyan-400/20',
  2: 'text-emerald-300 bg-emerald-400/10 border-emerald-400/20',
  3: 'text-violet-300 bg-violet-400/10 border-violet-400/20',
  4: 'text-amber-300 bg-amber-400/10 border-amber-400/20',
  5: 'text-sky-300 bg-sky-400/10 border-sky-400/20',
  6: 'text-orange-300 bg-orange-400/10 border-orange-400/20',
}

export const AGREEMENT_STATE_COLORS: Record<number, string> = {
  0: 'text-slate-400 bg-slate-400/10 border-slate-400/20',
  1: 'text-cyan-300 bg-cyan-400/10 border-cyan-400/20',
  2: 'text-emerald-300 bg-emerald-400/10 border-emerald-400/20',
  3: 'text-red-400 bg-red-400/10 border-red-400/20',
}

/** V2 review window presets (seconds) */
export const REVIEW_WINDOW_PRESETS = [
  { label: '1 hour', seconds: 3600 },
  { label: '24 hours', seconds: 86400 },
  { label: '3 days', seconds: 259200 },
  { label: '7 days (default)', seconds: 604800 },
  { label: '14 days', seconds: 1209600 },
  { label: '30 days', seconds: 2592000 },
] as const
