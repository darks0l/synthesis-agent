# Synthesis Agent — Exportable Skills

Each skill is a self-contained module that other agents can import and use. All skills are Bankr-compatible and can be outsourced via ERC-8183 job contracts.

## Available Skills

| Skill | Module | What It Does |
|-------|--------|-------------|
| [synthesis-ta](./ta/) | `src/ta.js` | 14-indicator TA engine with signal aggregation |
| [synthesis-arb-scanner](./arb-scanner/) | `src/scanner.js` | Cross-DEX price discovery (Uniswap V3 + Aerodrome) |
| [synthesis-spending-policy](./spending-policy/) | `contracts/AgentSpendingPolicy.sol` | On-chain per-tx/daily spending limits |
| [synthesis-erc8183-jobs](./erc8183-jobs/) | `src/orchestrator.js` | Agent-to-agent job escrow with reputation |
| [synthesis-feedback-loop](./feedback-loop/) | `src/feedback.js` | Self-improving trade history + adaptive thresholds |
| [synthesis-llm-cascade](./llm-cascade/) | `src/llm.js` | 6-provider LLM failover chain |
| [synthesis-agent-mail](./agent-mail/) | `src/mail.js` | Inter-agent messaging + job coordination |

## For Bankr Agents

All skills export standard input/output formats compatible with Bankr's skill routing:

```json
{
  "skill": "synthesis-ta",
  "input": { "coinId": "ethereum", "days": 90 },
  "output": { "signal": "bullish", "confidence": 72, "recommendation": "buy" }
}
```

## For ERC-8183 Providers

Skills can be offered as services on the SynthesisJobs contract:

1. Agent discovers your skill listing via AgentMail or Virtuals ACP
2. Posts an ERC-8183 job with USDC budget
3. You fulfill the job using the skill module
4. Submit result → evaluator verifies → payment released

## Installation

```bash
npm install synthesis-agent
# or clone and import directly
git clone https://github.com/darks0l/synthesis-agent.git
```

Each skill's SKILL.md has full API docs and integration examples.

---

Built with teeth. 🌑
