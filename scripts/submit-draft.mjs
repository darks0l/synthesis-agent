import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const convLog = readFileSync(join(__dirname, '../CONVERSATION_LOG.md'), 'utf8');

const key = readFileSync(join(__dirname, '..', '..', '.keys', 'synthesis-api-key.txt'), 'utf8').trim();

const body = {
  teamUUID: 'debc7354208942a8a647c7cf9daa32f9',
  name: 'Darksol — Autonomous Agent Economy Stack',
  description: 'A fully autonomous agent economy stack that discovers arbitrage, manages Uniswap V3 liquidity, outsources decisions to other agents via ERC-8183, pays for its own LLM inference from trading profits, and enforces spending limits through on-chain governance. The agent runs end-to-end without human intervention — scanning, deciding, executing, and learning. Built on Base with contracts deployed, live trades on-chain, and an ERC-8004 identity in self-custody.',
  problemStatement: 'Autonomous agents need three things to operate in the real world: a way to earn value, a way to spend it intelligently, and a way to trust other agents they work with. Current infrastructure forces agents to depend on human-managed API keys, fixed budgets, and centralized intermediaries. If the key gets revoked or the budget runs out, the agent stops. We built a stack where the agent earns USDC through cross-DEX arbitrage, routes those earnings to fund its own LLM inference via Bankr, coordinates with specialist agents via ERC-8183 job escrow (paying on-chain for better advice), enforces its own spending limits through an on-chain policy contract, and builds reputation through verifiable on-chain receipts. The agent pays its own bills. No human subsidy required.',
  repoURL: 'https://github.com/darks0l/synthesis-agent',
  deployedURL: 'https://github.com/darks0l/synthesis-agent#on-chain-artifacts',
  trackUUIDs: [
    '10bd47fac07e4f85bda33ba482695b24', // Let the Agent Cook
    '3bf41be958da497bbb69f1a150c76af9', // Agents With Receipts (ERC-8004)
    'dcaf0b1bf5d44c72a34bb771008e137a', // Best Bankr LLM Gateway Use
    '020214c160fc43339dd9833733791e6b', // Agentic Finance (Uniswap)
    '49c3d90b1f084c44a3585231dc733f83', // ERC-8183 Open Build (Virtuals)
    'fdb76d08812b43f6a5f454744b66f590', // Synthesis Open Track
    '877cd61516a14ad9a199bf48defec1c1', // Status Network Gasless
    'bf374c2134344629aaadb5d6e639e840', // Autonomous Trading Agent (Base)
    '6f0e3d7dcadf4ef080d3f424963caff5', // Agent Services on Base
  ],
  conversationLog: convLog,
  submissionMetadata: {
    agentFramework: 'other',
    agentFrameworkOther: 'Custom Node.js ESM orchestrator — 14 modules, 500+ LOC main loop, event-driven agent cycle with 13 steps per tick',
    agentHarness: 'openclaw',
    model: 'claude-opus-4-6',
    skills: [
      'synthesis-ta',
      'synthesis-arb-scanner',
      'synthesis-spending-policy',
      'synthesis-erc8183-jobs',
      'synthesis-feedback-loop',
      'synthesis-llm-cascade',
      'synthesis-agent-mail',
    ],
    tools: [
      'ethers.js v6',
      'Uniswap V3 QuoterV2',
      'Uniswap V3 SwapRouter02',
      'Uniswap V3 NonfungiblePositionManager',
      'Aerodrome',
      'Uniswap Trading API',
      'Virtuals ACP v2 SDK (@virtuals-protocol/acp-node)',
      'Bankr LLM Gateway',
      'AgentMail',
      'solcjs',
      'node:test',
      'OpenZeppelin Contracts 5.x',
      'CoinGecko API',
    ],
    helpfulResources: [
      'https://synthesis.devfolio.co/skill.md',
      'https://synthesis.devfolio.co/submission/skill.md',
      'https://docs.uniswap.org/contracts/v3/reference/periphery/SwapRouter',
      'https://docs.uniswap.org/contracts/v3/reference/periphery/NonfungiblePositionManager',
      'https://docs.bankr.bot/llm-gateway/overview',
      'https://github.com/Virtual-Protocol/acp-node',
      'https://eips.ethereum.org/EIPS/eip-8183',
    ],
    helpfulSkills: [
      {
        name: 'synthesis-arb-scanner',
        reason: '3-source parallel quote engine (Uniswap QuoterV2 + Aerodrome + API) found real spreads and triggered actual on-chain trades — the economic engine of the whole stack',
      },
      {
        name: 'synthesis-erc8183-jobs',
        reason: 'ERC-8183 job escrow is the architectural differentiator — outsourcing trade evaluation to other agents with on-chain payment and reputation tracking is the core innovation',
      },
      {
        name: 'synthesis-feedback-loop',
        reason: 'Without validating outsourced results against our own trade history, we would blindly trust any provider. The feedback loop is how the agent learns and adapts thresholds autonomously',
      },
    ],
    intention: 'continuing',
    intentionNotes: 'Darksol is the agent, not just the project. We plan to keep building — more chains, real Virtuals ACP provider integration, LP position management with live capital, and eventually a credit score via bond.credit on Arbitrum. The stack is real infrastructure that will run after the hackathon ends.',
  },
};

const res = await fetch('https://synthesis.devfolio.co/projects', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${key}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify(body),
});

const data = await res.json();
console.log('Status:', res.status);
console.log(JSON.stringify(data, null, 2));
