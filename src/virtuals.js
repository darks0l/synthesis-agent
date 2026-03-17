/**
 * Virtuals ACP v2 Integration — Optional cross-posting to Virtuals agent network
 * 
 * When configured, the agent can:
 * - Browse and discover other agents on the Virtuals network
 * - Post ERC-8183 jobs to the Virtuals ACP contract (cross-post alongside SynthesisJobs)
 * - Accept incoming job requests from other agents
 * - Track job lifecycle through Virtuals' unified workflow
 * 
 * Requires: VIRTUALS_SESSION_KEY_ID + wallet private key
 * Optional: VIRTUALS_AGENT_WALLET (defaults to agent wallet)
 * 
 * When not configured, the module is a no-op — all methods return gracefully.
 */

import { config } from './config.js';
import { log } from './logger.js';

// Dynamic import for the SDK (ESM/CJS compat)
let AcpClient, AcpContractClientV2, baseAcpConfigV2;

const MODULE = 'virtuals';

export class VirtualsACP {
  constructor() {
    this.client = null;
    this.enabled = false;
    this.initialized = false;
    this.stats = {
      jobsPosted: 0,
      jobsReceived: 0,
      jobsCompleted: 0,
      agentsDiscovered: 0,
    };
  }

  async init(wallet) {
    // Check if Virtuals integration is configured
    if (!config.virtuals?.enabled) {
      log(MODULE, 'Virtuals ACP v2 disabled (not configured)');
      return false;
    }

    if (!config.virtuals.sessionKeyId) {
      log(MODULE, 'Virtuals ACP v2 disabled (no session key ID — register at app.virtuals.io/acp/join)');
      return false;
    }

    try {
      // Dynamic import
      const sdk = await import('@virtuals-protocol/acp-node');
      AcpClient = sdk.default;
      AcpContractClientV2 = sdk.AcpContractClientV2;
      baseAcpConfigV2 = sdk.baseAcpConfigV2;

      const agentWallet = config.virtuals.agentWallet || config.identity.agentAddress;
      const rpcUrl = config.virtuals.rpcUrl || config.chain.rpcUrl;

      log(MODULE, `Initializing ACP v2 client...`);
      log(MODULE, `  Contract: ${baseAcpConfigV2.contractAddress}`);
      log(MODULE, `  Agent wallet: ${agentWallet}`);
      log(MODULE, `  Network: Base mainnet`);

      // Build contract client
      const contractClient = await AcpContractClientV2.build(
        wallet.privateKey,
        config.virtuals.sessionKeyId,
        agentWallet,
        rpcUrl,
        baseAcpConfigV2 // Base mainnet config
      );

      // Create ACP client with job handlers
      this.client = new AcpClient({
        acpContractClient: contractClient,
        onNewTask: (job) => this._handleNewTask(job),
        onEvaluate: (job) => this._handleEvaluate(job),
      });

      await this.client.init();

      this.enabled = true;
      this.initialized = true;
      log(MODULE, '✓ Virtuals ACP v2 connected');
      return true;

    } catch (err) {
      log(MODULE, `Failed to initialize: ${err.message}`);
      this.enabled = false;
      return false;
    }
  }

  /**
   * Browse available agents on the Virtuals network
   * @param {string} query - Search query (e.g., "trading", "market analysis")
   * @param {object} options - Sort, filter options
   * @returns {Array} List of discovered agents
   */
  async browseAgents(query, options = {}) {
    if (!this.enabled) return [];

    try {
      const agents = await this.client.browseAgents({
        query,
        sortBy: options.sortBy || 'SUCCESSFUL_JOB_COUNT',
        limit: options.limit || 10,
        ...(options.graduationStatus && { graduationStatus: options.graduationStatus }),
        ...(options.onlineStatus && { onlineStatus: options.onlineStatus }),
      });

      this.stats.agentsDiscovered += agents.length;
      log(MODULE, `Discovered ${agents.length} agents for "${query}"`);
      return agents;

    } catch (err) {
      log(MODULE, `Agent discovery failed: ${err.message}`);
      return [];
    }
  }

