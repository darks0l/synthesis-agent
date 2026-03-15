// ── LLM Gateway ─────────────────────────────────────────────────────
// Routes inference through Bankr LLM Gateway.
// Uses cheap models for routine analysis, better models for decisions.

import { config } from './config.js';
import { log, logError } from './logger.js';

export class LLMGateway {
  constructor() {
    this.apiKey = config.llm.bankrApiKey;
    this.gateway = config.llm.bankrGateway;
    this.totalCalls = 0;
    this.totalTokens = 0;
  }

  get available() {
    return !!this.apiKey;
  }

  /**
   * Send a prompt to the LLM gateway.
   * @param {string} prompt - The prompt to send
   * @param {object} opts - { model, maxTokens, temperature }
   * @returns {string} The response text
   */
  async ask(prompt, opts = {}) {
    const model = opts.model || config.llm.cheapModel;
    const maxTokens = opts.maxTokens || 500;
    const temperature = opts.temperature ?? 0.3;

    if (!this.apiKey) {
      log('llm', 'No Bankr API key — using fallback analysis');
      return this._fallbackAnalysis(prompt);
    }

    try {
      const res = await fetch(`${this.gateway}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: 'You are an autonomous trading agent analyst. Be concise. Respond with structured JSON when asked.' },
            { role: 'user', content: prompt },
          ],
          max_tokens: maxTokens,
          temperature,
        }),
      });

      if (!res.ok) {
        throw new Error(`Gateway returned ${res.status}: ${await res.text()}`);
      }

      const data = await res.json();
      const text = data.choices?.[0]?.message?.content || '';
      const tokens = data.usage?.total_tokens || 0;

      this.totalCalls++;
      this.totalTokens += tokens;
      log('llm', `✓ ${model} — ${tokens} tokens`);

      return text;
    } catch (err) {
      logError('llm', `Gateway error: ${err.message}`);
      return this._fallbackAnalysis(prompt);
    }
  }

  /** Evaluate a trading opportunity */
  async evaluateOpportunity(opportunity) {
    const prompt = `Evaluate this trading opportunity on Base (Ethereum L2).
Return ONLY valid JSON with fields: execute (boolean), confidence (0-100), reasoning (string).

Opportunity:
- Pair: ${opportunity.tokenIn}/${opportunity.tokenOut}
- Estimated profit: ${opportunity.profitBps} bps (${opportunity.profitPercent}%)
- Gas cost estimate: ${opportunity.gasCost} ETH
- Net profit after gas: ${opportunity.netProfit}
- Current market conditions: ${opportunity.conditions || 'normal'}

Consider: is the profit worth the gas? Is the spread suspicious? Would you execute?`;

    const response = await this.ask(prompt);
    try {
      // Try to parse JSON from the response
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    } catch {}

    // Fallback: conservative
    return { execute: false, confidence: 20, reasoning: 'Could not parse LLM response' };
  }

  /** Heuristic fallback when no LLM available — uses spread data to decide */
  _fallbackAnalysis(prompt) {
    // Extract spread from prompt if possible
    const bpsMatch = prompt.match(/(\d+)\s*bps/);
    const spreadBps = bpsMatch ? parseInt(bpsMatch[1]) : 0;

    // If spread is decent (>= 40bps), approve with moderate confidence
    if (spreadBps >= 40) {
      return JSON.stringify({
        execute: true,
        confidence: 65,
        reasoning: `Fallback heuristic: ${spreadBps}bps spread is above 40bps threshold. Small position approved.`,
      });
    }

    return JSON.stringify({
      execute: false,
      confidence: 40,
      reasoning: `Fallback heuristic: ${spreadBps}bps spread is below 40bps threshold. Skipping.`,
    });
  }

  stats() {
    return { calls: this.totalCalls, tokens: this.totalTokens };
  }
}
