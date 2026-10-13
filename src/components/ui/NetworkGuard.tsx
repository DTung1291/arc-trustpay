import { useAccount, useSwitchChain } from 'wagmi'
import { AlertTriangle } from 'lucide-react'
import { TxButton } from './TxButton'
import { ARC_TESTNET_ID } from '@/contract'
import { ReactNode } from 'react'

export function NetworkGuard({ children }: { children: ReactNode }) {
  const { chainId, isConnected } = useAccount()
  const { switchChain, isPending } = useSwitchChain()

  if (!isConnected) return <>{children}</>

  if (chainId !== ARC_TESTNET_ID) {
    return (
      <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
        <div className="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center mb-4">
          <AlertTriangle className="w-6 h-6 text-amber-400" />
        </div>
        <h3 className="text-slate-200 font-semibold mb-1.5">Wrong Network</h3>
        <p className="text-slate-500 text-sm mb-5 max-w-xs">
          ARC TRUSTPAY runs on <span className="text-slate-300 font-medium">Arc Testnet</span> only.
        </p>
        <TxButton
          onClick={() => switchChain({ chainId: ARC_TESTNET_ID })}
          loading={isPending}
          loadingText="Switching..."
        >
          Switch to Arc Testnet
        </TxButton>
      </div>
    )
  }

  return <>{children}</>
}
