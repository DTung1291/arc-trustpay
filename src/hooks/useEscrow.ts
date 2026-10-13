import { useReadContract, useReadContracts, useAccount } from 'wagmi'
import { erc20Abi, type Abi } from 'viem'
import { MILESTONE_ESCROW_ADDRESS, MILESTONE_ESCROW_ABI, USDC_ADDRESS, ARC_TESTNET_ID } from '@/contract'

export type Agreement = {
  agreementId: bigint
  client: string
  freelancer: string
  token: string
  totalAmount: bigint
  title: string
  description: string
  resolver: string
  createdAt: bigint
  fundedAt: bigint
  state: number
  totalPaid: bigint
  milestones: Milestone[]
}

export type Milestone = {
  title: string
  description: string
  amount: bigint
  deliverableRef: string
  dueDate: bigint
  reviewWindowEnd: bigint
  submittedAt: bigint
  state: number
  disputeReason: string
  resolutionNote: string
}

export function useAgreement(id: bigint | undefined) {
  return useReadContract({
    address: MILESTONE_ESCROW_ADDRESS,
    abi: MILESTONE_ESCROW_ABI,
    functionName: 'getAgreement',
    args: id !== undefined ? [id] : undefined,
    chainId: ARC_TESTNET_ID,
    query: { enabled: id !== undefined },
  })
}

export function useAgreementsByClient(client: string | undefined) {
  return useReadContract({
    address: MILESTONE_ESCROW_ADDRESS,
    abi: MILESTONE_ESCROW_ABI,
    functionName: 'getAgreementsByClient',
    args: client ? [client as `0x${string}`] : undefined,
    chainId: ARC_TESTNET_ID,
    query: { enabled: !!client },
  })
}

export function useAgreementsByFreelancer(freelancer: string | undefined) {
  return useReadContract({
    address: MILESTONE_ESCROW_ADDRESS,
    abi: MILESTONE_ESCROW_ABI,
    functionName: 'getAgreementsByFreelancer',
    args: freelancer ? [freelancer as `0x${string}`] : undefined,
    chainId: ARC_TESTNET_ID,
    query: { enabled: !!freelancer },
  })
}

export function useMultipleAgreements(ids: bigint[]) {
  return useReadContracts({
    contracts: ids.map((id) => ({
      address: MILESTONE_ESCROW_ADDRESS as `0x${string}`,
      abi: MILESTONE_ESCROW_ABI as Abi,
      functionName: 'getAgreement',
      args: [id],
      chainId: ARC_TESTNET_ID,
    })),
    query: { enabled: ids.length > 0 },
  })
}

export function useUsdcBalance(address: string | undefined) {
  return useReadContract({
    address: USDC_ADDRESS,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: address ? [address as `0x${string}`] : undefined,
    chainId: ARC_TESTNET_ID,
    query: { enabled: !!address },
  })
}

export function useUsdcAllowance(owner: string | undefined) {
  return useReadContract({
    address: USDC_ADDRESS,
    abi: erc20Abi,
    functionName: 'allowance',
    args: owner ? [owner as `0x${string}`, MILESTONE_ESCROW_ADDRESS] : undefined,
    chainId: ARC_TESTNET_ID,
    query: { enabled: !!owner },
  })
}

export function usePendingWithdrawal(address: string | undefined) {
  return useReadContract({
    address: MILESTONE_ESCROW_ADDRESS,
    abi: MILESTONE_ESCROW_ABI,
    functionName: 'pendingWithdrawals',
    args: address ? [address as `0x${string}`, USDC_ADDRESS] : undefined,
    chainId: ARC_TESTNET_ID,
    query: { enabled: !!address },
  })
}

export function useWalletContext() {
  const { address, chainId, isConnected } = useAccount()
  return { address, chainId, isConnected }
}
