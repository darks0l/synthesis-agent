#!/usr/bin/env node
// ── Synthesis Agent ─────────────────────────────────────────────────
// Autonomous agent economy orchestrator.
// Built for The Synthesis Hackathon (March 2026).
//
// What it does:
//   1. Wakes up with ERC-8004 on-chain identity
//   2. Checks wallet balances
//   3. Scans for cross-DEX arbitrage opportunities (Uniswap V3 + Aerodrome)
//   4. Routes evaluation through multi-provider LLM cascade
//   5. Outsources skills via ERC-8183 agentic commerce
//   6. Executes trades via on-chain spending policy
//   7. Manages concentrated liquidity positions (Uniswap V3)
//   8. Communicates with other agents via AgentMail
//   9. Converts profits to prepaid cards
//  10. Logs every action as a traceable receipt
//
// Usage:
//   synthesis-agent              # live mode (continuous)
//   synthesis-agent --dry-run    # scan + evaluate without executing
//   synthesis-agent --once       # single cycle, then exit
//   synthesis-agent --verbose    # extra logging
//   synthesis-agent --mint-lp <ETH>  # mint a new LP position
//   synthesis-agent --help       # show help
//   synthesis-agent --version    # show version
//
// Built by DARKSOL 🌑

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
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
import { LiquidityManager } from './liquidity.js';
import { CardManager } from './cards.js';
import { MailManager } from './mail.js';
import { VirtualsACP } from './virtuals.js';
import { TAEngine } from './ta.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── CLI ──
function showHelp() {
  console.log(`
  🌑 Synthesis Agent — Autonomous Agent Economy Orchestrator

  USAGE
    synthesis-agent [options]

  OPTIONS
    --dry-run       Scan and evaluate without executing trades
    --once          Run a single cycle, then exit
    --verbose, -v   Extra logging output
    --mint-lp <amt> Mint a new LP position with <amt> ETH
    --help, -h      Show this help message
    --version       Show version

  ENVIRONMENT
    BASE_RPC              Base chain RPC URL (default: https://mainnet.base.org)
    BANKR_API_KEY         Bankr LLM Gateway key (primary AI provider)
    OPENAI_API_KEY        OpenAI API key (fallback)
    ANTHROPIC_API_KEY     Anthropic API key (fallback)
    OPENROUTER_API_KEY    OpenRouter API key (fallback)
    OLLAMA_URL            Local Ollama URL (fallback, free)
    UNISWAP_API_KEY       Uniswap Developer Platform API key
    AGENTMAIL_API_KEY     AgentMail API key for inter-agent communication
    AGENTMAIL_INBOX       AgentMail inbox address (auto-created if unset)
    VIRTUALS_SESSION_KEY_ID  Virtuals ACP session entity key (optional)
    VIRTUALS_AGENT_WALLET    Virtuals agent wallet override (optional)
    MAX_PER_TX            Max USDC per swap (default: 2.0)
    MAX_DAILY             Max USDC per day (default: 20.0)
    SCAN_INTERVAL         Scan interval in ms (default: 60000)
    KEYS_DIR              Path to .keys directory
    SPENDING_POLICY       On-chain AgentSpendingPolicy contract address
    SYNTHESIS_JOBS_ADDRESS  ERC-8183 SynthesisJobs contract address
    CARDS_API             Cards API URL

  CONFIG FILES
    .env                  Environment variables (loaded automatically)
    .keys/                API keys directory (bankr-api-key.txt, etc.)

  ON-CHAIN CONTRACTS (Base)
    ERC-8004 Identity     Verified agent identity
    SynthesisJobs         ERC-8183 agentic commerce escrow
    AgentSpendingPolicy   On-chain per-tx/daily limits + approved targets

  DOCS
    https://github.com/darks0l/synthesis-agent
`);
}

function showVersion() {
  try {
    const pkg = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf8'));
    console.log(`synthesis-agent v${pkg.version}`);
  } catch {
    console.log('synthesis-agent (unknown version)');
  }
}

if (process.argv.includes('--help') || process.argv.includes('-h')) {
  showHelp();
  process.exit(0);
}
if (process.argv.includes('--version')) {
  showVersion();
  process.exit(0);
}

// ── Load wallet once ──
function loadWallet(provider) {
  try {
    const raw = readFileSync(
      process.env.WALLET_KEY_FILE || join(__dirname, '..', '..', '.keys', 'base-deployer.txt'),
      'utf8'
    );
    const match = raw.match(/(?:DEPLOYER_KEY=)?(0x[a-fA-F0-9]{64})/);
    if (!match) throw new Error('No valid private key found in key file');
    return new ethers.Wallet(match[1], provider);
  } catch (err) {
    logError('main', `Cannot load wallet: ${err.message}`);
    return null;
  }
}

