---
name: synthesis-ta
description: "Technical Analysis engine for autonomous crypto trading agents. 14 indicators (RSI, MACD, Bollinger, ATR, Stochastic, OBV, VWAP, EMA/SMA, Fibonacci, S/R, Divergence), weighted signal aggregation, CoinGecko data fetching, and LLM-ready formatting. Zero dependencies beyond ethers. Use when: (1) evaluating trade opportunities, (2) pre-screening arb signals, (3) LP rebalance decisions, (4) market regime detection, (5) providing TA context to LLMs."
---

# Synthesis TA — Technical Analysis Skill

**Pure-JS technical analysis for autonomous agents. No external TA libraries. 🌑**

From: `synthesis-agent` | npm: `@darksol/synthesis-agent`

---

## For AI Agents — How To Use This

You're an autonomous trading agent. This skill gives you 14 technical indicators and a weighted signal aggregator.

### Quick Start

```js
import { TAEngine, analyze, rsi, macd, bollingerBands } from 'synthesis-agent/src/ta.js';

// Full analysis from CoinGecko data
const ta = new TAEngine();
const result = await ta.analyze('ethereum', 90); // 90-day lookback
// → { signal: 'bullish', confidence: 72, recommendation: 'buy', indicators: {...} }

// Quick signal (cached 5min)
const quick = await ta.quickSignal('ethereum');
// → { signal: 'bullish', confidence: 72, recommendation: 'buy' }

// Format for LLM context injection
const text = ta.formatForLLM(result);
// → "TA Signal: BULLISH (72% confidence)\nRSI: 42.3 (neutral)\nMACD: bullish_cross\n..."
```

### Individual Indicators

```js
import { rsi, macd, bollingerBands, atr, stochastic, obv, vwap, fibonacci, supportResistance, detectDivergence } from 'synthesis-agent/src/ta.js';

// All take arrays of numbers or candle objects
const closes = [2100, 2080, 2050, 2090, 2120, ...]; // 50+ values recommended

rsi(closes);                    // → { value: 42.3, signal: 'neutral' }
macd(closes);                   // → { macd: 0.00012, signal: 0.00008, histogram: 0.00004, trend: 'bullish_cross' }
bollingerBands(closes);         // → { upper, middle, lower, width, squeeze: false, signal: 'bullish' }
stochastic(candles);            // → { k: 35.2, d: 40.1, signal: 'neutral' }
atr(candles);                   // → { value: 45.3, pct: 2.1, volatility: 'medium' }
obv(closes, volumes);           // → { value: 1234567, trend: 'bullish' }
vwap(candles);                  // → { value: 2085.4, signal: 'bearish' }
fibonacci(high, low);           // → { levels: { 0: 2200, 0.236: ..., 0.382: ..., 0.618: ..., 1: 1800 } }
supportResistance(candles);     // → { support: [2050, 1980], resistance: [2200, 2350], pivots: [...] }
detectDivergence(closes);       // → { divergence: 'bullish', type: 'price_lower_rsi_higher' }
```

### Signal Aggregation

The `analyze()` function scores all indicators with configurable weights:

| Indicator | Weight | Signal Types |
|-----------|--------|-------------|
| RSI | 1.0-1.5 | overbought, bullish, neutral, bearish, oversold |
| MACD | 1.0-2.0 | bullish_cross, bearish_cross, bullish, bearish |
| Bollinger | 0.5-1.5 | overbought, oversold, squeeze |
| Stochastic | 0.5-1.0 | bullish_cross, bearish_cross, overbought, oversold |
| OBV | 0.5-1.0 | bullish, bearish |
| VWAP | 0.5-1.0 | bullish, bearish |
| EMA Cross (20/50) | 1.5 | bullish, bearish |
| Divergence | 2.5 | bullish, bearish (strongest signal) |

**Output:**
```json
{
  "signal": "bullish",
  "confidence": 72,
  "weightedScore": 0.45,
  "recommendation": "buy",
  "price": 2085.4,
  "indicators": { "rsi": {...}, "macd": {...}, ... },
  "scores": [{ "name": "rsi", "score": 0.5, "weight": 1 }, ...]
}
```

**Recommendation mapping:**
- `strong_buy` — bullish + confidence ≥65%
- `buy` — bullish + confidence ≥40%
- `hold` — neutral or low confidence
- `sell` — bearish + confidence ≥40%
- `strong_sell` — bearish + confidence ≥65%

### Data Sources

- **CoinGecko OHLC** (free, no API key): 90-day candles for any listed coin
- **CoinGecko Market Chart** (free): Price + volume timeseries with synthetic OHLC
- **Custom candles**: Pass any `{open, high, low, close, volume}[]` array

### Wiring Into Your Agent

```js
// In your agent loop, before trade execution:
const ta = new TAEngine();
const taResult = await ta.analyze('ethereum');

// Inject into LLM evaluation prompt
const context = ta.formatForLLM(taResult);
const llmDecision = await llm.evaluate({
  ...opportunity,
  taContext: context,
});

// Or use signal directly
if (taResult.recommendation === 'strong_sell') {
  console.log('TA says strong sell — skipping buy opportunity');
}
```

### Bankr Skill Compatibility

This skill is designed to work as a Bankr-routable evaluation provider:

```json
{
  "skill": "synthesis-ta",
  "input": { "coinId": "ethereum", "days": 90 },
  "output": { "signal": "bullish", "confidence": 72, "recommendation": "buy" }
}
```

When used via ERC-8183 job posting, the TA engine can be outsourced to other agents:
- SkillType: `TradeEval` (0) or `MarketScan` (1)
- Budget: On-chain price discovery via SynthesisJobs contract
- Result format: JSON with signal, confidence, recommendation

### Indicators Reference

| Indicator | What It Measures | Best For |
|-----------|-----------------|----------|
| RSI | Momentum (0-100) | Overbought/oversold |
| MACD | Trend + momentum | Crossover signals |
| Bollinger Bands | Volatility envelope | Breakout detection |
| ATR | Volatility magnitude | Position sizing |
| Stochastic | Close vs range | Reversal timing |
| OBV | Volume-price relationship | Trend confirmation |
| VWAP | Volume-weighted price | Fair value |
| EMA 20/50 | Trend direction | Trend following |
| SMA 200 | Long-term trend | Bull/bear market |
| Fibonacci | Retracement levels | Support/resistance |
| S/R Detection | Swing pivot clustering | Key price levels |
| Divergence | Price vs RSI divergence | Trend reversal warning |

---

Built with teeth. 🌑
