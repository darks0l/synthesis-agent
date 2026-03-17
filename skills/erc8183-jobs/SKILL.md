---
name: synthesis-erc8183-jobs
description: "ERC-8183 agentic commerce — on-chain job escrow for outsourcing skills between agents. Post jobs, receive bids, evaluate results, build reputation. SynthesisJobs contract with 5 skill types, price discovery, and provider scoring. Use when: (1) outsourcing trade evaluation to other agents, (2) posting market scan requests, (3) building agent-to-agent service markets, (4) on-chain price discovery for agent labor."
---

# Synthesis ERC-8183 Jobs — Agentic Commerce Protocol

**Outsource skills to other agents. Pay on-chain. Build reputation. 🌑**

From: `synthesis-agent` | Contract: `SynthesisJobs.sol` | Module: `src/orchestrator.js`

---

## What It Does

The SynthesisJobs contract implements ERC-8183 — an on-chain job escrow system where agents can:

1. **Post jobs** — "I need a trade evaluated" with USDC budget
2. **Accept jobs** — providers claim and work on posted jobs
3. **Submit results** — provider delivers evaluation
4. **Complete/reject** — evaluator scores the work
5. **Build reputation** — on-chain success rates and running price averages

### Deployed Instances

| Chain | Address | Explorer |
|-------|---------|----------|
| Base | `0xCB98F0e2bb429E4a05203C57750A97Db280e6617` | [BaseScan](https://basescan.org/address/0xCB98F0e2bb429E4a05203C57750A97Db280e6617) |
| Status Sepolia | `0x95C7CA9eA98C97FFB82764e63e0d19FcCFD42956` | [Status Explorer](https://sepoliascan.status.network/address/0x95C7CA9eA98C97FFB82764e63e0d19FcCFD42956) |

### Skill Types

| ID | Name | Description |
|----|------|-------------|
| 0 | TradeEval | Evaluate a trading opportunity (execute/skip + confidence) |
| 1 | MarketScan | Scan for market opportunities on specified pairs |
| 2 | RiskAssess | Assess risk of a position or strategy |
| 3 | PriceQuote | Get price quotes across venues |
| 4 | Custom | Arbitrary skill request |

### Job Lifecycle

```
Open → Funded → Submitted → Completed (or Rejected / Expired)
```

1. **createJob(skillType, description, evaluator, deadline)** — post a new job
2. **setProvider(jobId, provider)** — assign a provider (client only)
3. **fund(jobId, amount)** — escrow USDC into the contract
4. **submit(jobId, result)** — provider submits their work
5. **complete(jobId)** — evaluator approves → USDC released to provider
6. **reject(jobId, reason)** — evaluator rejects → USDC refunded to client

### Integration (Orchestrator Module)

```js
import { Orchestrator, SkillType } from 'synthesis-agent/src/orchestrator.js';

const orchestrator = new Orchestrator(provider, contractAddress);

// Post a trade evaluation job
const job = await orchestrator.postTradeEvalJob(opportunity, wallet);
// → { jobId: 2, txHash: '0x...' }

// Self-fulfill for demo (or wait for external providers)
const result = await orchestrator.selfFulfill(job.jobId, llmDecision, wallet);

// Check pending jobs
const updates = await orchestrator.checkJobs(wallet);

// On-chain price discovery
const budget = await orchestrator._getBudget(SkillType.TradeEval);
// → Uses averageCost() from contract, falls back to $0.05
```

### Price Discovery

The contract tracks **running averages** of job costs per skill type. When posting a new job, the agent queries `averageCost(skillType)` to set a fair market price — no central pricing authority needed.

### Provider Reputation

On-chain scoring per provider address:
- `successRate(provider)` — completed / (completed + rejected)
- `totalJobs(provider)` — total jobs fulfilled
- Agents can use reputation scores to select providers

### Bankr Skill Compatibility

ERC-8183 jobs can be routed through Bankr's LLM Gateway:

```json
{
  "skill": "TradeEval",
  "input": { "pair": "WETH/USDC", "spreadBps": 45, "betterDex": "uniswap" },
  "output": { "execute": true, "confidence": 72, "reasoning": "Good spread with adequate liquidity" },
  "payment": { "token": "USDC", "amount": "0.05", "escrow": "0xCB98..." }
}
```

---

Built with teeth. 🌑
