import { useQuery } from '@tanstack/react-query'
import { usePublicClient, useBlockNumber } from 'wagmi'
import { decodeEventLog, type Abi } from 'viem'
import { MILESTONE_ESCROW_ADDRESS, MILESTONE_ESCROW_ABI, ARC_TESTNET_ID } from '@/contract'
import { MILESTONE_ESCROW_V2_ADDRESS, MILESTONE_ESCROW_V2_ABI } from '@/contractV2'

export type PaymentType = 'Approved' | 'Auto Release' | 'Dispute Settlement – Freelancer' | 'Dispute Settlement – Client Refund'

export type Receipt = {
  id: string                  // deterministic: `${contractVersion}-${txHash}-${agreementId}-${milestoneIndex}-${type}`
  contractVersion: 'V1' | 'V2'
  contractAddress: string
  agreementId: bigint
  milestoneIndex: bigint
  projectTitle: string        // from AgreementCreated event (indexed separately)
  milestoneTitle: string      // not onchain in events; display as "Milestone #N"
  clientAddress: string
  freelancerAddress: string
  amount: bigint
  paymentType: PaymentType
  txHash: string
  blockNumber: bigint
  confirmedAt: number         // unix seconds — from block timestamp
  status: 'confirmed'
  note?: string               // resolver note for disputes
}

interface RawLog {
  txHash: string
  blockNumber: bigint
  eventName: string
  args: Record<string, unknown>
  contractVersion: 'V1' | 'V2'
  contractAddress: string
}

async function fetchAllLogs(
  publicClient: ReturnType<typeof usePublicClient>,
  fromBlock: bigint
): Promise<RawLog[]> {
  if (!publicClient) return []
  const [v1Raw, v2Raw] = await Promise.all([
    publicClient.getLogs({ address: MILESTONE_ESCROW_ADDRESS as `0x${string}`, fromBlock, toBlock: 'latest' }),
    publicClient.getLogs({ address: MILESTONE_ESCROW_V2_ADDRESS as `0x${string}`, fromBlock, toBlock: 'latest' }),
  ])

  const decoded: RawLog[] = []
  for (const [raw, abi, ver, addr] of [
    [v1Raw, MILESTONE_ESCROW_ABI, 'V1', MILESTONE_ESCROW_ADDRESS],
    [v2Raw, MILESTONE_ESCROW_V2_ABI, 'V2', MILESTONE_ESCROW_V2_ADDRESS],
  ] as const) {
    for (const log of raw) {
      try {
        const d = decodeEventLog({ abi: abi as Abi, data: log.data, topics: log.topics })
        decoded.push({
          txHash: log.transactionHash ?? '',
          blockNumber: log.blockNumber ?? 0n,
          eventName: (d.eventName as unknown as string) ?? '',
          args: (d.args ?? {}) as Record<string, unknown>,
          contractVersion: ver,
          contractAddress: addr,
        })
      } catch { /* skip */ }
    }
  }
  return decoded
}

