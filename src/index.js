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

      if (best) {
        // 3. Ask LLM to evaluate
        log('main', `🧠 Evaluating: ${best.pair} (${best.spreadBps}bps spread)`);
        decision = await llm.evaluateOpportunity(best);
        log('main', `Decision: execute=${decision.execute}, confidence=${decision.confidence}%`);

        // 4. Execute if approved
        if (decision.execute && decision.confidence >= 60) {
          // We need a wallet to execute — check agent signer or direct
          // For now, log the decision. Real execution needs wallet loaded.
          log('main', '🔄 Trade approved by AI — checking wallet...');

          // Try to load wallet from .keys
          try {
            const { readFileSync } = await import('fs');
            const { join, dirname } = await import('path');
            const { fileURLToPath } = await import('url');
            const __dirname = dirname(fileURLToPath(import.meta.url));
            const pk = readFileSync(join(__dirname, '..', '..', '.keys', 'base-deployer.txt'), 'utf8').trim();
            const wallet = new ethers.Wallet(pk, provider);
            tradeResult = await executor.executeSwap(best, wallet);
          } catch (err) {
            logError('main', `Cannot load wallet: ${err.message}`);
            tradeResult = { success: false, reason: 'No wallet available' };
          }
        } else {
          log('main', `⏭️ Skipping: confidence ${decision.confidence}% < 60% threshold`);
          tradeResult = { success: false, reason: `Below confidence threshold (${decision.confidence}%)` };
        }

        // 5. Record receipt
        identity.recordReceipt({
          type: 'trade_evaluation',
          pair: best.pair,
          spread: best.spreadBps,
          decision: decision.execute ? 'execute' : 'skip',
          confidence: decision.confidence,
          txHash: tradeResult?.txHash || null,
        });
      } else {
        log('main', '📊 No opportunities above threshold');
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
    console.log('\n📋 Session Summary:');
    console.log(`   Actions: ${summary.totalActions}`);
    console.log(`   Trades: ${executor.stats().tradesExecuted}`);
    console.log(`   LLM calls: ${llm.stats().calls} (${llm.stats().tokens} tokens)`);
    console.log(`   Identity: ${summary.erc8004}`);
    process.exit(0);
  }

  // Continuous loop
  log('main', `🔄 Continuous mode — scanning every ${config.scan.intervalMs / 1000}s`);
  setInterval(cycle, config.scan.intervalMs);
}

// ── Go ──
main().catch(err => {
  logError('main', `Fatal: ${err.message}`);
  process.exit(1);
});
