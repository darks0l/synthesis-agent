// ── Identity ────────────────────────────────────────────────────────
// ERC-8004 on-chain identity + receipt logging.
// The agent's identity is its on-chain presence — every action is traceable.

import { ethers } from 'ethers';
import { config } from './config.js';
import { log } from './logger.js';

export class AgentIdentity {
  constructor(provider) {
    this.provider = provider;
    this.address = config.agentAddress;
    this.erc8004Tx = config.erc8004TxHash;
    this.receipts = [];
  }

  /** Verify ERC-8004 identity exists on-chain */
  async verify() {
    try {
      const receipt = await this.provider.getTransactionReceipt(this.erc8004Tx);
      if (!receipt || receipt.status !== 1) {
        throw new Error('ERC-8004 identity transaction not found or failed');
      }
      log('identity', `✓ ERC-8004 verified — block ${receipt.blockNumber}`);
      return true;
    } catch (err) {
      log('identity', `✗ ERC-8004 verification failed: ${err.message}`);
      return false;
    }
  }

  /** Get current wallet balances */
  async getBalances() {
    const ethBalance = await this.provider.getBalance(this.address);
    let usdcBalance = 0n;
    try {
      const usdcContract = new ethers.Contract(
        config.tokens.USDC,
        ['function balanceOf(address) view returns (uint256)'],
        this.provider
      );
      usdcBalance = await usdcContract.balanceOf(this.address);
    } catch {
      log('identity', '⚠ USDC balance check failed (RPC issue) — assuming 0');
    }

    return {
      eth: ethers.formatEther(ethBalance),
      usdc: ethers.formatUnits(usdcBalance, 6),
    };
  }

  /** Record an on-chain action receipt */
  recordReceipt(action) {
    const receipt = {
      timestamp: new Date().toISOString(),
      agent: this.address,
      erc8004: this.erc8004Tx,
      ...action,
    };
    this.receipts.push(receipt);
    log('receipt', JSON.stringify(receipt));
    return receipt;
  }

  /** Get summary for reporting */
  summary() {
    return {
      address: this.address,
      erc8004: `${config.chain.explorer}/tx/${this.erc8004Tx}`,
      totalActions: this.receipts.length,
      receipts: this.receipts,
    };
  }
}