export function useReceipts() {
  const publicClient = usePublicClient({ chainId: ARC_TESTNET_ID })
  const { data: blockNumber } = useBlockNumber({ chainId: ARC_TESTNET_ID, watch: false })

  return useQuery({
    queryKey: ['receipts', blockNumber?.toString()],
    queryFn: async (): Promise<Receipt[]> => {
      if (!publicClient) return []
      const fromBlock = blockNumber && blockNumber > 5000n ? blockNumber - 5000n : 0n
      const logs = await fetchAllLogs(publicClient, fromBlock)

      // Build agreementId → {client, freelancer, title} from AgreementCreated
      const agreementMeta: Record<string, { client: string; freelancer: string; title: string }> = {}
      for (const l of logs) {
        if (l.eventName === 'AgreementCreated') {
          const id = String(l.args['agreementId'])
          agreementMeta[`${l.contractVersion}-${id}`] = {
            client: typeof l.args['client'] === 'string' ? l.args['client'] : '',
            freelancer: typeof l.args['freelancer'] === 'string' ? l.args['freelancer'] : '',
            title: typeof l.args['title'] === 'string' ? l.args['title'] : '',
          }
        }
      }

      // Fetch block timestamps for claimed/resolved events
      const blocksNeeded = new Set<bigint>()
      for (const l of logs) {
        if (l.eventName === 'MilestoneClaimed' || l.eventName === 'DisputeResolved') {
          blocksNeeded.add(l.blockNumber)
        }
      }
      const blockTs: Record<string, number> = {}
      await Promise.all(
        [...blocksNeeded].map(async (bn) => {
          try {
            const b = await publicClient.getBlock({ blockNumber: bn })
            blockTs[bn.toString()] = Number(b.timestamp)
          } catch { /* skip */ }
        })
      )

      const receipts: Receipt[] = []

      for (const l of logs) {
        if (l.eventName === 'MilestoneClaimed') {
          const agId = l.args['agreementId'] as bigint
          const mIdx = l.args['milestoneIndex'] as bigint
          const amount = l.args['amount'] as bigint
          const key = `${l.contractVersion}-${agId.toString()}`
          const meta = agreementMeta[key] ?? { client: '', freelancer: typeof l.args['freelancer'] === 'string' ? l.args['freelancer'] : '', title: '' }

          // Determine if this was auto-release: if the claimedAt is after reviewWindowEnd
          // We can't tell from the event alone; label as 'Approved' for now — the AuditTrail handles nuance
          const paymentType: PaymentType = 'Approved'

          receipts.push({
            id: `${l.contractVersion}-${l.txHash}-${agId}-${mIdx}-claimed`,
            contractVersion: l.contractVersion,
            contractAddress: l.contractAddress,
            agreementId: agId,
            milestoneIndex: mIdx,
            projectTitle: meta.title || `Agreement #${agId.toString()}`,
            milestoneTitle: `Milestone #${(Number(mIdx) + 1)}`,
            clientAddress: meta.client,
            freelancerAddress: meta.freelancer,
            amount,
            paymentType,
            txHash: l.txHash,
            blockNumber: l.blockNumber,
            confirmedAt: blockTs[l.blockNumber.toString()] ?? 0,
            status: 'confirmed',
          })
        }

        if (l.eventName === 'DisputeResolved') {
          const agId = l.args['agreementId'] as bigint
          const mIdx = l.args['milestoneIndex'] as bigint
          const freelancerAmount = l.args['freelancerAmount'] as bigint
          const clientRefund = l.args['clientRefund'] as bigint
          const note = typeof l.args['note'] === 'string' ? l.args['note'] : ''
          const key = `${l.contractVersion}-${agId.toString()}`
          const meta = agreementMeta[key] ?? { client: '', freelancer: '', title: '' }
          const ts = blockTs[l.blockNumber.toString()] ?? 0

          if (freelancerAmount > 0n) {
            receipts.push({
              id: `${l.contractVersion}-${l.txHash}-${agId}-${mIdx}-resolve-fl`,
              contractVersion: l.contractVersion,
              contractAddress: l.contractAddress,
              agreementId: agId,
              milestoneIndex: mIdx,
              projectTitle: meta.title || `Agreement #${agId.toString()}`,
              milestoneTitle: `Milestone #${(Number(mIdx) + 1)}`,
              clientAddress: meta.client,
              freelancerAddress: meta.freelancer,
              amount: freelancerAmount,
              paymentType: 'Dispute Settlement – Freelancer',
              txHash: l.txHash,
              blockNumber: l.blockNumber,
              confirmedAt: ts,
              status: 'confirmed',
              note,
            })
          }

          if (clientRefund > 0n) {
            receipts.push({
              id: `${l.contractVersion}-${l.txHash}-${agId}-${mIdx}-resolve-cl`,
              contractVersion: l.contractVersion,
              contractAddress: l.contractAddress,
              agreementId: agId,
              milestoneIndex: mIdx,
              projectTitle: meta.title || `Agreement #${agId.toString()}`,
              milestoneTitle: `Milestone #${(Number(mIdx) + 1)}`,
              clientAddress: meta.client,
              freelancerAddress: meta.freelancer,
              amount: clientRefund,
              paymentType: 'Dispute Settlement – Client Refund',
              txHash: l.txHash,
              blockNumber: l.blockNumber,
              confirmedAt: ts,
              status: 'confirmed',
              note,
            })
          }
        }
      }

      // Newest first
      return receipts.sort((a, b) => b.confirmedAt - a.confirmedAt)
    },
    enabled: !!publicClient,
    staleTime: 30_000,
  })
}
