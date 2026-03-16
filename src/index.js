#!/usr/bin/env node
// ── Synthesis Agent ─────────────────────────────────────────────────
// Autonomous agent economy orchestrator.
// Built for The Synthesis Hackathon (March 2026).
//
// What it does:
//   1. Wakes up with ERC-8004 on-chain identity
//   2. Checks wallet balances
//   3. Scans for cross-DEX arbitrage opportunities (Uniswap V3 + Aerodrome)
//   4. Routes evaluation through Bankr LLM Gateway
//   5. Executes trades via scoped spending limits
//   6. Logs every action as a traceable receipt
//   7. Reports results
//
// Usage:
//   node src/index.js              # live mode
//   node src/index.js --dry-run    # scan + evaluate without executing
//   node src/index.js --once       # single cycle, then exit
//   node src/index.js --verbose    # extra logging
//
// Built by DARKSOL 🌑

import { ethers } from 'ethers';
import { config } from './config.js';
import { log, logError } from './logger.js';
import { AgentIdentity } from './identity.js';
import { LLMGateway } from './llm.js';
import { Scanner } from './scanner.js';
import { Executor } from './executor.js';
import { Reporter } from './reporter.js';
import { Orchestrator, SkillType } from './orchestrator.js';
import { FeedbackLoop } from './feedback.js';

// ── Banner ──
function banner() {
  console.log(`
╔═══════════════════════════════════════════════════╗
║     🌑 SYNTHESIS AGENT — DARKSOL                 ║
║     Autonomous Agent Economy Orchestrator         ║
║     ERC-8004 Identity • LLM Routing • On-Chain   ║
╚═══════════════════════════════════════════════════╝
  `);
  console.log(`Mode: ${config.dryRun ? '🏜️ DRY RUN' : '🔴 LIVE'}`);
  console.log(`Agent: ${config.agentAddress}`);
  console.log(`Chain: ${config.chain.name} (${config.chain.chainId})`);
  console.log(`Limits: $${config.spending.maxPerTx}/tx, $${config.spending.maxDaily}/day`);
  console.log('');
}

