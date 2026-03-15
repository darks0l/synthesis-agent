// ── Orchestrator ────────────────────────────────────────────────────
// ERC-8183 Agentic Commerce integration for the Synthesis Agent.
// When the agent needs a skill it doesn't have (or wants better),
// it posts a job on-chain. Other agents bid, execute, get paid.
// This drives on-chain price discovery for agent labor.
//
// Skill types the agent can outsource:
//   - TradeEval: "Should I execute this trade?" — LLM analysis
//   - MarketScan: "What's the price on DEX X?" — data retrieval
//   - RiskAssess: "Is this sandwich-safe?" — risk analysis
//   - PriceQuote: "What should this service cost?" — meta pricing
//
// Built for The Synthesis Hackathon 🌑

import { ethers } from 'ethers';
import { config } from './config.js';
import { log, logError, logWarn } from './logger.js';

// Minimal ABI for interacting with SynthesisJobs contract
const SYNTHESIS_JOBS_ABI = [
  'function createJob(address provider, address evaluator, uint256 expiredAt, string description, uint8 skillType, uint256 budget) external returns (uint256)',
  'function createAndFund(address provider, address evaluator, uint256 expiredAt, string description, uint8 skillType, uint256 budget) external returns (uint256)',
  'function fund(uint256 jobId, uint256 expectedBudget) external',
  'function submit(uint256 jobId, bytes32 deliverable) external',
  'function complete(uint256 jobId, bytes32 reason) external',
  'function reject(uint256 jobId, bytes32 reason) external',
  'function claimRefund(uint256 jobId) external',
  'function getJob(uint256 jobId) external view returns (tuple(address client, address provider, address evaluator, string description, uint8 skillType, uint256 budget, uint256 expiredAt, uint8 status, bytes32 deliverable, bytes32 attestation, uint256 createdAt, uint256 completedAt))',
  'function averageCost(uint8 skillType) external view returns (uint256)',
  'function providerSuccessRate(address provider) external view returns (uint256)',
  'function jobCount() external view returns (uint256)',
  'function totalPaidBySkill(uint8) external view returns (uint256)',
  'function jobsCompletedBySkill(uint8) external view returns (uint256)',
];

const ERC20_ABI = [
  'function approve(address spender, uint256 amount) external returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)',
];

// Skill type enum (must match contract)
const SkillType = {
  TradeEval: 0,
  MarketScan: 1,
  RiskAssess: 2,
  PriceQuote: 3,
  Custom: 4,
};

// Default budgets per skill (USDC, 6 decimals)
const DEFAULT_BUDGETS = {
  [SkillType.TradeEval]: 50000n,    // $0.05 USDC
  [SkillType.MarketScan]: 20000n,   // $0.02 USDC
  [SkillType.RiskAssess]: 30000n,   // $0.03 USDC
  [SkillType.PriceQuote]: 10000n,   // $0.01 USDC
  [SkillType.Custom]: 50000n,       // $0.05 USDC
};

// Job expiry: 5 minutes for quick tasks
const DEFAULT_EXPIRY_SEC = 5 * 60;

export class Orchestrator {
  constructor(provider, contractAddress) {
    this.provider = provider;
    this.contractAddress = contractAddress;
    this.contract = contractAddress
      ? new ethers.Contract(contractAddress, SYNTHESIS_JOBS_ABI, provider)
      : null;

    // Track posted jobs
    this.postedJobs = [];
    this.completedJobs = [];
    this.totalSpent = 0n;

    // Price discovery cache
    this.priceCache = {};
  }

  get deployed() {
    return !!this.contractAddress;
  }

  /**
   * Post a job for trade evaluation.
   * The agent is the client — it wants another agent to evaluate a trade opportunity.
   */
  async postTradeEvalJob(opportunity, wallet) {
    if (!this.deployed) {
      log('orchestrator', '⚠ SynthesisJobs not deployed — using local evaluation');
      return null;
    }

    const description = JSON.stringify({
      task: 'evaluate_trade',
      pair: opportunity.pair,
      spreadBps: opportunity.spreadBps,
      uniswapOut: opportunity.uniswapOut,
      aerodromeOut: opportunity.aerodromeOut,
      betterDex: opportunity.betterDex,
      chain: config.chain.name,
      expectedOutput: 'JSON: { execute: boolean, confidence: 0-100, reasoning: string }',
    });

    return this._postJob(SkillType.TradeEval, description, wallet);
  }

