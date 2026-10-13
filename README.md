# ARC TRUSTPAY — Milestone-Based USDC Escrow for Freelancers

> **Educational Testnet Prototype.** All funds are testnet USDC with no real value. The contract has not been audited for mainnet production use.

A decentralized freelance payment application built on **Arc Testnet** where clients lock USDC in a milestone-based escrow smart contract and freelancers receive payment when work is approved — no middlemen, no missing payments.

**Live demo:** https://dtung0102-app-4273f7d5-202b-42d2-8aba-ea98a5e29527.static.hf.space

---

## Contract

| | |
|---|---|
| **Network** | Arc Testnet (Chain ID 5042002) |
| **Contract** | `0x7bc763a8f42426030e67f36f7b334d2cc9e0dd76` |
| **Explorer** | https://explorer.testnet.arc.io/address/0x7bc763a8f42426030e67f36f7b334d2cc9e0dd76 |
| **Token** | Testnet USDC (`0x3600000000000000000000000000000000000000`) |
| **Gas token** | USDC (Arc uses USDC as native gas — no ETH needed) |

---

## What it does

Clients create agreements with up to 20 milestones, each with a USDC allocation, due date, and description. The full amount is locked in the escrow contract at funding time. From there:

1. **Freelancer** submits a deliverable reference (IPFS hash or URL) per milestone
2. **Client** approves or disputes each submission
3. On approval, the **freelancer claims** the milestone payment into a pull-payment balance
4. **Freelancer withdraws** their accumulated balance in one transaction

Disputes are routed to a pre-designated neutral resolver who splits the milestone amount between the parties.

---

## MVP User Flow

```
Connect wallet
  → Create Agreement (title, freelancer wallet, resolver wallet, 3 milestones)
    → Approve USDC spend → Fund Escrow
      → [Switch to freelancer wallet] Submit deliverable reference
        → [Switch to client wallet] Approve milestone
          → [Switch to freelancer wallet] Claim payment
            → Withdraw USDC to wallet
              → Verify on Arc Testnet explorer
```

---

## Screens

| Screen | Description |
|---|---|
| **Landing** | Value proposition, how-it-works flow, sample project cards |
| **Dashboard** | Active escrows, total locked, pending approvals, completed projects |
| **Create Agreement** | 3-step wizard: project details → milestones → review + fund |
| **Agreement Detail** | Animated milestone timeline, all contract actions, tx explorer links |
| **Freelancer Workspace** | Aggregated assignments, inline submit/claim actions |
| **Dispute Center** | Open disputes, resolver resolution UI with split-amount inputs |
| **Transaction Explorer** | Live decoded events from the last 500 blocks |

---

## Smart Contract

`contracts/MilestoneEscrow.sol` — key design decisions:

- **Pull-payment pattern**: claims credit a `pendingWithdrawals` mapping; actual transfer happens in a separate `withdraw()` call. One blocked address cannot brick another party's settlement.
- **USDC enforced onchain**: `ACCEPTED_TOKEN` is set at deploy time; `createAgreement` reverts on any other token.
- **Fee-on-transfer protection**: `fundAgreement` measures `balanceBefore`/`balanceAfter` and rejects any shortfall.
- **Client abort path**: after 30 days of zero activity (no milestone ever submitted), the client can recover funds via `clientAbortActive`.
- **Review window expiry**: after the 7-day review window elapses on a submitted milestone, the freelancer can claim via `claimAfterReviewExpiry` — client inaction cannot permanently lock funds.
- **Dispute resolution**: resolver can split the milestone amount with `resolveDispute(awardToFreelancer, freelancerAmount, note)`.
- **Security**: `ReentrancyGuard` + `nonReentrant` on all token-moving functions, `SafeERC20`, checks-effects-interactions throughout, custom errors for gas efficiency.

### Known limitation
If a freelancer submits at least one milestone and then goes inactive, the client cannot recover USDC for remaining unsubmitted milestones without going through the resolver. This is a known MVP tradeoff.

### Agreement states
`PENDING → ACTIVE → COMPLETED | CANCELLED`

### Milestone states
`PENDING → SUBMITTED → APPROVED → CLAIMED`  
`SUBMITTED → DISPUTED → RESOLVED`  
`SUBMITTED → CLAIMED` (via review expiry)

---

## Tech Stack

| Layer | Technology |
|---|---|
| Smart contract | Solidity 0.8.20, OpenZeppelin 5.1.0, Foundry |
| Frontend | React 18, TypeScript, Vite |
| Styling | Tailwind CSS v3, framer-motion |
| Onchain | wagmi v2, viem, ConnectKit |
| Network | Arc Testnet (USDC as native gas) |

---

## Local Development

### Prerequisites
- [Bun](https://bun.sh) 1.x
- [Foundry](https://getfoundry.sh)
- A wallet with Arc Testnet USDC (get some from the [Arc Studio faucet](https://studio.arc.io))

### Setup

```bash
# Install dependencies
bun install

# Start the dev server
bun run dev
```

Open http://localhost:5173.

### Build the contract

```bash
cd contracts
forge build
```

### Run contract tests

```bash
cd contracts
forge test -v
```

### Environment variables

Copy `.env.example` to `.env` and fill in:

```env
# Arc Testnet RPC (optional — the app reads this from onchain-facts)
VITE_RPC_URL=

# Contract address (already set in src/contract.ts for the deployed instance)
VITE_CONTRACT_ADDRESS=0x7bc763a8f42426030e67f36f7b334d2cc9e0dd76
```

---

## Deploying your own contract instance

```bash
cd /home/user/app/contracts
forge build

# Deploy to Arc Testnet (requires PRIVATE_KEY in env)
forge script script/Deploy.s.sol --rpc-url https://rpc.testnet.arc.io --broadcast
```

Update `MILESTONE_ESCROW_ADDRESS` in `src/contract.ts` with your new address, then pass your testnet USDC address as the `acceptedToken` constructor argument.

---

## Security Notes

- The designated resolver is a **trust assumption** — choose a neutral third party both sides trust.
- There is no onchain verification of subjective work quality.
- This contract has **not been audited** for mainnet production use.
- Do not deploy with real funds without a professional security audit.

---

## License

MIT
