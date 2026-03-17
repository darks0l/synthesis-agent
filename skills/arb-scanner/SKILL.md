---
name: synthesis-arb-scanner
description: "Cross-DEX arbitrage scanner for Base. Compares Uniswap V3 QuoterV2 + Aerodrome + Uniswap Trading API in parallel. Finds spreads, ranks opportunities by bps. Use when: (1) finding arb opportunities across DEXs, (2) comparing quotes across Uniswap V3 fee tiers, (3) getting Aerodrome stable/volatile pool quotes, (4) pre-screening trades before execution."
---

# Synthesis Arb Scanner — Cross-DEX Price Discovery

**3-source parallel quote comparison on Base. Zero latency overhead. 🌑**

From: `synthesis-agent` | Source: `src/scanner.js`

---

## How It Works

The scanner queries three price sources **in parallel** for each token pair:

1. **Uniswap V3 QuoterV2** (on-chain) — tries fee tiers 500 (0.05%), 3000 (0.3%), 10000 (1%)
2. **Aerodrome** (on-chain) — tries stable + volatile pools via Factory → Pool.getAmountOut
3. **Uniswap Trading API** (off-chain) — optimal routing across all pools via `trade-api.gateway.uniswap.org`

### Quick Start

```js
import { Scanner } from 'synthesis-agent/src/scanner.js';
import { ethers } from 'ethers';

const provider = new ethers.JsonRpcProvider('https://mainnet.base.org');
const scanner = new Scanner(provider);

// Scan all configured pairs
const opportunities = await scanner.scan();
// → [{ pair: 'WETH/USDC', spreadBps: 45, betterDex: 'uniswap', uniswapOut: '2100.5', aerodromeOut: '2091.1', ... }]

// Get the best opportunity above threshold
const best = scanner.getBestOpportunity();
// → { pair: 'WETH/USDC', spreadBps: 45, ... } or null
```

### Configuration

```js
// In config.js
scan: {
  intervalMs: 60000,      // scan every 60s
  minProfitBps: 30,       // min 0.3% spread to consider
  pairs: [
    { tokenIn: 'WETH', tokenOut: 'USDC' },
    { tokenIn: 'USDC', tokenOut: 'WETH' },
    { tokenIn: 'WETH', tokenOut: 'DAI' },
  ],
},
uniswap: {
  apiKey: '...',                                           // Uniswap Developer Platform key (optional)
  routerV3: '0x2626664c2603336E57B271c5C0b26F421741e481', // SwapRouter02 on Base
  quoterV2: '0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a', // QuoterV2 on Base
},
```

### Opportunity Object

```json
{
  "pair": "WETH/USDC",
  "tokenIn": "WETH",
  "tokenOut": "USDC",
  "amountIn": "0.0005",
  "uniswapOut": "1.051234",
  "aerodromeOut": "1.046789",
  "betterDex": "uniswap",
  "spreadBps": 45,
  "profitBps": 45,
  "profitPercent": "0.45",
  "gasCost": "0.00001",
  "netProfit": "positive",
  "timestamp": "2026-03-17T12:00:00.000Z"
}
```

### Supported DEXs

| DEX | Type | Method |
|-----|------|--------|
| Uniswap V3 | On-chain | QuoterV2.quoteExactInputSingle (3 fee tiers) |
| Aerodrome | On-chain | Factory.getPool → Pool.getAmountOut (stable + volatile) |
| Uniswap API | Off-chain | POST trade-api.gateway.uniswap.org/v1/quote |

### Contract Addresses (Base)

| Contract | Address |
|----------|---------|
| QuoterV2 | `0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a` |
| SwapRouter02 | `0x2626664c2603336E57B271c5C0b26F421741e481` |
| Aerodrome Factory | `0x420DD381b31aEf6683db6B902084cB0FFECe40Da` |
| Aerodrome Router | `0xcF77a3Ba9A5CA399B7c97c74d54e5b1Beb874E43` |
| WETH | `0x4200000000000000000000000000000000000006` |
| USDC | `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` |

---

Built with teeth. 🌑