// ── Main Loop ──
async function main() {
  banner();
  const once = process.argv.includes('--once');

  // Connect to Base
  const provider = new ethers.JsonRpcProvider(config.chain.rpc);
  log('main', `Connected to ${config.chain.name} via ${config.chain.rpc}`);

  // Initialize components
  const identity = new AgentIdentity(provider);
  const llm = new LLMGateway();
  const scanner = new Scanner(provider);
  const executor = new Executor(provider);
  const orchestrator = new Orchestrator(provider, config.orchestrator.contractAddress);
  const feedback = new FeedbackLoop();
  const reporter = new Reporter(identity, scanner, executor, llm);

  // Verify identity
  const identityOk = await identity.verify();
  if (!identityOk) {
    logError('main', 'ERC-8004 identity verification failed — continuing anyway');
  }

  // Check balances
  const balances = await identity.getBalances();
  log('main', `💰 ETH: ${balances.eth} | USDC: ${balances.usdc}`);

  // Check LLM gateway
  log('main', `🧠 LLM Gateway: ${llm.available ? '✓ connected' : '✗ no API key (using fallback)'}`);

  // Check orchestrator
  log('main', `🔗 ERC-8183 Orchestrator: ${orchestrator.deployed ? '✓ ' + config.orchestrator.contractAddress : '✗ not deployed (local-only mode)'}`);

  // ── Agent Loop ──
  async function cycle() {
    log('main', `═══ Cycle ${reporter.cycleCount + 1} ═══`);

    try {
      // 1. Scan for opportunities
      const opportunities = await scanner.scan();

      // 2. Find best opportunity
      const best = scanner.getBestOpportunity();

      let decision = null;
      let tradeResult = null;

      // Load wallet once for the cycle
      let wallet = null;
      try {
        const { readFileSync } = await import('fs');
        const { join, dirname } = await import('path');
        const { fileURLToPath } = await import('url');
        const __dirname = dirname(fileURLToPath(import.meta.url));
        const raw = readFileSync(join(__dirname, '..', '..', '.keys', 'base-deployer.txt'), 'utf8');
        const match = raw.match(/DEPLOYER_KEY=(0x[a-fA-F0-9]+)/);
        const pk = match ? match[1] : raw.trim();
        wallet = new ethers.Wallet(pk, provider);
      } catch (err) {
        logError('main', `Cannot load wallet: ${err.message}`);
      }

      if (best) {
        // 3. Post ERC-8183 job for trade evaluation (if orchestrator deployed)
        let orchestratorJob = null;
        if (orchestrator.deployed && wallet) {
          orchestratorJob = await orchestrator.postTradeEvalJob(best, wallet);
          if (orchestratorJob) {
            log('main', `🔗 ERC-8183 job #${orchestratorJob.jobId} posted for trade eval`);
          }
        }

        // 4. Ask LLM to evaluate (or use outsourced result when available)
        log('main', `🧠 Evaluating: ${best.pair} (${best.spreadBps}bps spread)`);
        decision = await llm.evaluateOpportunity(best);
        log('main', `Decision: execute=${decision.execute}, confidence=${decision.confidence}%`);

        // 5. If orchestrator job was posted, self-fulfill with our evaluation result
        //    (Demo: shows full ERC-8183 lifecycle. Production: other agents would do this.)
        if (orchestratorJob && config.orchestrator.selfFulfill && wallet) {
          const fulfillResult = await orchestrator.selfFulfill(orchestratorJob.jobId, decision, wallet);

          // Evaluate the outsourced result against our history (feedback loop)
          if (fulfillResult) {
            const evaluation = feedback.evaluateOutsourcedResult(decision, best);
            log('main', `🔄 Feedback: quality=${evaluation.quality}${evaluation.insight ? ` | insight: ${evaluation.insight.substring(0, 60)}` : ''}`);
          }
        }

        // 6. Execute if approved — use adaptive threshold from feedback
        const threshold = Math.max(50, 60 - feedback.learnings.confidenceBoost);
        if (decision.execute && decision.confidence >= threshold) {
          log('main', `🔄 Trade approved (confidence ${decision.confidence}% >= ${threshold}% adaptive threshold) — executing...`);
          if (wallet) {
            tradeResult = await executor.executeSwap(best, wallet);
          } else {
            tradeResult = { success: false, reason: 'No wallet available' };
          }
        } else {
          log('main', `⏭️ Skipping: confidence ${decision.confidence}% < ${threshold}% threshold`);
          tradeResult = { success: false, reason: `Below confidence threshold (${decision.confidence}%)` };
        }

        // 7. Record trade in feedback loop (builds learning data)
        feedback.recordTrade({
          pair: best.pair,
          spreadBps: best.spreadBps,
          decision: decision.execute ? 'execute' : 'skip',
          confidence: decision.confidence,
          txHash: tradeResult?.txHash || null,
          amountIn: best.amountIn,
          source: orchestratorJob ? 'orchestrated' : 'self',
          erc8183JobId: orchestratorJob?.jobId ?? null,
        });

        // 8. Record receipt with ERC-8183 job reference
        identity.recordReceipt({
          type: 'trade_evaluation',
          pair: best.pair,
          spread: best.spreadBps,
          decision: decision.execute ? 'execute' : 'skip',
          confidence: decision.confidence,
          txHash: tradeResult?.txHash || null,
          erc8183JobId: orchestratorJob?.jobId ?? null,
        });
      } else {
        log('main', '📊 No opportunities above threshold');
      }

      // 8. Check pending ERC-8183 jobs
      if (orchestrator.deployed && wallet) {
        const jobResults = await orchestrator.checkJobs(wallet);
        if (jobResults.length > 0) {
          log('main', `🔗 ERC-8183: ${jobResults.length} job(s) updated`);
        }
      }

      // 6. Report
      const report = reporter.cycleReport(opportunities, decision, tradeResult);
      console.log('\n' + reporter.formatReport(report) + '\n');

      // Update balances
      const newBalances = await identity.getBalances();
      log('main', `💰 Post-cycle — ETH: ${newBalances.eth} | USDC: ${newBalances.usdc}`);

    } catch (err) {
      logError('main', `Cycle error: ${err.message}`);
    }
  }

  // Run first cycle
  await cycle();

  if (once) {
    log('main', '✓ Single cycle complete. Exiting.');
    const summary = identity.summary();
    const orchStats = orchestrator.stats();
    console.log('\n📋 Session Summary:');
    console.log(`   Actions: ${summary.totalActions}`);
    console.log(`   Trades: ${executor.stats().tradesExecuted}`);
    console.log(`   LLM calls: ${llm.stats().calls} (${llm.stats().tokens} tokens)`);
    const fbStats = feedback.stats();
    console.log(`   ERC-8183 jobs: ${orchStats.jobsPosted} posted, ${orchStats.jobsCompleted} completed`);
    console.log(`   Orchestrator spent: $${orchStats.totalSpent} USDC`);
    console.log(`   Feedback: ${fbStats.totalTrades} trades logged, ${fbStats.improvementsAdopted} improvements adopted`);
    console.log(`   Adaptive threshold: ${fbStats.currentMinSpreadBps}bps min spread`);
    console.log(`   Identity: ${summary.erc8004}`);
    process.exit(0);
  }

  // Continuous loop
  log('main', `🔄 Continuous mode — scanning every ${config.scan.intervalMs / 1000}s`);
  setInterval(() => {
    cycle().catch(err => logError('main', `Cycle error (unhandled): ${err.message}`));
  }, config.scan.intervalMs);
}

// Global safety nets — never let unhandled errors kill the scanner
process.on('unhandledRejection', (err) => {
  logError('main', `Unhandled rejection: ${err?.message || err}`);
});
process.on('uncaughtException', (err) => {
  logError('main', `Uncaught exception: ${err?.message || err}`);
});

// ── Go ──
main().catch(err => {
  logError('main', `Fatal: ${err.message}`);
  process.exit(1);
});
