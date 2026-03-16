// ── AgentMail Module ────────────────────────────────────────────────
// Inter-agent communication via AgentMail.
// Enables the agent to:
//   - Receive ERC-8183 job bids from other agents
//   - Send job results and status updates
//   - Publish a service listing ("I do TradeEval for $0.05 USDC")
//   - Coordinate with agents that don't share an on-chain registry
//
// AgentMail acts as the off-chain coordination layer alongside
// on-chain escrow (ERC-8183) and payment (USDC).
//
// API: https://api.agentmail.to/v1
// Docs: https://agentmail.to
// ────────────────────────────────────────────────────────────────────

import { config } from './config.js';
import { log, logError, logWarn } from './logger.js';

const AGENTMAIL_API = 'https://api.agentmail.to/v1';

export class MailManager {
  constructor() {
    this.apiKey = config.mail?.apiKey || null;
    this.inbox = config.mail?.inbox || null;
    this.enabled = !!(this.apiKey && this.inbox);
    this.receivedMessages = [];
    this.sentMessages = [];
    this.lastCheckTime = 0;

    // Service listing (published so other agents know what we offer)
    this.serviceListing = {
      agent: config.agentAddress,
      identity: config.erc8004TxHash,
      services: [
        {
          skill: 'TradeEval',
          description: 'Cross-DEX arbitrage evaluation on Base (Uniswap V3 + Aerodrome)',
          price: '$0.05 USDC',
          chain: 'base',
          responseTime: '< 60s',
        },
        {
          skill: 'MarketScan',
          description: 'Real-time price quotes from Uniswap V3, Aerodrome, and Uniswap API',
          price: '$0.02 USDC',
          chain: 'base',
          responseTime: '< 30s',
        },
      ],
      erc8183Contract: config.orchestrator?.contractAddress || null,
      contact: null, // set to inbox address once registered
    };
  }

  // ── Initialize: ensure we have an inbox ──
  async initialize() {
    if (!this.apiKey) {
      logWarn('mail', 'No AgentMail API key configured — mail disabled');
      return false;
    }

    // If no inbox configured, try to create one
    if (!this.inbox) {
      try {
        const inbox = await this._createInbox();
        if (inbox) {
          this.inbox = inbox;
          this.enabled = true;
          this.serviceListing.contact = inbox;
          log('mail', `📬 Inbox created: ${inbox}`);
        }
      } catch (err) {
        logError('mail', `Failed to create inbox: ${err.message}`);
        return false;
      }
    } else {
      this.serviceListing.contact = this.inbox;
      log('mail', `📬 Inbox configured: ${this.inbox}`);
    }

    return this.enabled;
  }

  // ── Create a new AgentMail inbox ──
  async _createInbox() {
    try {
      const resp = await fetch(`${AGENTMAIL_API}/inboxes`, {
        method: 'POST',
        headers: this._headers(),
        body: JSON.stringify({
          name: `synthesis-agent-${config.agentAddress.slice(0, 8)}`,
        }),
      });

      if (!resp.ok) {
        const body = await resp.text().catch(() => '');
        logWarn('mail', `Create inbox failed (${resp.status}): ${body.slice(0, 200)}`);
        return null;
      }

      const data = await resp.json();
      return data.address || data.inbox || data.email || null;
    } catch (err) {
      logError('mail', `Create inbox error: ${err.message}`);
      return null;
    }
  }

  // ── Check inbox for new messages (job bids, results, queries) ──
  async checkInbox() {
    if (!this.enabled) return [];

    try {
      const resp = await fetch(`${AGENTMAIL_API}/inboxes/${encodeURIComponent(this.inbox)}/messages`, {
        headers: this._headers(),
      });

      if (!resp.ok) {
        logWarn('mail', `Check inbox failed (${resp.status})`);
        return [];
      }

      const data = await resp.json();
      const messages = data.messages || data.data || [];

      // Filter to new messages since last check
      const newMessages = messages.filter(m => {
        const msgTime = new Date(m.createdAt || m.timestamp || 0).getTime();
        return msgTime > this.lastCheckTime;
      });

      if (newMessages.length > 0) {
        log('mail', `📬 ${newMessages.length} new message(s) received`);
        this.receivedMessages.push(...newMessages);
      }

      this.lastCheckTime = Date.now();
      return newMessages;
    } catch (err) {
      logWarn('mail', `Inbox check error: ${err.message}`);
      return [];
    }
  }

