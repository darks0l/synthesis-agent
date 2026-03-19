// Dashboard demo — simulates live trading events for screen recording
import express from 'express';
import { WebSocketServer } from 'ws';
import { createServer } from 'http';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, '..');
const PORT = 3000;

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });
const clients = new Set();
const events = [];

// Serve dashboard
const publicDir = resolve(projectRoot, 'public');
app.use(express.static(publicDir));
app.get('/', (req, res) => res.sendFile(resolve(publicDir, 'index.html')));

// Load real trade history
let tradeHistory = [];
try { tradeHistory = JSON.parse(readFileSync(resolve(projectRoot, 'data', 'trade-history.json'), 'utf8')); } catch {}

let learnings = {};
try { learnings = JSON.parse(readFileSync(resolve(projectRoot, 'data', 'learnings.json'), 'utf8')); } catch {}

let receipts = [];
try { receipts = JSON.parse(readFileSync(resolve(projectRoot, 'data', 'receipts.json'), 'utf8')); } catch {}

app.get('/api/status', (req, res) => res.json(agentState));
app.get('/api/trades', (req, res) => res.json(tradeHistory));
app.get('/api/learnings', (req, res) => res.json(learnings));
app.get('/api/events', (req, res) => res.json(events.slice(-50)));
app.get('/api/receipts', (req, res) => res.json(receipts));
app.get('/api/bankr', (req, res) => res.json({
  credits: 0.42,
  totalRequests: 847,
  totalTokens: 124500,
  totalCost: 0.58,
  models: [{ model: 'gemini-3-flash', requests: 847, tokens: 124500 }],
}));

// Agent state
const agentState = {
  address: '0x3e6e304421993D7E95a77982E11C93610DD4fFC5',
  mode: 'LIVE',
  chain: 'base',
  chainId: 8453,
  uptime: 0,
  cycle: 761,
  balances: { eth: '0.00053', usdc: '1.96' },
  identity: { verified: true, tokenId: 31929, txHash: '0x539438d51803ed2d2a2c7ef0429493d4b86fa1d521717c69d2e9d6593a62efba' },
  llm: { provider: 'bankr', model: 'gemini-3-flash', calls: 847, tokens: 124500 },
  trading: { executed: 23, dailySpent: 8.40, dailyLimit: 20, lastSpread: null, lastDecision: null },
  ta: null,
  lp: { positions: 1 },
  contracts: {
    spendingPolicy: '0xA928fC2132EB4b7E4E96Bb5C2aA011a202290477',
    synthesisJobs: '0xCB98F0e2bb429E4a05203C57750A97Db280e6617',
    erc8004: '0x8004A169FB4a3325136EB29fA0ceB6D2e539a432',
    delegationManager: '0xdb9B1e94B5b69Df7e401DDbedE43491141047dB3',
  },
  scanner: { pairsScanned: 2283, opportunitiesFound: 47 },
};

function broadcast(type, data) {
  const event = { type, data, timestamp: new Date().toISOString() };
  events.push(event);
  if (events.length > 200) events.shift();
  const msg = JSON.stringify(event);
  for (const ws of clients) { try { ws.send(msg); } catch {} }
}

wss.on('connection', (ws) => {
  clients.add(ws);
  ws.send(JSON.stringify({ type: 'init', data: agentState }));
  ws.send(JSON.stringify({ type: 'events', data: events.slice(-50) }));
  ws.on('close', () => clients.delete(ws));
});

server.listen(PORT, () => console.log(`Dashboard demo: http://localhost:${PORT}`));

// ── Simulate live trading activity ──
const pairs = ['WETH/USDC', 'cbETH/WETH', 'DAI/USDC'];
const dexes = ['Uniswap V3', 'Aerodrome'];
let cycle = 762;

function randomSpread() { return Math.floor(Math.random() * 80) + 5; }
function randomConfidence() { return Math.floor(Math.random() * 40) + 45; }
function randomPrice(base, variance) { return (base + (Math.random() - 0.5) * variance).toFixed(2); }

async function simulateCycle() {
  const pair = pairs[Math.floor(Math.random() * pairs.length)];
  const spread = randomSpread();
  const threshold = 30;
  
  // 1. Scan event
  broadcast('scan', {
    cycle: cycle,
    pair,
    prices: {
      'Uniswap V3': randomPrice(2163, 20),
      'Aerodrome': randomPrice(2154, 20),
    },
    spreadBps: spread,
    threshold,
    passed: spread >= threshold,
  });
  
  agentState.cycle = cycle;
  agentState.scanner.pairsScanned += pairs.length;
  agentState.uptime += 60000;
  
  if (spread >= threshold) {
    agentState.scanner.opportunitiesFound++;
    
    // 2. LLM evaluation (after short delay)
    await sleep(1500);
    const confidence = randomConfidence();
    const approved = confidence >= 60;
    
    broadcast('llm', {
      cycle,
      pair,
      provider: 'Bankr Gateway',
      model: 'gemini-3-flash',
      confidence,
      decision: approved ? 'APPROVE' : 'SKIP',
      reasoning: approved
        ? `Spread ${spread}bps on ${pair} exceeds threshold. RSI neutral. Volume adequate.`
        : `Confidence ${confidence}% below 60% threshold. Market conditions uncertain.`,
    });
    agentState.llm.calls++;
    
    if (approved) {
      // 3. Policy check
      await sleep(1000);
      broadcast('policy', {
        cycle,
        contract: '0xA928fC...0477',
        wouldApprove: true,
        perTx: '$2.00',
        dailyRemaining: `$${(20 - agentState.trading.dailySpent).toFixed(2)}`,
      });
      
      // 4. Trade execution
      await sleep(1200);
      const amountOut = (0.0005 * parseFloat(randomPrice(2163, 10))).toFixed(2);
      const fakeTx = '0x' + [...Array(64)].map(() => Math.floor(Math.random() * 16).toString(16)).join('');
      
      broadcast('trade', {
        cycle,
        pair,
        side: 'sell',
        amountIn: '0.0005 ETH',
        amountOut: `${amountOut} USDC`,
        dex: 'Uniswap V3',
        txHash: fakeTx,
        gasUsed: Math.floor(Math.random() * 50000) + 130000,
        spreadBps: spread,
        confidence,
      });
      
      agentState.trading.executed++;
      agentState.trading.dailySpent += parseFloat(amountOut);
      agentState.trading.lastSpread = spread;
      agentState.trading.lastDecision = 'execute';
    } else {
      agentState.trading.lastSpread = spread;
      agentState.trading.lastDecision = 'skip (low confidence)';
    }
  } else {
    agentState.trading.lastSpread = spread;
    agentState.trading.lastDecision = 'skip (below threshold)';
  }
  
  // Update status
  broadcast('status', agentState);
  cycle++;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// Run cycles every 4-8 seconds for the demo
async function loop() {
  while (true) {
    await simulateCycle();
    await sleep(3000 + Math.random() * 5000); // 3-8s between cycles
  }
}

// Seed with a few initial events
async function seed() {
  await sleep(2000); // let dashboard connect first
  for (let i = 0; i < 3; i++) {
    await simulateCycle();
    await sleep(800);
  }
  loop(); // then start normal pace
}

seed();
