// ── Feedback Loop ───────────────────────────────────────────────────
// Evaluates outsourced job results against the agent's own trade history.
// Learns from outcomes: if an outsourced evaluation led to a better trade
// than the agent's own heuristic would have, adopt the insight.
//
// This is the "always improve" mechanism — the agent validates every
// external result against its own logs, and refines its strategy.
//
// Built for The Synthesis Hackathon 🌑

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { log, logWarn } from './logger.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const HISTORY_PATH = join(__dirname, '..', 'data', 'trade-history.json');
const LEARNINGS_PATH = join(__dirname, '..', 'data', 'learnings.json');

export class FeedbackLoop {
  constructor() {
    this.tradeHistory = this._loadJSON(HISTORY_PATH, []);
    this.learnings = this._loadJSON(LEARNINGS_PATH, {
      minSpreadBps: 40,           // current heuristic threshold
      confidenceBoost: 0,         // adjustment from outsourced evaluations
      providerScores: {},         // address → { good: n, bad: n }
      pairInsights: {},           // pair → { avgSpread, winRate, lastOutcome }
      totalEvaluations: 0,
      improvementsAdopted: 0,
    });
  }

  /**
   * Record a trade outcome for future evaluation.
   */
  recordTrade(trade) {
    const record = {
      timestamp: new Date().toISOString(),
      pair: trade.pair,
      spreadBps: trade.spreadBps,
      decision: trade.decision,         // 'execute' or 'skip'
      confidence: trade.confidence,
      txHash: trade.txHash || null,
      amountIn: trade.amountIn,
      amountOut: trade.amountOut || null,
      source: trade.source || 'self',    // 'self' or provider address
      erc8183JobId: trade.erc8183JobId || null,
      gasUsed: trade.gasUsed || null,
      profitable: trade.profitable ?? null,  // set post-trade when we know
    };

    this.tradeHistory.push(record);

    // Update pair insights
    this._updatePairInsights(record);

    // Keep last 500 trades
    if (this.tradeHistory.length > 500) {
      this.tradeHistory = this.tradeHistory.slice(-500);
    }

    this._save();
    return record;
  }

  /**
   * Evaluate an outsourced result against our own logs.
   * Returns: { accept: boolean, quality: string, insight: string | null }
   */
  evaluateOutsourcedResult(jobResult, opportunity) {
    this.learnings.totalEvaluations++;

    const pair = opportunity.pair;
    const spreadBps = opportunity.spreadBps;
    const pairData = this.learnings.pairInsights[pair];

    // Parse the provider's recommendation
    let providerDecision;
    try {
      providerDecision = typeof jobResult === 'string' ? JSON.parse(jobResult) : jobResult;
    } catch {
      log('feedback', '⚠ Could not parse provider result — rejecting');
      return { accept: false, quality: 'unparseable', insight: null };
    }

    // ── Validation checks ──

    // 1. Does the provider's response have required fields?
    if (typeof providerDecision.execute !== 'boolean' ||
        typeof providerDecision.confidence !== 'number') {
      return { accept: false, quality: 'malformed', insight: null };
    }

    // 2. Compare against historical performance for this pair
    let historicalWinRate = null;
    if (pairData && pairData.trades > 3) {
      historicalWinRate = pairData.wins / pairData.trades;

      // If provider says execute but this pair historically loses at this spread
      if (providerDecision.execute && pairData.avgSpread > spreadBps && historicalWinRate < 0.4) {
        log('feedback', `📊 Provider says execute, but ${pair} has ${(historicalWinRate * 100).toFixed(0)}% win rate at similar spreads — skeptical`);
        return {
          accept: false,
          quality: 'contradicts_history',
          insight: `${pair} win rate only ${(historicalWinRate * 100).toFixed(0)}% — provider too optimistic`,
        };
      }

      // If provider says skip but this pair historically wins at this spread
      if (!providerDecision.execute && historicalWinRate > 0.7 && spreadBps >= this.learnings.minSpreadBps) {
        log('feedback', `📊 Provider says skip, but ${pair} has ${(historicalWinRate * 100).toFixed(0)}% win rate — overriding with our data`);
        return {
          accept: false,
          quality: 'too_conservative',
          insight: `${pair} historically profitable at ${spreadBps}bps — provider too cautious`,
        };
      }
    }

    // 3. Check if provider's confidence aligns with spread quality
    const expectedConfidence = this._expectedConfidence(spreadBps);
    const confidenceDelta = Math.abs(providerDecision.confidence - expectedConfidence);

    if (confidenceDelta > 30) {
      log('feedback', `📊 Provider confidence ${providerDecision.confidence}% vs expected ${expectedConfidence}% — large delta`);
      // Don't reject, but flag
    }

    // 4. Check if provider offers novel insight we don't have
    let insight = null;
    if (providerDecision.reasoning) {
      // Look for keywords that indicate info we lack
      const novelTerms = ['mempool', 'sandwich', 'liquidity', 'whale', 'volume', 'trend', 'correlation'];
      const hasNovelInfo = novelTerms.some(t =>
        providerDecision.reasoning.toLowerCase().includes(t)
      );

      if (hasNovelInfo) {
        insight = providerDecision.reasoning;
        log('feedback', `💡 Provider offered novel insight: "${insight.substring(0, 80)}..."`);
      }
    }

    // 5. If provider's confidence is higher than our heuristic AND they provide reasoning
    if (providerDecision.confidence > expectedConfidence && providerDecision.reasoning) {
      this.learnings.improvementsAdopted++;
      log('feedback', `🧠 Adopting provider insight — their confidence ${providerDecision.confidence}% > our estimate ${expectedConfidence}%`);

      // Micro-adjust our spread threshold based on provider feedback
      if (providerDecision.execute && spreadBps < this.learnings.minSpreadBps) {
        const newThreshold = Math.max(20, this.learnings.minSpreadBps - 2);
        log('feedback', `📈 Adjusting minSpreadBps: ${this.learnings.minSpreadBps} → ${newThreshold}`);
        this.learnings.minSpreadBps = newThreshold;
      }
    }

    this._save();

    return {
      accept: true,
      quality: insight ? 'good_with_insight' : 'acceptable',
      insight,
      providerConfidence: providerDecision.confidence,
      ourConfidence: expectedConfidence,
    };
  }

