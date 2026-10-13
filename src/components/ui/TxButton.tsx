import { ReactNode } from 'react'
import { clsx } from 'clsx'
import { Loader2, CheckCircle2, XCircle } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'

interface TxButtonProps {
  children: ReactNode
  onClick?: () => void
  disabled?: boolean
  loading?: boolean
  loadingText?: string
  success?: boolean
  successText?: string
  error?: boolean
  errorText?: string
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'success'
  size?: 'sm' | 'md' | 'lg'
  className?: string
  type?: 'button' | 'submit'
}

export function TxButton({
  children,
  onClick,
  disabled,
  loading,
  loadingText,
  success,
  successText,
  error,
  errorText,
  variant = 'primary',
  size = 'md',
  className,
  type = 'button',
}: TxButtonProps) {
  const base =
    'relative inline-flex items-center justify-center gap-2 font-semibold rounded-xl transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/60 disabled:opacity-50 disabled:cursor-not-allowed select-none overflow-hidden'

  const variants = {
    primary:
      'bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white hover:from-violet-500 hover:to-fuchsia-500 shadow-lg shadow-violet-500/20 active:scale-[0.98]',
    secondary:
      'bg-white/[0.07] border border-white/[0.12] text-slate-200 hover:bg-white/[0.11] active:scale-[0.98]',
    ghost: 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.05] active:scale-[0.98]',
    danger:
      'bg-red-500/10 border border-red-500/30 text-red-400 hover:bg-red-500/20 active:scale-[0.98]',
    success:
      'bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20 active:scale-[0.98]',
  }

  const sizes = {
    sm: 'px-3 py-1.5 text-xs min-h-[32px]',
    md: 'px-5 py-2.5 text-sm min-h-[44px]',
    lg: 'px-7 py-3.5 text-base min-h-[52px]',
  }

  const isSuccessState = success && !loading
  const isErrorState = error && !loading

  return (
    <button
      type={type}
      className={clsx(
        base,
        isSuccessState ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-400' : '',
        isErrorState ? 'bg-red-500/10 border border-red-500/30 text-red-400' : '',
        !isSuccessState && !isErrorState ? variants[variant] : '',
        sizes[size],
        className
      )}
      onClick={onClick}
      disabled={disabled || loading}
    >
      <AnimatePresence mode="wait" initial={false}>
        {loading ? (
          <motion.span
            key="loading"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            className="inline-flex items-center gap-2"
          >
            <Loader2 className="w-4 h-4 animate-spin shrink-0" />
            {loadingText ?? 'Processing...'}
          </motion.span>
        ) : isSuccessState ? (
          <motion.span
            key="success"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            className="inline-flex items-center gap-2"
          >
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            {successText ?? 'Done'}
          </motion.span>
        ) : isErrorState ? (
          <motion.span
            key="error"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            className="inline-flex items-center gap-2"
          >
            <XCircle className="w-4 h-4 shrink-0" />
            {errorText ?? 'Failed'}
          </motion.span>
        ) : (
          <motion.span
            key="idle"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="inline-flex items-center gap-2"
          >
            {children}
          </motion.span>
        )}
      </AnimatePresence>
    </button>
  )
}