  // ── Process incoming messages (extract job bids, queries) ──
  processMessages(messages) {
    const actions = [];

    for (const msg of messages) {
      const body = msg.body || msg.text || msg.content || '';
      let parsed = null;

      // Try to parse as structured agent message
      try {
        parsed = JSON.parse(body);
      } catch {
        // Plain text message — treat as query
        parsed = { type: 'query', content: body };
      }

      if (parsed.type === 'job_bid') {
        // Another agent is bidding on one of our ERC-8183 jobs
        actions.push({
          type: 'job_bid',
          jobId: parsed.jobId,
          bidAmount: parsed.bidAmount,
          provider: parsed.provider || msg.from,
          qualifications: parsed.qualifications || null,
          messageId: msg.id,
        });
        log('mail', `📩 Job bid received: Job #${parsed.jobId} from ${msg.from} — $${parsed.bidAmount}`);
      } else if (parsed.type === 'job_result') {
        // Provider delivering results for a job
        actions.push({
          type: 'job_result',
          jobId: parsed.jobId,
          result: parsed.result,
          deliverable: parsed.deliverable,
          provider: msg.from,
          messageId: msg.id,
        });
        log('mail', `📩 Job result received: Job #${parsed.jobId} from ${msg.from}`);
      } else if (parsed.type === 'service_query') {
        // Another agent asking about our services
        actions.push({
          type: 'service_query',
          from: msg.from,
          query: parsed.query || parsed.content,
          messageId: msg.id,
        });
        log('mail', `📩 Service query from ${msg.from}`);
      } else {
        // General message
        actions.push({
          type: 'message',
          from: msg.from,
          content: body,
          messageId: msg.id,
        });
      }
    }

    return actions;
  }

  // ── Send a message to another agent ──
  async send(to, subject, body) {
    if (!this.enabled) {
      logWarn('mail', 'Mail not enabled — cannot send');
      return null;
    }

    try {
      const resp = await fetch(`${AGENTMAIL_API}/messages`, {
        method: 'POST',
        headers: this._headers(),
        body: JSON.stringify({
          from: this.inbox,
          to,
          subject,
          body: typeof body === 'string' ? body : JSON.stringify(body),
        }),
      });

      if (!resp.ok) {
        const errBody = await resp.text().catch(() => '');
        logWarn('mail', `Send failed (${resp.status}): ${errBody.slice(0, 200)}`);
        return null;
      }

      const result = await resp.json();
      this.sentMessages.push({
        to,
        subject,
        timestamp: Date.now(),
        messageId: result.id || result.messageId,
      });

      log('mail', `📤 Sent to ${to}: "${subject}"`);
      return result;
    } catch (err) {
      logError('mail', `Send error: ${err.message}`);
      return null;
    }
  }

  // ── Notify a provider about a new ERC-8183 job opportunity ──
  async notifyJobPosted(providerMail, job) {
    return this.send(providerMail, `Job Opportunity: ${job.skillType}`, {
      type: 'job_opportunity',
      jobId: job.jobId,
      skillType: job.skillType,
      budget: job.budget,
      description: job.description,
      contract: config.orchestrator?.contractAddress,
      chain: config.chain.name,
      deadline: job.expiresAt,
      client: config.agentAddress,
      identity: config.erc8004TxHash,
    });
  }

  // ── Send job results back to a client ──
  async sendJobResult(clientMail, jobId, result) {
    return this.send(clientMail, `Job #${jobId} — Results Delivered`, {
      type: 'job_result',
      jobId,
      result,
      provider: config.agentAddress,
      deliveredAt: new Date().toISOString(),
    });
  }

  // ── Respond to a service query with our listing ──
  async respondToQuery(requesterMail, messageId) {
    return this.send(requesterMail, 'Service Listing — Synthesis Agent', {
      type: 'service_listing',
      ...this.serviceListing,
      respondingTo: messageId,
    });
  }

  // ── Publish service listing (broadcast to known directories) ──
  async publishListing() {
    if (!this.enabled) return null;

    const listing = {
      ...this.serviceListing,
      publishedAt: new Date().toISOString(),
    };

    log('mail', '📢 Publishing service listing...');
    log('mail', `   Services: ${listing.services.map(s => s.skill).join(', ')}`);
    log('mail', `   Contact: ${this.inbox}`);

    // For now, log the listing. In production, this would broadcast
    // to agent registries and discovery services.
    return listing;
  }

  // ── Process actions from the agent loop ──
  async processInLoop() {
    if (!this.enabled) return { processed: 0 };

    const messages = await this.checkInbox();
    if (messages.length === 0) return { processed: 0, actions: [] };

    const actions = this.processMessages(messages);

    // Auto-respond to service queries
    for (const action of actions) {
      if (action.type === 'service_query') {
        await this.respondToQuery(action.from, action.messageId);
      }
    }

    return { processed: messages.length, actions };
  }

  // ── Headers for API calls ──
  _headers() {
    return {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Authorization': `Bearer ${this.apiKey}`,
    };
  }

  // ── Stats ──
  stats() {
    return {
      enabled: this.enabled,
      inbox: this.inbox,
      received: this.receivedMessages.length,
      sent: this.sentMessages.length,
      services: this.serviceListing.services.length,
    };
  }
}
