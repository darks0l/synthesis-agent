// ── Dashboard Server ─────────────────────────────────────────────
// Real-time web GUI for Synthesis Agent.
// Express + WebSocket. DARKSOL dark theme.

import express from 'express';
import { WebSocketServer } from 'ws';
import { createServer } from 'http';
import { readFileSync, existsSync } from 'fs';
import { join, dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, '..');

export class Dashboard {
  constructor(agent) {
    this.agent = agent; // reference to the agent state
    this.app = express();
    this.server = createServer(this.app);
    this.wss = new WebSocketServer({ server: this.server });
    this.clients = new Set();
    this.events = []; // ring buffer of recent events
    this.maxEvents = 200;
    this.port = agent?.config?.dashboard?.port || 3000;

    this._setupRoutes();
    this._setupWebSocket();
  }

  _setupRoutes() {
    // Serve static dashboard
    this.app.get('/', (req, res) => {
      res.sendFile(join(projectRoot, 'public', 'index.html'));
    });
    this.app.use('/public', express.static(join(projectRoot, 'public')));

    // API endpoints
    this.app.get('/api/status', (req, res) => {
      res.json(this._getStatus());
    });

    this.app.get('/api/trades', (req, res) => {
      try {
        const path = join(projectRoot, 'data', 'trade-history.json');
        const data = existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : [];
        res.json(data);
      } catch { res.json([]); }
    });

    this.app.get('/api/learnings', (req, res) => {
      try {
        const path = join(projectRoot, 'data', 'learnings.json');
        const data = existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : {};
        res.json(data);
      } catch { res.json({}); }
    });

    this.app.get('/api/events', (req, res) => {
      res.json(this.events.slice(-50));
    });

    this.app.get('/api/receipts', (req, res) => {
      try {
        const path = join(projectRoot, 'data', 'receipts.json');
        const data = existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : [];
        res.json(data);
      } catch { res.json([]); }
    });
  }

  _setupWebSocket() {
    this.wss.on('connection', (ws) => {
      this.clients.add(ws);
      // Send current state on connect
      ws.send(JSON.stringify({ type: 'init', data: this._getStatus() }));
      ws.send(JSON.stringify({ type: 'events', data: this.events.slice(-50) }));
      ws.on('close', () => this.clients.delete(ws));
    });
  }

  _getStatus() {
    const a = this.agent || {};
    return {
      address: a.address || '0x0',
      mode: a.dryRun ? 'DRY RUN' : 'LIVE',
      chain: 'base',
      chainId: 8453,
      uptime: a.startTime ? Date.now() - a.startTime : 0,
      cycle: a.cycleCount || 0,
      balances: a.balances || { eth: '0', usdc: '0' },
      identity: {
        verified: a.identityVerified || false,
        tokenId: 31929,
        txHash: '0x539438d51803ed2d2a2c7ef0429493d4b86fa1d521717c69d2e9d6593a62efba',
      },
      llm: {
        provider: a.llmProvider || 'heuristic',
        model: a.llmModel || 'fallback',
        calls: a.llmCalls || 0,
        tokens: a.llmTokens || 0,
      },
      trading: {
        executed: a.tradesExecuted || 0,
        dailySpent: a.dailySpent || 0,
        dailyLimit: a.dailyLimit || 20,
        lastSpread: a.lastSpread || null,
        lastDecision: a.lastDecision || null,
      },
      ta: a.lastTA || null,
      lp: {
        positions: a.lpPositions || 0,
      },
      contracts: {
        spendingPolicy: '0xA928fC2132EB4b7E4E96Bb5C2aA011a202290477',
        synthesisJobs: '0xCB98F0e2bb429E4a05203C57750A97Db280e6617',
        erc8004: '0x8004A169FB4a3325136EB29fA0ceB6D2e539a432',
      },
      scanner: {
        pairsScanned: a.pairsScanned || 0,
        opportunitiesFound: a.opportunitiesFound || 0,
      },
    };
  }

  /** Push an event to all connected clients */
  push(type, data) {
    const event = { type, data, timestamp: new Date().toISOString() };
    this.events.push(event);
    if (this.events.length > this.maxEvents) this.events.shift();

    const msg = JSON.stringify(event);
    for (const ws of this.clients) {
      try { ws.send(msg); } catch {}
    }
  }

  /** Push full status update */
  pushStatus() {
    this.push('status', this._getStatus());
  }

  async start() {
    return new Promise((resolve) => {
      this.server.listen(this.port, () => {
        console.log(`[dashboard] 🖥️  Dashboard live at http://localhost:${this.port}`);
        resolve();
      });
    });
  }

  stop() {
    this.server.close();
  }
}
