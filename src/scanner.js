// ── Scanner ─────────────────────────────────────────────────────────
// Scans for trading opportunities across DEXs on Base.
// Uses Uniswap V3 Quoter + Uniswap Developer Platform API for price discovery.

import { ethers } from 'ethers';
import { config } from './config.js';
import { log, logError, logWarn } from './logger.js';

const QUOTER_ABI = [
  'function quoteExactInputSingle((address tokenIn, address tokenOut, uint256 amountIn, uint24 fee, uint160 sqrtPriceLimitX96)) external returns (uint256 amountOut, uint160 sqrtPriceX96After, uint32 initializedTicksCrossed, uint256 gasEstimate)',
];

const AERODROME_ROUTER = '0xcF77a3Ba9A5CA399B7c97c74d54e5b1Beb874E43';
const AERODROME_FACTORY = '0x420DD381b31aEf6683db6B902084cB0FFECe40Da';
const AERODROME_FACTORY_ABI = [
  'function getPool(address tokenA, address tokenB, bool stable) external view returns (address)',
];
const AERODROME_POOL_ABI = [
  'function getAmountOut(uint256 amountIn, address tokenIn) external view returns (uint256)',
];

export class Scanner {
  constructor(provider) {
    this.provider = provider;
    this.quoter = new ethers.Contract(config.uniswap.quoterV2, QUOTER_ABI, provider);
    this.aeroFactory = new ethers.Contract(AERODROME_FACTORY, AERODROME_FACTORY_ABI, provider);
    this.opportunities = [];
    this.uniswapApiEnabled = !!config.uniswap.apiKey;
    if (this.uniswapApiEnabled) {
      log('scanner', '🔑 Uniswap Developer Platform API enabled');
    }
  }

