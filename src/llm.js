// ── LLM Gateway ─────────────────────────────────────────────────────
// Multi-provider LLM routing with automatic fallback.
// Priority: Bankr → OpenAI → Anthropic → OpenRouter → Ollama → Heuristic
//
// Bankr is the primary provider — it closes the economic loop
// (trade profits → fund Bankr wallet → pay for inference → smarter trades).
// Other providers are escape hatches for users who bring their own keys.

import { config } from './config.js';
import { log, logError } from './logger.js';

/** Provider definitions — tried in order */
const PROVIDERS = [
  {
    name: 'bankr',
    key: () => config.llm.bankrApiKey,
    gateway: () => config.llm.bankrGateway,
    model: () => config.llm.models.bankr,
    format: 'openai', // OpenAI-compatible
  },
  {
    name: 'openai',
    key: () => config.llm.openaiApiKey,
    gateway: () => config.llm.openaiGateway,
    model: () => config.llm.models.openai,
    format: 'openai',
  },
  {
    name: 'anthropic',
    key: () => config.llm.anthropicApiKey,
    gateway: () => config.llm.anthropicGateway,
    model: () => config.llm.models.anthropic,
    format: 'anthropic',
  },
  {
    name: 'openrouter',
    key: () => config.llm.openrouterApiKey,
    gateway: () => config.llm.openrouterGateway,
    model: () => config.llm.models.openrouter,
    format: 'openai',
  },
  {
    name: 'ollama',
    key: () => 'local', // always available if Ollama is running
    gateway: () => config.llm.ollamaUrl,
    model: () => config.llm.ollamaModel,
    format: 'ollama',
  },
];

export class LLMGateway {
  constructor() {
    this.totalCalls = 0;
    this.totalTokens = 0;
    this.providerUsage = {}; // { providerName: { calls, tokens } }
    this._activeProvider = null;
    this._detectProvider();
  }

  /** Find the first available provider */
  _detectProvider() {
    for (const p of PROVIDERS) {
      const key = p.key();
      if (key) {
        this._activeProvider = p;
        log('llm', `Provider: ${p.name} (${p.model()})`);
        return;
      }
    }
    this._activeProvider = null;
    log('llm', 'No LLM provider configured — using heuristic fallback');
  }

  get available() {
    return !!this._activeProvider;
  }

  get providerName() {
    return this._activeProvider?.name || 'heuristic';
  }

  /**
   * Send a prompt to the active LLM provider with automatic fallback.
   * @param {string} prompt
   * @param {object} opts - { model, maxTokens, temperature }
   * @returns {string} The response text
   */
  async ask(prompt, opts = {}) {
    // Try each provider in priority order starting from the active one
    const startIdx = this._activeProvider
      ? PROVIDERS.indexOf(this._activeProvider)
      : PROVIDERS.length;

    for (let i = startIdx; i < PROVIDERS.length; i++) {
      const provider = PROVIDERS[i];
      const key = provider.key();
      if (!key) continue;

      try {
        const result = await this._callProvider(provider, prompt, opts);
        if (result !== null) return result;
      } catch (err) {
        logError('llm', `${provider.name} failed: ${err.message}`);
        // Fall through to next provider
      }
    }

    // All providers failed — use heuristic
    log('llm', 'All providers exhausted — using heuristic fallback');
    return this._fallbackAnalysis(prompt);
  }

  /** Call a specific provider */
  async _callProvider(provider, prompt, opts) {
    const model = opts.model || provider.model();
    const maxTokens = opts.maxTokens || 500;
    const temperature = opts.temperature ?? 0.3;

    if (provider.format === 'anthropic') {
      return this._callAnthropic(provider, prompt, model, maxTokens, temperature);
    }

    if (provider.format === 'ollama') {
      return this._callOllama(provider, prompt, model, maxTokens, temperature);
    }

    // OpenAI-compatible format (Bankr, OpenAI, OpenRouter)
    return this._callOpenAI(provider, prompt, model, maxTokens, temperature);
  }

