// ── Config ──────────────────────────────────────────────────────────
// Central configuration for the Synthesis Agent.
// Environment variables override defaults.

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const keysDir = join(__dirname, '..', '..', '.keys');

function readKey(filename) {
  try {
    return readFileSync(join(keysDir, filename), 'utf8').trim();
  } catch {
    return null;
  }
}

export const config = {
  // ── Identity ──
  agentAddress: '0x3e6e304421993D7E95a77982E11C93610DD4fFC5',
  erc8004TxHash: '0x539438d51803ed2d2a2c7ef0429493d4b86fa1d521717c69d2e9d6593a62efba',

  // ── Chain ──
  chain: {
    name: 'base',
    chainId: 8453,
    rpc: process.env.BASE_RPC || 'https://mainnet.base.org',
    wss: process.env.BASE_WSS || 'wss://base-mainnet.g.alchemy.com/v2/demo',
    explorer: 'https://basescan.org',
  },

  // ── Tokens ──
  tokens: {
    WETH: '0x4200000000000000000000000000000000000006',
    USDC: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    USDbC: '0xd9aAEc86B65D86f6A7B5B1b0c42FFA531710b6CA',
    DAI: '0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb',
  },

  // ── Agent Signer ──
  agentSigner: {
    url: process.env.AGENT_SIGNER_URL || 'http://127.0.0.1:18790',
    token: process.env.AGENT_SIGNER_TOKEN || null,
  },

  // ── LLM Providers (priority order: bankr → openai → anthropic → openrouter → ollama → heuristic) ──
  llm: {
    // Bankr LLM Gateway (primary — closes the economic loop)
    bankrApiKey: process.env.BANKR_API_KEY || readKey('bankr-api-key.txt'),
    bankrGateway: 'https://llm.bankr.bot/v1',
    // OpenAI
    openaiApiKey: process.env.OPENAI_API_KEY || readKey('openai-api-key.txt'),
    openaiGateway: 'https://api.openai.com/v1',
    // Anthropic
    anthropicApiKey: process.env.ANTHROPIC_API_KEY || readKey('anthropic-api-key.txt'),
    anthropicGateway: 'https://api.anthropic.com/v1',
    // OpenRouter
    openrouterApiKey: process.env.OPENROUTER_API_KEY || readKey('openrouter-api-key.txt'),
    openrouterGateway: 'https://openrouter.ai/api/v1',
    // Local Ollama (free, no key needed)
    ollamaUrl: process.env.OLLAMA_URL || 'http://192.168.68.78:11434',
    ollamaModel: process.env.OLLAMA_MODEL || 'qwen3.5:latest',
    // Model preferences per provider
    models: {
      bankr: 'meta-llama/llama-3.3-70b-instruct',
      openai: 'gpt-4o-mini',
      anthropic: 'claude-sonnet-4-20250514',
      openrouter: 'meta-llama/llama-3.3-70b-instruct',
    },
  },

  // ── Uniswap ──
  uniswap: {
    apiKey: process.env.UNISWAP_API_KEY || readKey('uniswap-api-key.txt'),
    routerV3: '0x2626664c2603336E57B271c5C0b26F421741e481', // SwapRouter02 on Base
    quoterV2: '0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a', // QuoterV2 on Base
  },

  // ── Spending Policy ──
  spending: {
    maxPerTx: process.env.MAX_PER_TX || '2.0',       // max USDC per swap
    maxDaily: process.env.MAX_DAILY || '20.0',        // max USDC per day
    cooldownMs: 30_000,                                // min ms between trades
  },

  // ── Scan Settings ──
  scan: {
    intervalMs: process.env.SCAN_INTERVAL || 60_000,  // scan every 60s
    minProfitBps: 30,                                  // min 0.3% profit
    pairs: [
      { tokenIn: 'WETH', tokenOut: 'USDC' },
      { tokenIn: 'USDC', tokenOut: 'WETH' },
      { tokenIn: 'WETH', tokenOut: 'DAI' },
    ],
  },

  // ── ERC-8183 Orchestrator ──
  orchestrator: {
    contractAddress: process.env.SYNTHESIS_JOBS_ADDRESS || '0xCB98F0e2bb429E4a05203C57750A97Db280e6617',
    enabled: true,
    selfFulfill: true, // Demo mode: agent fulfills its own jobs to show lifecycle
  },

  // ── Flags ──
  dryRun: process.argv.includes('--dry-run'),
  verbose: process.argv.includes('--verbose') || process.argv.includes('-v'),
};