  /**
   * Get quote from Uniswap Developer Platform API (routing API).
   * Provides optimal routing across all Uniswap pools — better than single-pool quoter.
   */
  async getUniswapApiQuote(tokenInSymbol, tokenOutSymbol, amountIn, decimalsIn = 18) {
    if (!this.uniswapApiEnabled) return null;

    try {
      const tokenIn = config.tokens[tokenInSymbol];
      const tokenOut = config.tokens[tokenOutSymbol];
      const amountInWei = ethers.parseUnits(amountIn, decimalsIn).toString();

      const resp = await fetch('https://trade-api.gateway.uniswap.org/v1/quote', {
        method: 'POST',
        headers: {
          'x-api-key': config.uniswap.apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          type: 'EXACT_INPUT',
          tokenIn,
          tokenOut,
          amount: amountInWei,
          chainId: config.chain.chainId,
          swapper: config.agentAddress,
          protocols: ['V3', 'V2'],
        }),
      });

      if (!resp.ok) {
        logWarn('scanner', `Uniswap API ${resp.status}: ${resp.statusText}`);
        return null;
      }

      const data = await resp.json();
      if (data.quote && data.quote.output) {
        return {
          amountOut: BigInt(data.quote.output.amount),
          gasEstimate: BigInt(data.quote.gasUseEstimate || '0'),
          route: data.routing || 'CLASSIC',
          source: 'uniswap-api',
        };
      }
      return null;
    } catch (e) {
      logWarn('scanner', `Uniswap API error: ${e.message}`);
      return null;
    }
  }

  /**
   * Get Uniswap V3 quote for a pair.
   * @param {string} tokenInSymbol
   * @param {string} tokenOutSymbol
   * @param {string} amountIn - human-readable amount
   * @param {number} decimalsIn
   * @returns {{ amountOut: bigint, gasEstimate: bigint } | null}
   */
  async getUniswapQuote(tokenInSymbol, tokenOutSymbol, amountIn, decimalsIn = 18) {
    const tokenIn = config.tokens[tokenInSymbol];
    const tokenOut = config.tokens[tokenOutSymbol];
    if (!tokenIn || !tokenOut) return null;

    const amountInWei = ethers.parseUnits(amountIn, decimalsIn);
    const fees = [500, 3000, 10000]; // 0.05%, 0.3%, 1%

    for (const fee of fees) {
      try {
        const result = await this.quoter.quoteExactInputSingle.staticCall({
          tokenIn,
          tokenOut,
          amountIn: amountInWei,
          fee,
          sqrtPriceLimitX96: 0n,
        });
        return { amountOut: result[0], gasEstimate: result[3], fee };
      } catch {
        continue;
      }
    }
    return null;
  }

  /**
   * Get Aerodrome quote for a pair.
   */
  async getAerodromeQuote(tokenInSymbol, tokenOutSymbol, amountIn, decimalsIn = 18) {
    const tokenIn = config.tokens[tokenInSymbol];
    const tokenOut = config.tokens[tokenOutSymbol];
    if (!tokenIn || !tokenOut) return null;

    const amountInWei = ethers.parseUnits(amountIn, decimalsIn);

    for (const stable of [false, true]) {
      try {
        const poolAddr = await this.aeroFactory.getPool(tokenIn, tokenOut, stable);
        if (poolAddr === ethers.ZeroAddress) continue;

        const pool = new ethers.Contract(poolAddr, AERODROME_POOL_ABI, this.provider);
        const amountOut = await pool.getAmountOut(amountInWei, tokenIn);
        return { amountOut, stable, pool: poolAddr };
      } catch {
        continue;
      }
    }
    return null;
  }

  /**
   * Scan for cross-DEX arbitrage opportunities.
   */
  async scan() {
    log('scanner', '🔍 Scanning for opportunities...');
    const found = [];

    for (const pair of config.scan.pairs) {
      const decimalsIn = pair.tokenIn === 'USDC' ? 6 : 18;
      const decimalsOut = pair.tokenOut === 'USDC' ? 6 : 18;
      const testAmount = pair.tokenIn === 'USDC' ? '1.0' : '0.0005'; // small test amounts

      try {
        // Fetch quotes from all sources in parallel
        const [uniQuote, aeroQuote, apiQuote] = await Promise.all([
          this.getUniswapQuote(pair.tokenIn, pair.tokenOut, testAmount, decimalsIn),
          this.getAerodromeQuote(pair.tokenIn, pair.tokenOut, testAmount, decimalsIn),
          this.getUniswapApiQuote(pair.tokenIn, pair.tokenOut, testAmount, decimalsIn),
        ]);

        // Use API quote if available and better than on-chain quoter
        if (apiQuote && uniQuote && apiQuote.amountOut > uniQuote.amountOut) {
          log('scanner', `📡 Uniswap API found better route: ${ethers.formatUnits(apiQuote.amountOut, decimalsOut)} vs ${ethers.formatUnits(uniQuote.amountOut, decimalsOut)}`);
        }

        if (!uniQuote || !aeroQuote) continue;

        // Compare prices
        const uniOut = uniQuote.amountOut;
        const aeroOut = aeroQuote.amountOut;

        // Calculate spread in bps
        const better = uniOut > aeroOut ? 'uniswap' : 'aerodrome';
        const worse = better === 'uniswap' ? 'aerodrome' : 'uniswap';
        const high = uniOut > aeroOut ? uniOut : aeroOut;
        const low = uniOut > aeroOut ? aeroOut : uniOut;
        const spreadBps = Number((high - low) * 10000n / low);

        const opp = {
          pair: `${pair.tokenIn}/${pair.tokenOut}`,
          tokenIn: pair.tokenIn,
          tokenOut: pair.tokenOut,
          amountIn: testAmount,
          uniswapOut: ethers.formatUnits(uniOut, decimalsOut),
          aerodromeOut: ethers.formatUnits(aeroOut, decimalsOut),
          betterDex: better,
          spreadBps,
          profitBps: spreadBps,
          profitPercent: (spreadBps / 100).toFixed(2),
          gasCost: '0.00001', // Base gas is cheap
          netProfit: spreadBps > config.scan.minProfitBps ? 'positive' : 'negative',
          timestamp: new Date().toISOString(),
        };

        found.push(opp);
        log('scanner', `${pair.tokenIn}/${pair.tokenOut}: Uni=${opp.uniswapOut} Aero=${opp.aerodromeOut} spread=${spreadBps}bps (${better} better)`);
      } catch (err) {
        logError('scanner', `Error scanning ${pair.tokenIn}/${pair.tokenOut}: ${err.message}`);
      }
    }

    this.opportunities = found;
    log('scanner', `Found ${found.length} pairs, ${found.filter(o => o.spreadBps > config.scan.minProfitBps).length} above threshold`);
    return found;
  }

  /** Get best opportunity above threshold */
  getBestOpportunity() {
    return this.opportunities
      .filter(o => o.spreadBps > config.scan.minProfitBps)
      .sort((a, b) => b.spreadBps - a.spreadBps)[0] || null;
  }
}
