---
name: synthesis-llm-cascade
description: "Multi-provider LLM routing with automatic failover. Priority chain: Bankr → OpenAI → Anthropic → OpenRouter → Ollama → heuristic fallback. Supports OpenAI-compatible, Anthropic Messages API, and Ollama formats. Use when: (1) building resilient AI agents that need LLM access, (2) cascading across paid/free providers, (3) trade evaluation with fallback intelligence, (4) closing the economic loop (trade profits → LLM costs)."
---

# Synthesis LLM Cascade — Multi-Provider Failover

**6 providers. Automatic failover. Always has intelligence. 🌑**

From: `synthesis-agent` | Module: `src/llm.js`

---

## Provider Chain

| Priority | Provider | Format | Cost |
|----------|----------|--------|------|
| 1 | Bankr LLM Gateway | OpenAI-compatible | Bankr credits (closes economic loop) |
| 2 | OpenAI | OpenAI API | Pay-per-token |
| 3 | Anthropic | Messages API | Pay-per-token |
| 4 | OpenRouter | OpenAI-compatible | Pay-per-token |
| 5 | Ollama (local) | Ollama API | Free |
| 6 | Heuristic | Rule-based | Free |

Each provider is tried in order. If one fails (no key, 402, 403, timeout), the next is tried. Heuristic fallback always works — ensures the agent never goes blind.

### Quick Start

```js
import { LLMGateway } from 'synthesis-agent/src/llm.js';

const llm = new LLMGateway();

// Evaluate a trading opportunity
const decision = await llm.evaluateOpportunity({
  pair: 'WETH/USDC',
  spreadBps: 45,
  betterDex: 'uniswap',
  uniswapOut: '2100.5',
  aerodromeOut: '2091.1',
  taContext: 'TA Signal: BULLISH (72% confidence)...', // Optional TA injection
});
// → { execute: true, confidence: 72, reasoning: "Strong spread with..." }
```

### Configuration

```env
BANKR_API_KEY=bk_...          # Primary (closes economic loop)
OPENAI_API_KEY=sk-...          # Fallback 1
ANTHROPIC_API_KEY=sk-ant-...   # Fallback 2
OPENROUTER_API_KEY=sk-or-...   # Fallback 3
OLLAMA_URL=http://localhost:11434  # Fallback 4 (free)
```

### Heuristic Fallback

When all providers fail, the rule-based heuristic kicks in:
- Spread ≥ 40bps → execute with 65% confidence
- Spread < 40bps → skip

This ensures the agent always has a decision, even with zero API keys configured.

### Economic Loop (Bankr)

The Bankr provider is primary because it closes a self-sustaining loop:
1. Agent trades → earns USDC
2. USDC funds Bankr wallet
3. Bankr wallet pays for LLM inference
4. Better inference → smarter trades → more USDC

---

Built with teeth. 🌑