  /** OpenAI-compatible API (Bankr, OpenAI, OpenRouter) */
  async _callOpenAI(provider, prompt, model, maxTokens, temperature) {
    const res = await fetch(`${provider.gateway()}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${provider.key()}`,
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
      const body = await res.text().catch(() => '');
      throw new Error(`${provider.name} returned ${res.status}: ${body.slice(0, 200)}`);
    }

    const data = await res.json();
    const text = data.choices?.[0]?.message?.content || '';
    const tokens = data.usage?.total_tokens || 0;

    this._trackUsage(provider.name, tokens);
    log('llm', `✓ ${provider.name}/${model} — ${tokens} tokens`);

    return text;
  }

  /** Anthropic Messages API */
  async _callAnthropic(provider, prompt, model, maxTokens, temperature) {
    const res = await fetch(`${provider.gateway()}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': provider.key(),
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        temperature,
        system: 'You are an autonomous trading agent analyst. Be concise. Respond with structured JSON when asked.',
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`anthropic returned ${res.status}: ${body.slice(0, 200)}`);
    }

    const data = await res.json();
    const text = data.content?.[0]?.text || '';
    const tokens = (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0);

    this._trackUsage('anthropic', tokens);
    log('llm', `✓ anthropic/${model} — ${tokens} tokens`);

    return text;
  }

  /** Local Ollama */
  async _callOllama(provider, prompt, model, maxTokens, temperature) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30_000); // 30s timeout for local

    try {
      const res = await fetch(`${provider.gateway()}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: 'You are an autonomous trading agent analyst. Be concise. Respond with structured JSON when asked.' },
            { role: 'user', content: prompt },
          ],
          stream: false,
          options: { temperature, num_predict: maxTokens },
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        throw new Error(`ollama returned ${res.status}`);
      }

      const data = await res.json();
      const text = data.message?.content || '';
      const tokens = (data.eval_count || 0) + (data.prompt_eval_count || 0);

      this._trackUsage('ollama', tokens);
      log('llm', `✓ ollama/${model} — ${tokens} tokens (local)`);

      return text;
    } finally {
      clearTimeout(timeout);
    }
  }

  /** Track usage per provider */
  _trackUsage(name, tokens) {
    if (!this.providerUsage[name]) {
      this.providerUsage[name] = { calls: 0, tokens: 0 };
    }
    this.providerUsage[name].calls++;
    this.providerUsage[name].tokens += tokens;
    this.totalCalls++;
    this.totalTokens += tokens;
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
      // Strip markdown code fences if present
      const cleaned = response.replace(/```(?:json)?\s*/g, '').replace(/```/g, '').trim();
      const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          execute: Boolean(parsed.execute),
          confidence: Number(parsed.confidence) || 50,
          reasoning: String(parsed.reasoning || 'LLM evaluation'),
        };
      }
    } catch {}

    // Try to extract intent from natural language response
    const lower = response.toLowerCase();
    const shouldExecute = lower.includes('yes') || lower.includes('execute') || lower.includes('recommend');
    const shouldSkip = lower.includes('no') || lower.includes('skip') || lower.includes('avoid') || lower.includes('not worth');
    if (shouldSkip) return { execute: false, confidence: 40, reasoning: `LLM advised against: ${response.slice(0, 120)}` };
    if (shouldExecute) return { execute: true, confidence: 55, reasoning: `LLM recommended: ${response.slice(0, 120)}` };

    return { execute: false, confidence: 20, reasoning: 'Could not parse LLM response' };
  }

  /** Heuristic fallback when no LLM available */
  _fallbackAnalysis(prompt) {
    const bpsMatch = prompt.match(/(\d+)\s*bps/);
    const spreadBps = bpsMatch ? parseInt(bpsMatch[1]) : 0;

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
    return {
      provider: this.providerName,
      calls: this.totalCalls,
      tokens: this.totalTokens,
      breakdown: this.providerUsage,
    };
  }
}
