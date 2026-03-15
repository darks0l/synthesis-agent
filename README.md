<p align="center">
  <img src="assets/darksol-banner.png" alt="DARKSOL" width="600" />
</p>
<h3 align="center">Built by DARKSOL 🌑</h3>

# Synthesis Agent

> Autonomous agent economy orchestrator — built for [The Synthesis Hackathon](https://synthesis.devfolio.co) (March 13-22, 2026)

[![License: MIT](https://img.shields.io/badge/License-MIT-gold.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-22+-green.svg)](https://nodejs.org)
[![Base](https://img.shields.io/badge/Chain-Base-blue.svg)](https://base.org)

---

## What Is This?

An AI agent that **autonomously trades, pays, routes LLM inference, and operates on-chain** — with full auditability, ERC-8004 identity, scoped spending permissions, and self-sustaining economics.

It doesn't just talk. It thinks, evaluates, executes, and reports. Every action is traceable on-chain.

## The Autonomous Loop

```
┌─────────────────────────────────────────────────┐
│                 SYNTHESIS AGENT                  │
│                                                  │
│  1. Wake up with ERC-8004 identity              │
│  2. Check wallet balances                        │
│  3. Scan DEXs for opportunities                  │
│     ├── Uniswap V3 (quotes)                     │
│     └── Aerodrome (quotes)                       │
│  4. Route evaluation through Bankr LLM Gateway   │
│  5. AI decides: execute or skip?                 │
│  6. Execute via scoped spending limits           │
│  7. Log receipt (on-chain traceable)             │
│  8. Report results                               │
│  9. Wait → repeat                                │
└─────────────────────────────────────────────────┘
```

## Quick Start

```bash
# Clone
git clone https://github.com/darks0l/synthesis-agent.git
cd synthesis-agent

# Install
npm install

# Dry run (scan + evaluate, no trades)
npm run dev

# Live mode (single cycle)
node src/index.js --once

# Continuous mode
npm start
```

## Architecture

```
synthesis-agent/
├── src/
│   ├── index.js      → Main orchestrator loop
│   ├── config.js     → Configuration + key loading
│   ├── identity.js   → ERC-8004 verification + receipt logging
│   ├── llm.js        → Bankr LLM Gateway integration
│   ├── scanner.js    → Cross-DEX price scanner (Uniswap V3 + Aerodrome)
│   ├── executor.js   → Trade execution with spending limits
│   ├── reporter.js   → Formatted activity reports
│   └── logger.js     → Structured logging
├── logs/             → Daily agent log files
└── package.json
```

## Key Features

### 🆔 ERC-8004 On-Chain Identity
The agent has a verified on-chain identity via [ERC-8004](https://eips.ethereum.org/EIPS/eip-8004). Every action is tied to this identity, creating an auditable trail.

- Identity TX: [`0x5394...efba`](https://basescan.org/tx/0x539438d51803ed2d2a2c7ef0429493d4b86fa1d521717c69d2e9d6593a62efba)
- Agent Address: `0x3e6e304421993D7E95a77982E11C93610DD4fFC5`

### 🧠 LLM-Powered Decision Making
Routes inference through the [Bankr LLM Gateway](https://ai.bankr.bot) for cost-optimized AI evaluation. The agent doesn't blindly trade — it asks an LLM to evaluate each opportunity with confidence scoring.

### 🔍 Cross-DEX Arbitrage Scanner
Real-time price comparison across:
- **Uniswap V3** — QuoterV2 for exact output quotes
- **Aerodrome** — Base's native DEX

Scans configurable pairs (WETH/USDC, WETH/DAI) and identifies spreads above threshold.

### 💱 Scoped Spending Limits
Built-in guardrails:
- **Per-transaction cap** — max $2 per swap (configurable)
- **Daily spending limit** — max $20/day (configurable)
- **Cooldown period** — minimum 30s between trades
- **Confidence threshold** — only executes when AI confidence ≥ 60%

### 📋 Receipt Logging
Every action (scan, evaluation, trade, skip) is logged as a structured receipt with:
- Timestamp, agent address, ERC-8004 reference
- Decision details (AI reasoning, confidence score)
- Transaction hash (when executed)

## Configuration

Environment variables override defaults:

| Variable | Default | Description |
|----------|---------|-------------|
| `BASE_RPC` | `https://mainnet.base.org` | Base RPC endpoint |
| `MAX_PER_TX` | `2.0` | Max USD per transaction |
| `MAX_DAILY` | `20.0` | Max USD per day |
| `SCAN_INTERVAL` | `60000` | Scan interval (ms) |
| `BANKR_API_KEY` | from `.keys/` | Bankr LLM Gateway key |
| `UNISWAP_API_KEY` | from `.keys/` | Uniswap API key |
| `AGENT_SIGNER_URL` | `http://127.0.0.1:18790` | Agent Signer proxy URL |

## Dependencies (Pre-existing Infrastructure)

This agent orchestrates components from the DARKSOL ecosystem:

- **[@darksol/terminal](https://www.npmjs.com/package/@darksol/terminal)** — CLI with swap, arb, and AI intent engine
- **[DARKSOL Facilitator](https://facilitator.darksol.net)** — Free x402 on-chain payment facilitator (Base + Polygon)
- **Agent Signer** — Local HTTP signing proxy with spending limits and audit log

## Human-Agent Collaboration

This project was built through continuous human-agent collaboration between **Meta** (human) and **Darksol** (AI agent running on OpenClaw). The conversation log documenting the entire build process is available in the submission.

## On-Chain Artifacts

- **ERC-8004 Identity**: [BaseScan TX](https://basescan.org/tx/0x539438d51803ed2d2a2c7ef0429493d4b86fa1d521717c69d2e9d6593a62efba)
- **Agent Address**: [`0x3e6e304421993D7E95a77982E11C93610DD4fFC5`](https://basescan.org/address/0x3e6e304421993D7E95a77982E11C93610DD4fFC5)
- **Trade History**: See `logs/` directory for full receipt trail

## License

MIT — Built with teeth. 🌑