  /**
   * After a trade executes, mark it profitable or not.
   * This feeds back into pair insights and heuristic adjustments.
   */
  recordOutcome(txHash, profitable) {
    const trade = this.tradeHistory.find(t => t.txHash === txHash);
    if (!trade) return;

    trade.profitable = profitable;

    // Update pair insights
    const pair = trade.pair;
    if (!this.learnings.pairInsights[pair]) {
      this.learnings.pairInsights[pair] = { trades: 0, wins: 0, avgSpread: 0, lastOutcome: null };
    }
    const pi = this.learnings.pairInsights[pair];
    pi.lastOutcome = profitable ? 'win' : 'loss';
    if (profitable) pi.wins++;

    // If we're losing too often on a pair, raise the threshold
    if (pi.trades > 5 && pi.wins / pi.trades < 0.3) {
      const oldThreshold = this.learnings.minSpreadBps;
      this.learnings.minSpreadBps = Math.min(100, this.learnings.minSpreadBps + 5);
      logWarn('feedback', `📉 ${pair} win rate below 30% — raising minSpreadBps: ${oldThreshold} → ${this.learnings.minSpreadBps}`);
    }

    // If we're winning consistently, we can be slightly more aggressive
    if (pi.trades > 10 && pi.wins / pi.trades > 0.8) {
      const oldThreshold = this.learnings.minSpreadBps;
      this.learnings.minSpreadBps = Math.max(15, this.learnings.minSpreadBps - 2);
      log('feedback', `📈 ${pair} win rate above 80% — lowering minSpreadBps: ${oldThreshold} → ${this.learnings.minSpreadBps}`);
    }

    this._save();
  }

  /**
   * Score a provider based on job outcome.
   */
  scoreProvider(address, good) {
    if (!this.learnings.providerScores[address]) {
      this.learnings.providerScores[address] = { good: 0, bad: 0 };
    }
    if (good) {
      this.learnings.providerScores[address].good++;
    } else {
      this.learnings.providerScores[address].bad++;
    }
    this._save();
  }

  /**
   * Get the current effective confidence for a spread level.
   * This is the agent's own heuristic, refined over time by feedback.
   */
  _expectedConfidence(spreadBps) {
    const base = this.learnings.confidenceBoost;
    if (spreadBps >= 100) return Math.min(95, 80 + base);
    if (spreadBps >= 60)  return Math.min(90, 70 + base);
    if (spreadBps >= 40)  return Math.min(85, 65 + base);
    if (spreadBps >= 30)  return Math.min(75, 55 + base);
    return Math.min(60, 40 + base);
  }

  /**
   * Get the current adaptive spread threshold.
   */
  get minSpreadBps() {
    return this.learnings.minSpreadBps;
  }

  _updatePairInsights(record) {
    const pair = record.pair;
    if (!this.learnings.pairInsights[pair]) {
      this.learnings.pairInsights[pair] = { trades: 0, wins: 0, avgSpread: 0, lastOutcome: null };
    }
    const pi = this.learnings.pairInsights[pair];
    pi.trades++;
    pi.avgSpread = ((pi.avgSpread * (pi.trades - 1)) + (record.spreadBps || 0)) / pi.trades;
  }

  _loadJSON(path, fallback) {
    try {
      if (existsSync(path)) {
        return JSON.parse(readFileSync(path, 'utf8'));
      }
    } catch {}
    return fallback;
  }

  _save() {
    try {
      mkdirSync(join(__dirname, '..', 'data'), { recursive: true });
      writeFileSync(HISTORY_PATH, JSON.stringify(this.tradeHistory, null, 2));
      writeFileSync(LEARNINGS_PATH, JSON.stringify(this.learnings, null, 2));
    } catch {}
  }

  stats() {
    return {
      totalTrades: this.tradeHistory.length,
      totalEvaluations: this.learnings.totalEvaluations,
      improvementsAdopted: this.learnings.improvementsAdopted,
      currentMinSpreadBps: this.learnings.minSpreadBps,
      pairInsights: this.learnings.pairInsights,
      providerScores: this.learnings.providerScores,
    };
  }
}
