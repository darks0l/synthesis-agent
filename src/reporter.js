// ── Reporter ────────────────────────────────────────────────────────
// Generates human-readable reports of agent activity.
// Outputs to console, log files, and can format for Discord.

import { config } from './config.js';
import { log } from './logger.js';

export class Reporter {
  constructor(identity, scanner, executor, llm) {
    this.identity = identity;
    this.scanner = scanner;
    this.executor = executor;
    this.llm = llm;
    this.cycleCount = 0;
  }

  /** Generate a cycle report */
  cycleReport(opportunities, decision, tradeResult) {
    this.cycleCount++;
    const balances = this.identity.getBalances?.() || {};

    return {
      cycle: this.cycleCount,
      timestamp: new Date().toISOString(),
      agent: config.agentAddress,
      opportunities: opportunities.length,
      bestOpportunity: opportunities[0] || null,
      decision,
      tradeResult,
      llmStats: this.llm.stats(),
      executorStats: this.executor.stats(),
    };
  }

  /** Format report for console/Discord */
  formatReport(report) {
    const lines = [
      `🌑 **Synthesis Agent — Cycle ${report.cycle}**`,
      `⏰ ${report.timestamp}`,
      `🆔 \`${config.agentAddress}\``,
      '',
      `**🔍 Scan Results:**`,
      `- Pairs scanned: ${config.scan.pairs.length}`,
      `- Opportunities found: ${report.opportunities}`,
    ];

    if (report.bestOpportunity) {
      const opp = report.bestOpportunity;
      lines.push(
        `- Best: ${opp.pair} — ${opp.spreadBps}bps spread (${opp.betterDex} better)`,
      );
    }

    if (report.decision) {
      lines.push(
        '',
        `**🧠 AI Decision:**`,
        `- Execute: ${report.decision.execute ? '✅ YES' : '❌ NO'}`,
        `- Confidence: ${report.decision.confidence}%`,
        `- Reasoning: ${report.decision.reasoning}`,
      );
    }

    if (report.tradeResult) {
      const t = report.tradeResult;
      lines.push(
        '',
        `**💱 Trade:**`,
        t.success
          ? `- ✅ ${t.pair} — ${t.amountIn} swapped`
          : `- ❌ Blocked: ${t.reason}`,
      );
      if (t.txHash && !t.dryRun) {
        lines.push(`- TX: ${t.explorer}`);
      }
      if (t.dryRun) {
        lines.push(`- 🏜️ (dry run — no on-chain tx)`);
      }
    }

    lines.push(
      '',
      `**📊 Stats:**`,
      `- LLM calls: ${report.llmStats.calls} (${report.llmStats.tokens} tokens)`,
      `- Trades executed: ${report.executorStats.tradesExecuted}`,
      `- Daily spent: $${report.executorStats.dailySpent.toFixed(2)} / $${config.spending.maxDaily}`,
    );

    return lines.join('\n');
  }

  /** One-line status */
  statusLine() {
    const stats = this.executor.stats();
    return `Cycle ${this.cycleCount} | ${stats.tradesExecuted} trades | $${stats.dailySpent.toFixed(2)} spent | ${this.llm.stats().calls} LLM calls`;
  }
}
