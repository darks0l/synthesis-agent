// ── Executor ────────────────────────────────────────────────────────
// Executes trades via the Agent Signer (scoped spending proxy).
// Never touches private keys directly — all signing goes through the signer.

import { ethers } from 'ethers';
import { config } from './config.js';
import { log, logError, logWarn } from './logger.js';

const ERC20_ABI = [
  'function approve(address spender, uint256 amount) external returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function balanceOf(address) view returns (uint256)',
];

const SWAP_ROUTER_ABI = [
  'function exactInputSingle((address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 amountIn, uint256 amountOutMinimum, uint160 sqrtPriceLimitX96)) external payable returns (uint256 amountOut)',
];

export class Executor {
  constructor(provider) {
    this.provider = provider;
    this.dailySpent = 0;
    this.lastTradeTime = 0;
    this.executedTrades = [];
  }

  /** Check if we can execute (spending limits + cooldown) */
  canExecute(amountUsd) {
    const now = Date.now();

    // Cooldown check
    if (now - this.lastTradeTime < config.spending.cooldownMs) {
      const waitSec = Math.ceil((config.spending.cooldownMs - (now - this.lastTradeTime)) / 1000);
      log('executor', `⏳ Cooldown: wait ${waitSec}s`);
      return { ok: false, reason: `Cooldown: ${waitSec}s remaining` };
    }

    // Per-tx limit
    if (amountUsd > parseFloat(config.spending.maxPerTx)) {
      return { ok: false, reason: `Exceeds per-tx limit: $${amountUsd} > $${config.spending.maxPerTx}` };
    }

    // Daily limit
    if (this.dailySpent + amountUsd > parseFloat(config.spending.maxDaily)) {
      return { ok: false, reason: `Exceeds daily limit: $${this.dailySpent + amountUsd} > $${config.spending.maxDaily}` };
    }

    return { ok: true };
  }

  /**
   * Execute a swap via the agent signer.
   * @param {object} opportunity - from scanner
   * @param {object} wallet - ethers.Wallet (loaded from agent signer or direct)
   * @returns {object} trade result
   */
  async executeSwap(opportunity, wallet) {
    const { tokenIn, tokenOut, amountIn } = opportunity;
    const decimalsIn = tokenIn === 'USDC' ? 6 : 18;

    // Estimate USD value for spending check
    const usdValue = tokenIn === 'USDC' ? parseFloat(amountIn) : parseFloat(amountIn) * 2000; // rough ETH price
    const check = this.canExecute(usdValue);
    if (!check.ok) {
      logWarn('executor', `Trade blocked: ${check.reason}`);
      return { success: false, reason: check.reason };
    }

    if (config.dryRun) {
      log('executor', `🏜️ DRY RUN: Would swap ${amountIn} ${tokenIn} → ${tokenOut}`);
      const dryResult = {
        success: true,
        dryRun: true,
        pair: `${tokenIn}/${tokenOut}`,
        amountIn,
        txHash: '0x' + 'dry'.repeat(21) + '0',
        timestamp: new Date().toISOString(),
      };
      this.executedTrades.push(dryResult);
      return dryResult;
    }

    try {
      const tokenInAddr = config.tokens[tokenIn];
      const tokenOutAddr = config.tokens[tokenOut];
      const amountInWei = ethers.parseUnits(amountIn, decimalsIn);

      // For ERC-20 → need approval first
      if (tokenIn !== 'WETH') {
        const token = new ethers.Contract(tokenInAddr, ERC20_ABI, wallet);
        const allowance = await token.allowance(config.agentAddress, config.uniswap.routerV3);
        if (allowance < amountInWei) {
          log('executor', `Approving ${tokenIn} for SwapRouter...`);
          const approveTx = await token.approve(config.uniswap.routerV3, ethers.MaxUint256);
          await approveTx.wait();
          log('executor', `✓ Approval tx: ${approveTx.hash}`);
        }
      }

      // Execute swap
      const router = new ethers.Contract(config.uniswap.routerV3, SWAP_ROUTER_ABI, wallet);
      const swapParams = {
        tokenIn: tokenInAddr,
        tokenOut: tokenOutAddr,
        fee: opportunity.fee || 3000,
        recipient: config.agentAddress,
        amountIn: amountInWei,
        amountOutMinimum: 0n, // In production, use slippage protection
        sqrtPriceLimitX96: 0n,
      };

      log('executor', `🔄 Swapping ${amountIn} ${tokenIn} → ${tokenOut}...`);

      const value = tokenIn === 'WETH' ? amountInWei : 0n;
      const tx = await router.exactInputSingle(swapParams, { value });
      const receipt = await tx.wait();

      const result = {
        success: true,
        dryRun: false,
        pair: `${tokenIn}/${tokenOut}`,
        amountIn,
        txHash: receipt.hash,
        blockNumber: receipt.blockNumber,
        gasUsed: receipt.gasUsed.toString(),
        explorer: `${config.chain.explorer}/tx/${receipt.hash}`,
        timestamp: new Date().toISOString(),
      };

      this.dailySpent += usdValue;
      this.lastTradeTime = Date.now();
      this.executedTrades.push(result);

      log('executor', `✅ Swap executed: ${result.explorer}`);
      return result;

    } catch (err) {
      logError('executor', `Swap failed: ${err.message}`);
      return { success: false, reason: err.message };
    }
  }

  /** Direct ETH→token swap using native ETH (not WETH) */
  async swapETHForToken(tokenOut, ethAmount, wallet) {
    return this.executeSwap({
      tokenIn: 'WETH',
      tokenOut,
      amountIn: ethAmount,
      fee: 500, // 0.05% pool for WETH/USDC
    }, wallet);
  }

  stats() {
    return {
      tradesExecuted: this.executedTrades.length,
      dailySpent: this.dailySpent,
      trades: this.executedTrades,
    };
  }
}
