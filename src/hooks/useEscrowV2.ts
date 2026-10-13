import { useReadContract, useReadContracts } from 'wagmi'
import { erc20Abi, type Abi } from 'viem'
import {
  MILESTONE_ESCROW_V2_ADDRESS,
  MILESTONE_ESCROW_V2_ABI,
  USDC_ADDRESS,
  ARC_TESTNET_ID,
} from '@/contractV2'

export type SubmissionRecord = {
  deliverableRef: string
  evidenceHash: `0x${string}`
  submittedAt: bigint
  revisionNumber: bigint
  clientComment: string
}

export type MilestoneV2 = {
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
  acceptanceCriteria: string
  evidenceHash: `0x${string}`
  revisionCount: bigint
  lastActivityAt: bigint
}

export type AgreementV2 = {
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
  autoRelease: boolean
  reviewWindowSeconds: bigint
  autoReleaseEnabled: boolean
  milestones: MilestoneV2[]
}

export function useAgreementV2(id: bigint | undefined) {
  return useReadContract({
    address: MILESTONE_ESCROW_V2_ADDRESS,
    abi: MILESTONE_ESCROW_V2_ABI,
    functionName: 'getAgreement',
    args: id !== undefined ? [id] : undefined,
    chainId: ARC_TESTNET_ID,
    query: { enabled: id !== undefined },
  })
}

export function useAgreementsByClientV2(client: string | undefined) {
  return useReadContract({
    address: MILESTONE_ESCROW_V2_ADDRESS,
    abi: MILESTONE_ESCROW_V2_ABI,
    functionName: 'getAgreementsByClient',
    args: client ? [client as `0x${string}`] : undefined,
    chainId: ARC_TESTNET_ID,
    query: { enabled: !!client },
  })
}

export function useAgreementsByFreelancerV2(freelancer: string | undefined) {
  return useReadContract({
    address: MILESTONE_ESCROW_V2_ADDRESS,
    abi: MILESTONE_ESCROW_V2_ABI,
    functionName: 'getAgreementsByFreelancer',
    args: freelancer ? [freelancer as `0x${string}`] : undefined,
    chainId: ARC_TESTNET_ID,
    query: { enabled: !!freelancer },
  })
}

export function useMultipleAgreementsV2(ids: bigint[]) {
  return useReadContracts({
    contracts: ids.map((id) => ({
      address: MILESTONE_ESCROW_V2_ADDRESS as `0x${string}`,
      abi: MILESTONE_ESCROW_V2_ABI as Abi,
      functionName: 'getAgreement',
      args: [id],
      chainId: ARC_TESTNET_ID,
    })),
    query: { enabled: ids.length > 0 },
  })
}

export function useSubmissionHistory(
  agreementId: bigint | undefined,
  milestoneIndex: number | undefined,
) {
  return useReadContract({
    address: MILESTONE_ESCROW_V2_ADDRESS,
    abi: MILESTONE_ESCROW_V2_ABI,
    functionName: 'getSubmissionHistory',
    args:
      agreementId !== undefined && milestoneIndex !== undefined
        ? [agreementId, BigInt(milestoneIndex)]
        : undefined,
    chainId: ARC_TESTNET_ID,
    query: { enabled: agreementId !== undefined && milestoneIndex !== undefined },
  })
}

export function usePendingWithdrawalV2(address: string | undefined) {
  return useReadContract({
    address: MILESTONE_ESCROW_V2_ADDRESS,
    abi: MILESTONE_ESCROW_V2_ABI,
    functionName: 'pendingWithdrawals',
    args: address ? [address as `0x${string}`, USDC_ADDRESS] : undefined,
    chainId: ARC_TESTNET_ID,
    query: { enabled: !!address },
  })
}

export function useUsdcAllowanceV2(owner: string | undefined) {
  return useReadContract({
    address: USDC_ADDRESS,
    abi: erc20Abi,
    functionName: 'allowance',
    args: owner ? [owner as `0x${string}`, MILESTONE_ESCROW_V2_ADDRESS] : undefined,
    chainId: ARC_TESTNET_ID,
    query: { enabled: !!owner },
  })
}