  /**
   * Post a job to the Virtuals ACP network
   * Cross-posts alongside our SynthesisJobs contract
   * 
   * @param {object} params - Job parameters
   * @param {string} params.provider - Provider agent wallet address
   * @param {string} params.description - Job description/metadata
   * @param {number} params.budgetUSDC - Budget in USDC
   * @param {string} [params.evaluator] - Optional evaluator address (defaults to self)
   * @param {number} [params.expiresInHours] - Hours until expiry (default: 24)
   * @returns {object|null} Job result with ID
   */
  async postJob(params) {
    if (!this.enabled) return null;

    try {
      const {
        provider,
        description,
        budgetUSDC,
        evaluator,
        expiresInHours = 24,
      } = params;

      const budgetRaw = BigInt(Math.floor(budgetUSDC * 1e6)); // USDC has 6 decimals
      const expiredAt = Math.floor(Date.now() / 1000) + (expiresInHours * 3600);

      const metadata = JSON.stringify({
        type: 'synthesis-agent-job',
        description,
        source: 'darksol-synthesis-agent',
        version: '0.2.0',
        timestamp: new Date().toISOString(),
      });

      log(MODULE, `Posting job to Virtuals ACP...`);
      log(MODULE, `  Provider: ${provider}`);
      log(MODULE, `  Budget: ${budgetUSDC} USDC`);
      log(MODULE, `  Expires: ${expiresInHours}h`);

      const job = await this.client.initiateJob({
        provider,
        evaluator: evaluator || config.identity.agentAddress, // self-evaluate by default
        budget: budgetRaw,
        expiredAt,
        metadata,
      });

      this.stats.jobsPosted++;
      log(MODULE, `✓ Job posted to Virtuals ACP — ID: ${job?.id || 'pending'}`);
      return job;

    } catch (err) {
      log(MODULE, `Failed to post job: ${err.message}`);
      return null;
    }
  }

  /**
   * Post a trade evaluation job — the most common job type for our agent
   * Finds suitable providers and posts the job
   */
  async postTradeEvalJob(opportunity) {
    if (!this.enabled) return null;

    try {
      // First, discover agents that can evaluate trades
      const providers = await this.browseAgents('trade evaluation DeFi analysis', {
        sortBy: 'SUCCESS_RATE',
        limit: 5,
        onlineStatus: 'ONLINE',
      });

      if (providers.length === 0) {
        log(MODULE, 'No online providers found for trade evaluation');
        return null;
      }

      // Pick the best provider (highest success rate)
      const provider = providers[0];
      log(MODULE, `Selected provider: ${provider.name || provider.address}`);

      return await this.postJob({
        provider: provider.walletAddress || provider.address,
        description: JSON.stringify({
          skillType: 'TradeEval',
          opportunity: {
            pair: opportunity.pair,
            spreadBps: opportunity.spreadBps,
            buyDex: opportunity.buyDex,
            sellDex: opportunity.sellDex,
            amount: opportunity.amount,
          },
          request: 'Evaluate this cross-DEX arbitrage opportunity. Return confidence score (0-100) and reasoning.',
        }),
        budgetUSDC: 0.05, // $0.05 per evaluation
        expiresInHours: 1,
      });

    } catch (err) {
      log(MODULE, `Trade eval job failed: ${err.message}`);
      return null;
    }
  }

  /**
   * Check and process active jobs
   */
  async checkJobs() {
    if (!this.enabled) return { active: 0, completed: 0 };

    try {
      const active = await this.client.getActiveJobs(0, 10);
      const completed = await this.client.getCompletedJobs(0, 10);

      return {
        active: active?.length || 0,
        completed: completed?.length || 0,
        jobs: active || [],
      };

    } catch (err) {
      log(MODULE, `Job check failed: ${err.message}`);
      return { active: 0, completed: 0 };
    }
  }

  /**
   * Handle incoming job request (we're the provider)
   */
  _handleNewTask(job) {
    this.stats.jobsReceived++;
    log(MODULE, `📥 New job received — ID: ${job.id}, from: ${job.client}`);

    // Parse job metadata to determine if we can fulfill
    try {
      const metadata = JSON.parse(job.metadata || '{}');
      log(MODULE, `  Type: ${metadata.type || 'unknown'}`);
      log(MODULE, `  Description: ${metadata.description || 'none'}`);

      // Auto-accept trade evaluation jobs (our specialty)
      if (metadata.description?.includes('TradeEval') || metadata.description?.includes('trade')) {
        log(MODULE, '  → Auto-accepting trade evaluation job');
        // In a full implementation, we'd call job.accept() and then deliver results
      }
    } catch {
      log(MODULE, '  Could not parse job metadata');
    }
  }

  /**
   * Handle evaluation request (we're the evaluator)
   */
  _handleEvaluate(job) {
    log(MODULE, `📋 Evaluation request — Job ID: ${job.id}`);
    // In production: validate deliverable quality, approve/reject
  }

  /**
   * Get module summary for cycle reporting
   */
  summary() {
    if (!this.enabled) {
      return '  Virtuals ACP: disabled (not configured)';
    }

    return [
      `  Virtuals ACP v2: ✓ connected`,
      `    Contract: ${baseAcpConfigV2?.contractAddress || 'unknown'}`,
      `    Jobs posted: ${this.stats.jobsPosted}`,
      `    Jobs received: ${this.stats.jobsReceived}`,
      `    Agents discovered: ${this.stats.agentsDiscovered}`,
    ].join('\n');
  }

  /**
   * Get config info for display
   */
  static getConfigInfo() {
    return {
      contractAddress: '0xa6C9BA866992cfD7fd6460ba912bfa405adA9df0',
      network: 'Base mainnet',
      sdk: '@virtuals-protocol/acp-node',
      registryUrl: 'https://app.virtuals.io/acp/join',
      docsUrl: 'https://whitepaper.virtuals.io/acp-product-resources/introducing-acp-v2',
    };
  }
}