// ── Banner ──
function banner() {
  let version = '?';
  try {
    const pkg = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf8'));
    version = pkg.version;
  } catch {}

  console.log(`
╔═══════════════════════════════════════════════════╗
║     🌑 SYNTHESIS AGENT — DARKSOL  v${version.padEnd(14)}║
║     Autonomous Agent Economy Orchestrator         ║
║  Identity • TA • LLM • Trading • LP • ACP • Mail • Cards ║
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

  // Load wallet (once, shared across all modules)
  const wallet = loadWallet(provider);

  // Initialize components
  const identity = new AgentIdentity(provider);
  const llm = new LLMGateway();
  const scanner = new Scanner(provider);
  const executor = new Executor(provider);
  const orchestrator = new Orchestrator(provider, config.orchestrator.contractAddress);
  const feedback = new FeedbackLoop();
  const reporter = new Reporter(identity, scanner, executor, llm);
  const cards = new CardManager();
  const mail = new MailManager();

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

  // Initialize cards
  const cardsHealthy = await cards.healthCheck();
  log('main', `💳 Cards API: ${cardsHealthy ? '✓ reachable' : '✗ offline'} (${cards.getStats().apiEndpoint})`);

  // Initialize AgentMail
  const mailReady = await mail.initialize();
  log('main', `📬 AgentMail: ${mailReady ? '✓ ' + mail.inbox : '✗ not configured (set AGENTMAIL_API_KEY)'}`);
  if (mailReady) {
    await mail.publishListing();
  }

  // Initialize Virtuals ACP v2 (optional — cross-posts jobs to Virtuals agent network)
  const virtualsAcp = new VirtualsACP();
  if (wallet) {
    const virtualsOk = await virtualsAcp.init(wallet);
    log('main', `🌐 Virtuals ACP v2: ${virtualsOk ? '✓ connected' : '✗ not configured (optional — set VIRTUALS_SESSION_KEY_ID)'}`);
  } else {
    log('main', '🌐 Virtuals ACP v2: ✗ no wallet loaded');
  }

  // Initialize TA engine
  const ta = new TAEngine();
  log('main', '📊 TA Engine: ✓ initialized (RSI, MACD, Bollinger, Stochastic, ATR, OBV, VWAP, Fibonacci, S/R, Divergence)');

  // Initialize liquidity manager (requires wallet)
  let liquidityMgr = null;
  if (wallet) {
    try {
      liquidityMgr = new LiquidityManager(wallet);
      await liquidityMgr.loadExistingPositions();
      log('main', `💧 Liquidity Manager: ✓ initialized (${liquidityMgr.positions.length} existing position(s))`);
    } catch (err) {
      log('main', `💧 Liquidity Manager: ✗ ${err.message}`);
    }
  } else {
    log('main', '💧 Liquidity Manager: ✗ no wallet loaded');
  }

  // ── Agent Loop ──
  async function cycle() {
    log('main', `═══ Cycle ${reporter.cycleCount + 1} ═══`);

    try {
      // 1. Check AgentMail for incoming messages (job bids, queries)
      if (mail.enabled) {
        const mailResult = await mail.processInLoop();
        if (mailResult.processed > 0) {
          log('main', `📬 Processed ${mailResult.processed} mail message(s)`);

          // Handle job bids — evaluate against our needs
          for (const action of (mailResult.actions || [])) {
            if (action.type === 'job_bid') {
              log('main', `📩 Job bid: #${action.jobId} from ${action.provider} — $${action.bidAmount}`);
              identity.recordReceipt({ type: 'mail_job_bid', ...action });
            }
          }
        }
      }

      // 2. Scan for opportunities
      const opportunities = await scanner.scan();

      // 3. Find best opportunity
      const best = scanner.getBestOpportunity();

      let decision = null;
      let tradeResult = null;

      if (best) {
        // 4. Post ERC-8183 job for trade evaluation (if orchestrator deployed)
        let orchestratorJob = null;
        if (orchestrator.deployed && wallet) {
          orchestratorJob = await orchestrator.postTradeEvalJob(best, wallet);
          if (orchestratorJob) {
            log('main', `🔗 ERC-8183 job #${orchestratorJob.jobId} posted for trade eval`);

            // Notify known providers via AgentMail
            if (mail.enabled) {
              // In production, this would pull from a provider registry
              log('main', '📬 Job posted — awaiting bids via AgentMail');
            }
          }
        }

        // 4b. Cross-post to Virtuals ACP v2 (if enabled)
        if (virtualsAcp.enabled) {
          const virtualsJob = await virtualsAcp.postTradeEvalJob(best);
          if (virtualsJob) {
            log('main', `🌐 Virtuals ACP job posted — cross-network evaluation`);
          }
        }

        // 4c. Run TA analysis to inform LLM decision
        const taResult = await ta.analyze('ethereum');
        if (taResult.signal !== 'insufficient_data') {
          log('main', `📊 TA: ${taResult.signal.toUpperCase()} (${taResult.confidence}% confidence) → ${taResult.recommendation}`);
          best.ta = taResult; // Attach TA context to opportunity for LLM
          best.taContext = ta.formatForLLM(taResult);
        }

        // 5. Ask LLM to evaluate (or use outsourced result when available)
        log('main', `🧠 Evaluating: ${best.pair} (${best.spreadBps}bps spread)`);
        decision = await llm.evaluateOpportunity(best);
        log('main', `Decision: execute=${decision.execute}, confidence=${decision.confidence}%`);

        // 6. If orchestrator job was posted, self-fulfill with our evaluation result
        if (orchestratorJob && config.orchestrator.selfFulfill && wallet) {
          const fulfillResult = await orchestrator.selfFulfill(orchestratorJob.jobId, decision, wallet);

          // Evaluate the outsourced result against our history (feedback loop)
          if (fulfillResult) {
            const evaluation = feedback.evaluateOutsourcedResult(decision, best);
            log('main', `🔄 Feedback: quality=${evaluation.quality}${evaluation.insight ? ` | insight: ${evaluation.insight.substring(0, 60)}` : ''}`);
          }
        }

        // 7. Execute if approved — use adaptive threshold from feedback
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

        // 8. Record trade in feedback loop
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

        // 9. Record receipt
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

      // 10. Check pending ERC-8183 jobs (both SynthesisJobs + Virtuals ACP)
      if (orchestrator.deployed && wallet) {
        const jobResults = await orchestrator.checkJobs(wallet);
        if (jobResults.length > 0) {
          log('main', `🔗 ERC-8183: ${jobResults.length} job(s) updated`);
        }
      }
      if (virtualsAcp.enabled) {
        const vJobs = await virtualsAcp.checkJobs();
        if (vJobs.active > 0 || vJobs.completed > 0) {
          log('main', `🌐 Virtuals ACP: ${vJobs.active} active, ${vJobs.completed} completed`);
        }
      }

      // 11. Liquidity management
      if (liquidityMgr) {
        try {
          const lpStatus = await liquidityMgr.monitorPositions();
          if (lpStatus && lpStatus.length > 0) {
            for (const pos of lpStatus) {
              if (!pos.inRange && wallet) {
                log('main', `🧠 LP position ${pos.tokenId} out of range — evaluating rebalance...`);
                const rebalanceDecision = await llm.evaluateOpportunity({
                  pair: 'WETH/USDC',
                  type: 'rebalance_decision',
                  currentTick: pos.currentTick,
                  tickLower: pos.tickLower,
                  tickUpper: pos.tickUpper,
                  ethPrice: pos.ethPrice,
                  spreadBps: 0,
                  profitBps: 0,
                  profitPercent: '0',
                  gasCost: '0.0001',
                  netProfit: 'unknown',
                });
                if (rebalanceDecision.execute && rebalanceDecision.confidence >= 55) {
                  log('main', `🔄 Rebalancing position ${pos.tokenId}...`);
                  await liquidityMgr.rebalance(pos.tokenId, '0.001');
                } else {
                  log('main', `⏭️ Skipping rebalance (confidence ${rebalanceDecision.confidence}%)`);
                }
              }
            }
          }
          const lpSummary = liquidityMgr.getSummary();
          if (lpSummary.activePositions > 0) {
            log('main', `💧 LP: ${lpSummary.activePositions} position(s), fees: ${lpSummary.feesCollected.weth} WETH + ${lpSummary.feesCollected.usdc} USDC`);
          }
        } catch (err) {
          logError('main', `LP monitor error: ${err.message}`);
        }
      }

      // 12. Card purchase evaluation
      try {
        const cardBalances = await identity.getBalances();
        const cardEval = cards.shouldOrderCard(
          parseFloat(cardBalances.usdc),
          parseFloat(cardBalances.eth)
        );
        if (cardEval.should) {
          log('main', `💳 Card opportunity: ${cardEval.reason}`);
          if (!config.dryRun) {
            const orderResult = await cards.orderCard({
              amount: cardEval.amount,
              crypto: 'USDC',
              network: 'base',
            });
            if (orderResult.success) {
              log('main', `💳 Card ordered! $${cardEval.amount} — ID: ${orderResult.orderId || 'pending'}`);
              identity.recordReceipt({ type: 'card_order', amount: cardEval.amount, orderId: orderResult.orderId });
            } else {
              log('main', `💳 Card order failed: ${orderResult.error}`);
            }
          } else {
            log('main', `💳 [DRY RUN] Would order $${cardEval.amount} card`);
          }
        }
      } catch (err) {
        logError('main', `Card evaluation error: ${err.message}`);
      }

      // 13. Report
      const report = reporter.cycleReport(opportunities, decision, tradeResult);
      console.log('\n' + reporter.formatReport(report) + '\n');

      // Update balances
      const newBalances = await identity.getBalances();
      log('main', `💰 Post-cycle — ETH: ${newBalances.eth} | USDC: ${newBalances.usdc}`);

    } catch (err) {
      logError('main', `Cycle error: ${err.message}`);
    }
  }

  // Mint initial LP position if requested
  if (process.argv.includes('--mint-lp') && liquidityMgr) {
    const idx = process.argv.indexOf('--mint-lp');
    const lpAmount = process.argv[idx + 1] || '0.001';
    log('main', `🏗️ Minting initial LP position with ${lpAmount} ETH...`);
    try {
      const result = await liquidityMgr.mintPosition(lpAmount, 3000);
      log('main', `✅ LP position minted! TokenId: ${result.tokenId || 'pending'} | TX: ${result.txHash}`);
      identity.recordReceipt({ type: 'lp_mint', tokenId: result.tokenId, txHash: result.txHash });
    } catch (err) {
      logError('main', `LP mint failed: ${err.message}`);
    }
  }

  // Run first cycle
  await cycle();

  if (once) {
    log('main', '✓ Single cycle complete. Exiting.');
    const summary = identity.summary();
    const orchStats = orchestrator.stats();
    const fbStats = feedback.stats();
    const mailStats = mail.stats();
    console.log('\n📋 Session Summary:');
    console.log(`   Actions: ${summary.totalActions}`);
    console.log(`   Trades: ${executor.stats().tradesExecuted}`);
    console.log(`   LLM calls: ${llm.stats().calls} (${llm.stats().tokens} tokens)`);
    console.log(`   ERC-8183 jobs: ${orchStats.jobsPosted} posted, ${orchStats.jobsCompleted} completed`);
    console.log(`   Orchestrator spent: $${orchStats.totalSpent} USDC`);
    console.log(`   Feedback: ${fbStats.totalTrades} trades logged, ${fbStats.improvementsAdopted} improvements adopted`);
    console.log(`   Adaptive threshold: ${fbStats.currentMinSpreadBps}bps min spread`);
    if (liquidityMgr) {
      const lpSummary = liquidityMgr.getSummary();
      console.log(`   LP positions: ${lpSummary.activePositions} active, ${lpSummary.totalMinted} minted, ${lpSummary.rebalances} rebalances`);
      console.log(`   LP fees: ${lpSummary.feesCollected.weth} WETH + ${lpSummary.feesCollected.usdc} USDC`);
    }
    const cardStats = cards.getStats();
    console.log(`   Cards: ${cardStats.orderCount} ordered, $${cardStats.totalOrdered} total`);
    console.log(`   Mail: ${mailStats.received} received, ${mailStats.sent} sent`);
    console.log(`   Virtuals ACP: ${virtualsAcp.enabled ? `${virtualsAcp.stats.jobsPosted} posted, ${virtualsAcp.stats.agentsDiscovered} agents discovered` : 'disabled'}`);
    const taSummary = ta.summary();
    console.log(`   TA Engine: ${taSummary.runs} analyses (last: ${taSummary.lastSignal} ${taSummary.lastConfidence}%)`);

    console.log(`   Identity: ${summary.erc8004}`);
    process.exit(0);
  }

  // Continuous loop
  log('main', `🔄 Continuous mode — scanning every ${config.scan.intervalMs / 1000}s`);
  setInterval(() => {
    cycle().catch(err => logError('main', `Cycle error (unhandled): ${err.message}`));
  }, config.scan.intervalMs);
}

// Global safety nets
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
