---
name: synthesis-feedback-loop
description: "Self-improving feedback loop for autonomous agents. Records trades, evaluates outsourced results against history, adapts thresholds, scores providers. Persists learnings to disk. Use when: (1) building agents that learn from their own trades, (2) validating outsourced AI recommendations, (3) adaptive confidence thresholds, (4) provider reputation tracking."
---

# Synthesis Feedback Loop — Self-Improving Agent Intelligence

**Your agent learns from every trade. Adapts thresholds. Validates outsourced advice. 🌑**

From: `synthesis-agent` | Module: `src/feedback.js`

---

## What It Does

The FeedbackLoop module creates a closed learning cycle:

1. **Record every trade** — pair, spread, decision, outcome, source
2. **Evaluate outsourced results** — compare provider recommendations against your own history
3. **Adapt thresholds** — auto-adjust minSpreadBps based on win rate (↑ if losing, ↓ if winning)
4. **Score providers** — track which agents give good advice vs bad advice
5. **Persist learnings** — `data/trade-history.json` + `data/learnings.json`

### Quick Start

```js
import { FeedbackLoop } from 'synthesis-agent/src/feedback.js';

const feedback = new FeedbackLoop();

// Record a trade
feedback.recordTrade({
  pair: 'WETH/USDC',
  spreadBps: 45,
  decision: 'execute',
  confidence: 72,
  txHash: '0x...',
  source: 'orchestrated',
  erc8183JobId: 2,
});

// Evaluate an outsourced result
const evaluation = feedback.evaluateOutsourcedResult(
  { execute: true, confidence: 80, reasoning: "Strong liquidity..." },
  { pair: 'WETH/USDC', spreadBps: 45, profitPercent: '0.45' }
);
// → { quality: 'good', insight: 'Novel insight adopted', accepted: true }

// Record outcome (after trade settles)
feedback.recordOutcome('0x...txHash', { profitable: true, profit: 0.5 });
// This auto-adjusts thresholds

// Get adaptive threshold
const minSpread = feedback.learnings.minSpreadBps; // starts at 40, adapts
```

### Adaptive Threshold Logic

| Win Rate | Action |
|----------|--------|
| < 30% | Increase minSpreadBps by 5 (more conservative) |
| > 80% | Decrease minSpreadBps by 5 (more aggressive) |
| 30-80% | No change |

### Provider Scoring

```js
const score = feedback.scoreProvider('0xProviderAddress');
// → { score: 0.85, trades: 12, wins: 10, insights: 3 }
```

### Persistence

- `data/trade-history.json` — last 500 trades (circular buffer)
- `data/learnings.json` — pair insights, adaptive thresholds, provider scores

---

Built with teeth. 🌑
