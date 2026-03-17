<p align="center">
  <img src="assets/darksol-banner.png" alt="DARKSOL" width="600" />
</p>
<h3 align="center">Built by DARKSOL 🌑</h3>

# Synthesis Agent

> **An autonomous agent economy orchestrator** — the agent that trades, pays its own bills, outsources skills to other agents, and learns from every decision. Built for [The Synthesis Hackathon](https://synthesis.devfolio.co) (March 15-22, 2026).

[![License: MIT](https://img.shields.io/badge/License-MIT-gold.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-22+-green.svg)](https://nodejs.org)
[![Base](https://img.shields.io/badge/Chain-Base-blue.svg)](https://base.org)
[![ERC-8004](https://img.shields.io/badge/ERC--8004-Identity-purple.svg)](https://basescan.org/tx/0x539438d51803ed2d2a2c7ef0429493d4b86fa1d521717c69d2e9d6593a62efba)
[![ERC-8183](https://img.shields.io/badge/ERC--8183-Agentic%20Commerce-orange.svg)](https://basescan.org/address/0xCB98F0e2bb429E4a05203C57750A97Db280e6617)

---

## The Thesis

Most "AI agents" are chatbots with a wallet. This one runs a business.

**Synthesis Agent** is a self-sustaining autonomous agent that:
1. **Scans** multiple DEXs for cross-exchange arbitrage opportunities
2. **Routes** trade evaluations through a multi-provider LLM cascade (Bankr → OpenAI → Anthropic → OpenRouter → Ollama → hardcoded heuristic)
3. **Executes** trades within scoped spending limits
4. **Outsources** skills it needs to other agents via ERC-8183 on-chain job contracts (SynthesisJobs + Virtuals ACP v2)
5. **Cross-posts** jobs to the [Virtuals ACP v2](https://whitepaper.virtuals.io/acp-product-resources/introducing-acp-v2) network for cross-ecosystem agent discovery
6. **Communicates** with other agents via AgentMail — receives bids, sends results, publishes service listings
7. **Learns** from every trade — validates outsourced work against its own history, adopts better heuristics
8. **Reports** every action with on-chain receipts tied to its ERC-8004 identity

The closed loop: **Trade profits → fund LLM inference → smarter trades → more profit → afford better agent help → repeat.**

## Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│                       SYNTHESIS AGENT LOOP                            │
│                                                                      │
│  ┌─────────┐    ┌───────────────┐    ┌──────────────┐               │
│  │ Identity │───▶│    Scanner    │───▶│  Orchestrator│               │
│  │ ERC-8004 │    │ Uni V3 + API │    │  ERC-8183    │               │
│  └─────────┘    │ + Aerodrome   │    │  Job Escrow  │               │
│                 └───────┬───────┘    └──────┬───────┘               │
│                         │                    │                        │
│                         ▼                    ▼                        │
│                ┌────────────────┐    ┌──────────────┐               │
│                │   LLM Gateway  │    │   Feedback   │               │
│                │  6-provider    │    │    Loop      │               │
│                │  cascade       │    │  Adaptive    │               │
│                └────────┬───────┘    └──────┬───────┘               │
│                         │                    │                        │
│                         ▼                    ▼                        │
│  ┌───────────────────────────────────────────────────────┐          │
│  │              ON-CHAIN GUARDRAILS                       │          │
│  │  ┌──────────────────┐    ┌────────────────────────┐   │          │
│  │  │ SpendingPolicy   │    │     Executor           │   │          │
│  │  │ wouldApprove() → │───▶│ requestApproval() →    │   │          │
│  │  │ $2/tx, $20/day   │    │ Uniswap SwapRouter     │   │          │
│  │  │ Freeze / Targets │    │                        │   │          │
│  │  └──────────────────┘    └───────────┬────────────┘   │          │
│  └──────────────────────────────────────┼────────────────┘          │
│                                         │                            │
│                         ┌───────────────┼───────────────┐           │
│                         ▼               ▼               ▼           │
│         ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐       │
│         │Liquidity │ │AgentMail │ │  Cards   │ │ Reporter │       │
│         │ Manager  │ │ Job bids │ │ Prepaid  │ │ On-chain │       │
│         │Uni V3 LP │ │ Listings │ │USDC→Visa │ │ Receipts │       │
│         └──────────┘ └──────────┘ └──────────┘ └──────────┘       │
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │                    DEPENDENCY LAYER                           │    │
│  │  @darksol/terminal  •  Facilitator  •  Agent Signer          │    │
│  │  @darksol/bankr-router  •  x402 Client  •  Uniswap API      │    │
│  └─────────────────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────────────────┘
```

## Quick Start

```bash
git clone https://github.com/darks0l/synthesis-agent.git
cd synthesis-agent && npm install

# Dry run — scan + evaluate, no trades
npm run dev

# Live single cycle
node src/index.js --once

# Continuous live mode (scans every 60s)
npm start

# Run ERC-8183 lifecycle demo
node scripts/demo-erc8183.js
```

## Modules

| Module | File | Purpose |
|--------|------|---------|
| **Identity** | `src/identity.js` | ERC-8004 verification, receipt logging, balance tracking |
| **Scanner** | `src/scanner.js` | Cross-DEX price comparison (Uniswap V3 QuoterV2 + Aerodrome + Uniswap API) |
| **LLM Gateway** | `src/llm.js` | 6-provider cascade with automatic failover |
| **Orchestrator** | `src/orchestrator.js` | ERC-8183 job posting, bidding, fulfillment, price discovery |
| **Virtuals ACP** | `src/virtuals.js` | Optional Virtuals ACP v2 integration — cross-post jobs to Virtuals agent network |
| **Executor** | `src/executor.js` | Trade execution with on-chain AgentSpendingPolicy checks |
| **Spending Policy** | `contracts/AgentSpendingPolicy.sol` | On-chain guardrails — human sets limits, agent cannot raise them |
| **Liquidity** | `src/liquidity.js` | Uniswap V3 concentrated liquidity position management |
| **Mail** | `src/mail.js` | AgentMail integration — inter-agent communication for job bids/results |
| **Cards** | `src/cards.js` | Prepaid card ordering — convert USDC profits to real-world spending |
| **Feedback** | `src/feedback.js` | Validates outsourced work against trade history, adapts thresholds |
| **Reporter** | `src/reporter.js` | Formatted activity reports per cycle |
| **Config** | `src/config.js` | Centralized configuration, key loading |
| **Logger** | `src/logger.js` | Structured timestamped logging |

## Key Features

### 🆔 ERC-8004 On-Chain Identity

Every action is tied to a verified on-chain identity. The agent proves who it is before operating.

- **Identity TX**: [`0x5394...efba`](https://basescan.org/tx/0x539438d51803ed2d2a2c7ef0429493d4b86fa1d521717c69d2e9d6593a62efba)
- **Agent Address**: [`0x3e6e304421993D7E95a77982E11C93610DD4fFC5`](https://basescan.org/address/0x3e6e304421993D7E95a77982E11C93610DD4fFC5)

### 🤝 ERC-8183 Agentic Commerce

The agent outsources skills it needs to other agents via on-chain job contracts:

- **5 skill types**: TradeEval, MarketScan, RiskAssess, PriceQuote, Custom
- **Full state machine**: Open → Funded → Submitted → Completed/Rejected/Expired
- **On-chain price discovery**: Running averages per skill type — the market sets the price of agent labor
- **Provider reputation**: Success rate tracking, on-chain attestations
- **USDC escrow**: Zero-fee, payment released only on evaluator attestation

**Contract**: [`0xCB98F0e2bb429E4a05203C57750A97Db280e6617`](https://basescan.org/address/0xCB98F0e2bb429E4a05203C57750A97Db280e6617)

### 🌐 Virtuals ACP v2 Integration (Optional)

Cross-post ERC-8183 jobs to the [Virtuals Agent Commerce Protocol](https://whitepaper.virtuals.io/acp-product-resources/introducing-acp-v2) network:

- **Agent discovery**: Browse and find specialized agents on the Virtuals registry
- **Cross-network job posting**: Jobs posted to both SynthesisJobs (our contract) and Virtuals ACP simultaneously
- **Unified workflow**: ACP v2's unified jobs interface for service + fund-transfer jobs
- **Accounts**: Persistent on-chain relationship tracking between agents
- **Notification memos**: Real-time progress updates within jobs
- **Optional**: Only activates when `VIRTUALS_SESSION_KEY_ID` is configured — zero impact otherwise

**ACP v2 Contract**: [`0xa6C9BA866992cfD7fd6460ba912bfa405adA9df0`](https://basescan.org/address/0xa6C9BA866992cfD7fd6460ba912bfa405adA9df0)

### 🧠 Multi-Provider LLM Routing

6-provider cascade with automatic failover — the agent always has AI, never crashes on a provider outage:

1. **Bankr Gateway** (primary — closes the economic loop)
2. **OpenAI** (GPT-4o)
3. **Anthropic** (Claude Sonnet)
4. **OpenRouter** (any model)
5. **Ollama** (local, free)
6. **Hardcoded heuristic** (last resort — spread ≥ 40bps → 65% confidence)

### 🔍 Cross-DEX Arbitrage Scanner

Real-time price comparison from three sources:
- **Uniswap V3 QuoterV2** — On-chain exact output quotes (fee tiers 500/3000/10000)
- **Uniswap Developer Platform API** — Optimal routing across all Uniswap pools (v2 + v3)
- **Aerodrome** — Stable and volatile pool quotes
- Configurable pairs: WETH/USDC, USDC/WETH, WETH/DAI
- Minimum spread threshold: 40bps (adaptive via feedback loop)
- Uses best quote across all sources for execution

### 🔄 Feedback Loop

The agent doesn't blindly trust outsourced evaluations:
- Validates provider recommendations against its own trade history
- If an outsourced evaluation would have been better → adopts the heuristic
- If worse → rejects with on-chain reputation hit
- Adaptive thresholds evolve with data

### 💱 On-Chain Spending Policy

Smart contract guardrails — the human sets limits, the agent can't override them:

- **AgentSpendingPolicy**: [`0xA928fC2132EB4b7E4E96Bb5C2aA011a202290477`](https://basescan.org/address/0xA928fC2132EB4b7E4E96Bb5C2aA011a202290477)
- **Per-transaction cap**: $2 USDC max per swap (on-chain enforced)
- **Daily spending limit**: $20 USDC/day (on-chain 24h rolling window)
- **Approved targets**: Only whitelisted DEX routers (Uniswap + Aerodrome)
- **Emergency freeze**: Owner can zero all limits instantly
- **Pre-flight check**: `wouldApprove()` view call before every trade
- **On-chain record**: `requestApproval()` records every approved spend with events
- **Confidence threshold**: Only executes when AI confidence ≥ 60%

### 📬 AgentMail (Inter-Agent Communication)

Off-chain coordination layer for the on-chain job market:

- **Receive job bids** — other agents discover your ERC-8183 jobs and bid via mail
- **Send job results** — deliver work to clients with structured responses
- **Service listing** — publish capabilities ("TradeEval for $0.05") for agent discovery
- **Auto-respond** — service queries answered automatically with your listing
- **Structured protocol** — JSON message types: `job_bid`, `job_result`, `service_query`

The combination: **on-chain escrow (ERC-8183)** + **off-chain coordination (AgentMail)** + **payment (USDC)**. Full agent economy stack.

### 💧 Autonomous Liquidity Management

Uniswap V3 concentrated liquidity positions:
- Monitors existing positions for range status
- AI-evaluated LP decisions via LLM cascade
- Configurable tick range and fee tier selection
- Scoped under same spending policy

### 💳 Prepaid Cards (Trade → Spend)

Convert USDC profits to real-world purchasing power:
- DARKSOL Cards API integration — Visa/Mastercard, no KYC
- Auto-evaluation: only orders when USDC balance exceeds reserve threshold
- Closes the full loop: trade → earn USDC → buy prepaid card → spend in real world

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `BASE_RPC` | `https://mainnet.base.org` | Base RPC endpoint |
| `MAX_PER_TX` | `2.0` | Max USD per transaction |
| `MAX_DAILY` | `20.0` | Max USD per day |
| `SCAN_INTERVAL` | `60000` | Scan interval (ms) |
| `BANKR_API_KEY` | from `.keys/` | Bankr LLM Gateway key |
| `UNISWAP_API_KEY` | from `.keys/` | Uniswap API key |
| `AGENTMAIL_API_KEY` | from `.keys/` | AgentMail API key |
| `AGENTMAIL_INBOX` | auto-created | AgentMail inbox address |
| `SYNTHESIS_JOBS_ADDRESS` | `0xCB98...6617` | ERC-8183 contract |
| `SPENDING_POLICY` | `0xA928...0477` | On-chain spending policy contract |
| `VIRTUALS_SESSION_KEY_ID` | — | Virtuals ACP session key (optional) |
| `VIRTUALS_AGENT_WALLET` | agent wallet | Virtuals agent wallet override |

## On-Chain Artifacts

| Artifact | Link |
|----------|------|
| ERC-8004 Identity | [BaseScan](https://basescan.org/tx/0x539438d51803ed2d2a2c7ef0429493d4b86fa1d521717c69d2e9d6593a62efba) |
| SynthesisJobs (ERC-8183) | [BaseScan](https://basescan.org/address/0xCB98F0e2bb429E4a05203C57750A97Db280e6617) |
| AgentSpendingPolicy | [BaseScan](https://basescan.org/address/0xA928fC2132EB4b7E4E96Bb5C2aA011a202290477) |
| First Trade (ETH→USDC) | [BaseScan](https://basescan.org/tx/0x10dfa8612b8eb23258ec9f8b832067142a2353b29c2b763cf78ccf82167ff259) |
| ERC-8183 Job #1 Complete | [BaseScan](https://basescan.org/tx/0x96d71378773a2d7fb8061bad6c7d768c5526152ce0d08feb26d67b8a984bc1c1) |
| SpendingPolicy Deploy | [BaseScan](https://basescan.org/tx/0xaa0626bd3ac174eb009fdaa6d42ac4757d5ebf64638a096a4ab85be1177b3c0d) |
| USDC→ETH Refuel | [BaseScan](https://basescan.org/tx/0xbe7f5b9866144927d76febcc723be328cc14c7257348ffee3bf3522766e677f0) |

## Dependencies (Pre-existing DARKSOL Infrastructure)

| Package | npm | Purpose |
|---------|-----|---------|
| `@darksol/terminal` | [v0.13.1](https://www.npmjs.com/package/@darksol/terminal) | Unified CLI — swap, arb engine, AI intent, agent signer |
| `@darksol/bankr-router` | [v1.2.0](https://www.npmjs.com/package/@darksol/bankr-router) | Smart LLM routing with context compression |
| DARKSOL Facilitator | [facilitator.darksol.net](https://facilitator.darksol.net) | Free x402 on-chain payment facilitator (Base + Polygon) |

## Prize Tracks

| Track | Prize | Relevance |
|-------|-------|-----------|
| Let the Agent Cook | $4k / $2.5k / $1.5k | Autonomous trading + LLM evaluation + self-sustaining economics |
| ERC-8004 Agents With Receipts | $4k / $3k / $1k | Verified identity + on-chain receipt trail |
| ERC-8183 Open Build (Virtuals) | $2k | Core integration — SynthesisJobs contract, 5 skill types, price discovery, provider reputation |
| Bankr LLM Gateway | $3k / $1.5k / $500 | Primary LLM provider, economic loop |
| Uniswap Agentic Finance | $2.5k / $1.5k / $1k | Cross-DEX scanner, Uniswap V3 LP management, Trading API |
| AgentCash x402 | $1k / $500 / $250 | x402 facilitator integration |
| bond.credit | $1k / $500 | On-chain identity + reputation |
| Open Track | $14.5k pool | Full stack showcase |
| Status Network Gasless | $50 guaranteed | Sepolia deployment |

## Human-Agent Collaboration

Built through continuous collaboration between **Meta** (human) and **Darksol** (AI agent on [OpenClaw](https://openclaw.dev)). Every decision, code change, and deployment documented in the conversation log. The agent doesn't just write code — it deploys contracts, executes trades, manages wallets, and makes strategic decisions in real time.

## License

MIT — Built with teeth. 🌑