  /**
   * Post a job for market scanning — get prices from DEXs the agent doesn't cover.
   */
  async postMarketScanJob(pair, dexes, wallet) {
    if (!this.deployed) return null;

    const description = JSON.stringify({
      task: 'market_scan',
      pair,
      dexes, // e.g. ['sushiswap', 'curve', 'balancer']
      chain: config.chain.name,
      expectedOutput: 'JSON: { prices: [{ dex: string, amountOut: string, fee: number }] }',
    });

    return this._postJob(SkillType.MarketScan, description, wallet);
  }

  /**
   * Post a job for risk assessment before executing a trade.
   */
  async postRiskAssessJob(trade, wallet) {
    if (!this.deployed) return null;

    const description = JSON.stringify({
      task: 'risk_assess',
      trade,
      checks: ['sandwich_risk', 'gas_spike', 'liquidity_depth', 'slippage_estimate'],
      chain: config.chain.name,
      expectedOutput: 'JSON: { safe: boolean, risks: string[], confidence: 0-100 }',
    });

    return this._postJob(SkillType.RiskAssess, description, wallet);
  }

  /**
   * Internal: post a job on-chain.
   */
  async _postJob(skillType, description, wallet) {
    try {
      const budget = await this._getBudget(skillType);
      const expiredAt = Math.floor(Date.now() / 1000) + DEFAULT_EXPIRY_SEC;

      // For hackathon: agent is both client AND evaluator (self-attesting)
      // In production, evaluator would be a verification contract
      const evaluator = config.agentAddress;
      const provider = ethers.ZeroAddress; // Open bidding

      const contractWithSigner = this.contract.connect(wallet);

      // Ensure USDC approval
      const usdc = new ethers.Contract(config.tokens.USDC, ERC20_ABI, wallet);
      const allowance = await usdc.allowance(config.agentAddress, this.contractAddress);
      if (allowance < budget) {
        log('orchestrator', 'Approving USDC for SynthesisJobs...');
        const approveTx = await usdc.approve(this.contractAddress, ethers.MaxUint256);
        await approveTx.wait();
      }

      // Create job (Open state — waiting for provider to bid)
      log('orchestrator', `📋 Posting ${this._skillName(skillType)} job — budget: $${ethers.formatUnits(budget, 6)} USDC`);
      const tx = await contractWithSigner.createJob(
        provider,
        evaluator,
        expiredAt,
        description,
        skillType,
        budget
      );
      const receipt = await tx.wait();

      // Parse jobId from event
      const event = receipt.logs.find(l => {
        try {
          return contractWithSigner.interface.parseLog(l)?.name === 'JobCreated';
        } catch { return false; }
      });
      const jobId = event
        ? contractWithSigner.interface.parseLog(event).args[0]
        : this.postedJobs.length;

      const jobRecord = {
        jobId: Number(jobId),
        skillType,
        budget: ethers.formatUnits(budget, 6),
        status: 'Open',
        txHash: receipt.hash,
        postedAt: new Date().toISOString(),
        description,
      };

      this.postedJobs.push(jobRecord);
      log('orchestrator', `✓ Job #${jobId} posted — TX: ${config.chain.explorer}/tx/${receipt.hash}`);

      return jobRecord;
    } catch (err) {
      logError('orchestrator', `Failed to post job: ${err.message}`);
      return null;
    }
  }

  /**
   * Check if any posted jobs have responses, and evaluate/complete them.
   * In the hackathon demo, we self-submit and self-evaluate to show the flow.
   */
  async checkJobs(wallet) {
    if (!this.deployed || this.postedJobs.length === 0) return [];

    const results = [];
    const contractWithSigner = this.contract.connect(wallet);

    for (const jobRecord of this.postedJobs) {
      if (jobRecord.status !== 'Open' && jobRecord.status !== 'Funded') continue;

      try {
        const job = await this.contract.getJob(jobRecord.jobId);
        const status = Number(job.status);

        // Status 2 = Submitted — evaluate it
        if (status === 2) {
          log('orchestrator', `📥 Job #${jobRecord.jobId} has submission — evaluating...`);

          // For demo: auto-complete if deliverable is non-zero
          if (job.deliverable !== ethers.ZeroHash) {
            const attestation = ethers.keccak256(
              ethers.toUtf8Bytes(`completed:${jobRecord.jobId}:${Date.now()}`)
            );
            const completeTx = await contractWithSigner.complete(jobRecord.jobId, attestation);
            await completeTx.wait();

            jobRecord.status = 'Completed';
            jobRecord.completedAt = new Date().toISOString();
            this.completedJobs.push(jobRecord);
            this.totalSpent += ethers.parseUnits(jobRecord.budget, 6);

            log('orchestrator', `✅ Job #${jobRecord.jobId} completed — paid $${jobRecord.budget} USDC`);
            results.push({ jobId: jobRecord.jobId, action: 'completed', budget: jobRecord.budget });
          }
        }

        // Check for expiry
        if (status === 0 || status === 1) {
          const now = Math.floor(Date.now() / 1000);
          if (now >= Number(job.expiredAt)) {
            if (status === 1) {
              // Funded and expired — claim refund
              const refundTx = await contractWithSigner.claimRefund(jobRecord.jobId);
              await refundTx.wait();
              log('orchestrator', `⏰ Job #${jobRecord.jobId} expired — refunded`);
            }
            jobRecord.status = 'Expired';
            results.push({ jobId: jobRecord.jobId, action: 'expired' });
          }
        }
      } catch (err) {
        logError('orchestrator', `Error checking job #${jobRecord.jobId}: ${err.message}`);
      }
    }

    return results;
  }

