# ARC TRUSTPAY

> Built with Arc Studio — milestone-based USDC escrow for freelancers on Arc Testnet.

## What This App Does

ARC TRUSTPAY is a decentralized freelance payment platform where clients lock testnet USDC in a milestone-based escrow. Freelancers receive payment milestone-by-milestone as work is submitted and approved. Built-in dispute resolution via a designated resolver. All funds are testnet USDC with no real value.

**Educational Testnet Prototype — not audited for mainnet production use.**

## Deployed Contracts

| Contract | Network | Address | Explorer |
|---|---|---|---|
| MilestoneEscrow | Arc Testnet | 0x7bc763a8f42426030e67f36f7b334d2cc9e0dd76 | https://explorer.testnet.arc.io/address/0x7bc763a8f42426030e67f36f7b334d2cc9e0dd76 |

**Constructor arg:** `acceptedToken = 0x3600000000000000000000000000000000000000` (Arc Testnet USDC)

## Tech Stack

- Frontend: React 18, Vite, TypeScript, Tailwind CSS
- Web3: wagmi v2, viem v2, ConnectKit
- Contracts: Solidity 0.8.28 + Foundry, OpenZeppelin 5.1.0
- Chain: Arc Testnet (Chain ID: 5042002)
- Token: USDC 6 decimals at 0x3600000000000000000000000000000000000000

## Key Files

- `src/App.tsx` — main navigation shell
- `src/contract.ts` — deployed address, ABI, enum mirrors
- `src/hooks/useEscrow.ts` — all read hooks
- `src/utils/format.ts` — USDC formatting, error parsing
- `src/components/LandingPage.tsx` — hero / landing
- `src/components/Dashboard.tsx` — client + freelancer dashboard
- `src/components/CreateAgreement.tsx` — 3-step agreement creation + fund flow
- `src/components/AgreementDetail.tsx` — full agreement view with all actions
- `src/components/FreelancerWorkspace.tsx` — freelancer assignment view
- `src/components/DisputeCenter.tsx` — resolver dispute workflow
- `src/components/TxExplorer.tsx` — live decoded events
- `contracts/MilestoneEscrow.sol` — source contract

## MVP User Flow

1. Connect wallet (MetaMask / injected)
2. Create Agreement: set freelancer + resolver addresses, add 3 milestones with USDC amounts
3. Fund Escrow: approve USDC, then fund (2 tx)
4. As freelancer: Submit Deliverable (IPFS hash or URL)
5. As client: Approve milestone
6. As freelancer: Claim payment (credits pendingWithdrawals)
7. Withdraw: freelancer calls withdraw() to pull USDC to wallet
8. View events in Transaction Explorer

## Contract Known Limitations

- **Unaudited** — educational prototype only
- Resolver is a trust assumption — not decentralized arbitration
- Once partial progress is made, unsubmitted remaining milestones can only be recovered via clientAbortActive after 30 days of zero activity (no further submissions after partial start)
- No onchain verification of subjective work quality

## To Run

```bash
bun install
bun run dev
```
