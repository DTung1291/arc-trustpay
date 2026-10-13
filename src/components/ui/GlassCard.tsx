import { ReactNode, MouseEvent } from 'react'
import { clsx } from 'clsx'

interface GlassCardProps {
  children: ReactNode
  className?: string
  hover?: boolean
  onClick?: (e: MouseEvent<HTMLDivElement>) => void
  accent?: 'none' | 'violet' | 'cyan' | 'emerald' | 'amber' | 'sky'
  glow?: boolean
}

const ACCENT_CLASSES: Record<string, string> = {
  none: 'border-white/[0.08]',
  violet: 'border-violet-500/25',
  cyan: 'border-cyan-500/25',
  emerald: 'border-emerald-500/25',
  amber: 'border-amber-500/25',
  sky: 'border-sky-500/25',
}

const ACCENT_GLOW: Record<string, string> = {
  violet: 'shadow-violet-500/10',
  cyan: 'shadow-cyan-500/10',
  emerald: 'shadow-emerald-500/10',
  amber: 'shadow-amber-500/10',
  sky: 'shadow-sky-500/10',
}

export function GlassCard({ children, className, hover, onClick, accent = 'none', glow }: GlassCardProps) {
  const borderClass = ACCENT_CLASSES[accent] ?? ACCENT_CLASSES.none
  const glowClass = glow && accent !== 'none' ? `shadow-lg ${ACCENT_GLOW[accent] ?? ''}` : ''

  return (
    <div
      className={clsx(
        'rounded-2xl border bg-white/[0.03] backdrop-blur-sm',
        borderClass,
        glowClass,
        hover && 'cursor-pointer hover:bg-white/[0.055] hover:border-white/[0.13] transition-all duration-150',
        onClick && 'cursor-pointer',
        className
      )}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') onClick(e as unknown as MouseEvent<HTMLDivElement>) } : undefined}
    >
      {children}
    </div>
  )
}