  /**
   * Self-fulfill a job — for the hackathon demo, the agent posts AND fulfills
   * its own jobs to demonstrate the full ERC-8183 lifecycle on-chain.
   * In production, other agents would pick these up.
   */
  async selfFulfill(jobId, result, wallet) {
    if (!this.deployed) return null;

    try {
      const contractWithSigner = this.contract.connect(wallet);
      const job = await this.contract.getJob(jobId);

      // Set self as provider if open
      if (job.provider === ethers.ZeroAddress) {
        const setTx = await contractWithSigner.setProvider(jobId, config.agentAddress);
        await setTx.wait();
        log('orchestrator', `Set self as provider for job #${jobId}`);
      }

      // Fund the job (if still Open)
      if (Number(job.status) === 0) {
        const fundTx = await contractWithSigner.fund(jobId, job.budget);
        await fundTx.wait();
        log('orchestrator', `Funded job #${jobId}`);
      }

      // Submit deliverable
      const deliverable = ethers.keccak256(ethers.toUtf8Bytes(JSON.stringify(result)));
      const submitTx = await contractWithSigner.submit(jobId, deliverable);
      await submitTx.wait();
      log('orchestrator', `Submitted work for job #${jobId}`);

      // Complete (self-evaluate)
      const attestation = ethers.keccak256(
        ethers.toUtf8Bytes(`self-eval:quality:${Date.now()}`)
      );
      const completeTx = await contractWithSigner.complete(jobId, attestation);
      await completeTx.wait();

      log('orchestrator', `✅ Job #${jobId} self-fulfilled — full ERC-8183 lifecycle complete`);

      // Update record
      const record = this.postedJobs.find(j => j.jobId === jobId);
      if (record) {
        record.status = 'Completed';
        record.completedAt = new Date().toISOString();
        this.completedJobs.push(record);
      }

      return { jobId, status: 'completed', deliverable, attestation };
    } catch (err) {
      logError('orchestrator', `Self-fulfill failed for job #${jobId}: ${err.message}`);
      return null;
    }
  }

  /**
   * Get the budget for a skill type — uses on-chain price discovery if available,
   * otherwise falls back to defaults.
   */
  async _getBudget(skillType) {
    if (this.contract) {
      try {
        const avgCost = await this.contract.averageCost(skillType);
        if (avgCost > 0n) {
          log('orchestrator', `📊 Market price for ${this._skillName(skillType)}: $${ethers.formatUnits(avgCost, 6)} USDC`);
          return avgCost;
        }
      } catch {}
    }
    return DEFAULT_BUDGETS[skillType] || DEFAULT_BUDGETS[SkillType.Custom];
  }

  /**
   * Get price discovery data — what the market charges for each skill.
   */
  async getPriceDiscovery() {
    if (!this.deployed) return null;

    const discovery = {};
    for (const [name, type] of Object.entries(SkillType)) {
      try {
        const avg = await this.contract.averageCost(type);
        const count = await this.contract.jobsCompletedBySkill(type);
        const total = await this.contract.totalPaidBySkill(type);
        discovery[name] = {
          averageCost: ethers.formatUnits(avg, 6),
          jobsCompleted: Number(count),
          totalPaid: ethers.formatUnits(total, 6),
        };
      } catch {
        discovery[name] = { averageCost: '0', jobsCompleted: 0, totalPaid: '0' };
      }
    }
    return discovery;
  }

  _skillName(type) {
    return Object.entries(SkillType).find(([, v]) => v === type)?.[0] || 'Custom';
  }

  stats() {
    return {
      deployed: this.deployed,
      contractAddress: this.contractAddress,
      jobsPosted: this.postedJobs.length,
      jobsCompleted: this.completedJobs.length,
      totalSpent: ethers.formatUnits(this.totalSpent, 6),
      postedJobs: this.postedJobs,
    };
  }
}

export { SkillType };
