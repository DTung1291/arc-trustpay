import { formatUnits } from 'viem'

export const USDC_DECIMALS = 6

export function formatUsdc(raw: bigint | string | number): string {
  const n = typeof raw === 'bigint' ? raw : BigInt(raw.toString())
  return formatUnits(n, USDC_DECIMALS)
}

export function formatUsdcDisplay(raw: bigint | string | number): string {
  const val = parseFloat(formatUsdc(raw))
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(val)
}

export function parseUsdc(amount: string): bigint {
  const cleaned = amount.replace(/,/g, '')
  const [integer, fraction = ''] = cleaned.split('.')
  const paddedFraction = fraction.slice(0, USDC_DECIMALS).padEnd(USDC_DECIMALS, '0')
  return BigInt(integer + paddedFraction)
}

export function formatAddress(addr: string): string {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`
}

export function formatDate(ts: bigint | number): string {
  const ms = typeof ts === 'bigint' ? Number(ts) * 1000 : ts * 1000
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(ms))
}

export function formatDatetime(ts: bigint | number): string {
  const ms = typeof ts === 'bigint' ? Number(ts) * 1000 : ts * 1000
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(ms))
}

export function timeAgo(ts: bigint | number): string {
  const seconds = Math.floor(Date.now() / 1000) - (typeof ts === 'bigint' ? Number(ts) : ts)
  if (seconds < 60) return 'just now'
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
  return `${Math.floor(seconds / 86400)}d ago`
}

export function parseOnchainError(error: unknown): string {
  const msg = (error as { message?: string })?.message?.toLowerCase() ?? ''
  if (msg.includes('user rejected') || msg.includes('user denied')) return 'Transaction cancelled.'
  if (msg.includes('insufficient') && msg.includes('balance')) return 'Insufficient USDC balance.'
  if (msg.includes('insufficient') && msg.includes('allowance')) return 'Insufficient USDC allowance — please approve first.'
  if (msg.includes('notclient')) return 'Only the client can perform this action.'
  if (msg.includes('notfreelancer')) return 'Only the freelancer can perform this action.'
  if (msg.includes('notresolver')) return 'Only the designated resolver can perform this action.'
  if (msg.includes('agreementnotpending')) return 'Agreement is no longer in pending state.'
  if (msg.includes('agreementnotactive')) return 'Agreement is not active.'
  if (msg.includes('milestonenotpending')) return 'Milestone is not in pending state.'
  if (msg.includes('milestonenotsubmitted')) return 'Milestone has not been submitted yet.'
  if (msg.includes('milestonenotapproved')) return 'Milestone has not been approved yet.'
  if (msg.includes('milestonenotdisputed')) return 'Milestone is not in dispute.'
  if (msg.includes('alreadyclaimed')) return 'Milestone has already been claimed.'
  if (msg.includes('reviewwindownotelapsed')) return 'Review window has not elapsed yet.'
  if (msg.includes('tooearlytoabort')) return 'Must wait 30 days since funding before aborting.'
  if (msg.includes('milestonesalreadystarted')) return 'Cannot abort — freelancer has submitted at least one milestone.'
  if (msg.includes('nothingtowithraw') || msg.includes('nothingtowithdraw')) return 'No pending balance to withdraw.'
  if (msg.includes('invalidtoken')) return 'Invalid token — only USDC is accepted.'
  if (msg.includes('transferamountmismatch')) return 'Token transfer amount mismatch.'
  if (msg.includes('reverted')) return 'Transaction reverted. Check wallet balance and approvals.'
  return 'Something went wrong. Please try again.'
}
