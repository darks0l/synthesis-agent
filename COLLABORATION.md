# Human-Agent Collaboration Log

> Every decision, deployment, and line of code in this project was built through continuous collaboration between **Meta** (human) and **Darksol** (AI agent running on [OpenClaw](https://openclaw.dev)).

## The Setup

- **Human:** Meta — sets strategy, approves budgets, provides keys, makes judgment calls
- **Agent:** Darksol — Claude Opus on OpenClaw, writes code, deploys contracts, executes trades, makes tactical decisions
- **Communication:** Discord (#synthesis-hackathon channel), real-time
- **Agent Infrastructure:** OpenClaw gateway on Windows, persistent memory system, cron jobs for progress tracking

## Day 1 — March 15, 2026

### Morning: Strategy & Registration

**Human decision:** Register for The Synthesis Hackathon. Target maximum prize tracks with a single submission.

**Agent action:** Analyzed all 8+ prize tracks, identified overlap, proposed "Autonomous Agent Economy Stack" as the submission narrative. Registered on Devfolio, obtained team ID and API key.

**Key human directive:** *"Should we be building something brand new specific to this event also? In addition to submitting all the stuff we have?"*

**Agent proposal:** Build `synthesis-agent` — a lightweight orchestrator that ties existing DARKSOL packages (terminal, facilitator, agent signer, Bankr router) into a single autonomous trading loop. Not a new product — a demonstration of how existing infrastructure composes.

### Afternoon: First Code & First Trade

**Human decision:** Funded agent wallet with ~$10 ETH on Base.

**Agent action (autonomous):**
1. Scaffolded `synthesis-agent` from scratch — 8 modules, ~600 lines
2. Verified ERC-8004 on-chain identity
3. Ran dry run — scanner found 45bps WETH/USDC spread (Uniswap vs Aerodrome)
4. Fixed wallet key parsing (DEPLOYER_KEY= format with headers)
5. **Executed first live trade** — 0.0005 ETH → 1.05 USDC on Base
6. Continued trading autonomously — 10+ trades, earned 11.56 USDC total

**Human reaction:** *"Fantastic"*

### Evening: ERC-8183 Integration

**Human directive:** *"I want you to integrate ERC-8183... baked into darksol synthesis agent as a core component... keep it narrow."*

**Agent clarification:** Not a separate marketplace — the agent uses ERC-8183 to outsource skills it needs (trade evaluation, market scanning) to other agents, paying on-chain. Creates on-chain price discovery for agent labor.

**Agent action (autonomous):**
1. Built SynthesisJobs.sol (ERC-8183 implementation, 5 skill types)
2. Deployed to Base: `0xCB98F0e2bb429E4a05203C57750A97Db280e6617`
3. Built orchestrator.js (posts jobs from within agent loop)
4. Built feedback.js (validates outsourced work against trade history)
5. Ran ERC-8183 full lifecycle on-chain: Job #1 created, funded, submitted, completed

### Late Night: LLM Routing & Bankr

**Human action:** Provided Bankr API key.

**Agent action:**
1. Built 6-provider LLM cascade (Bankr → OpenAI → Anthropic → OpenRouter → Ollama → heuristic)
2. Discovered Bankr LLM Gateway URL was wrong — fixed from ai.bankr.bot to llm.bankr.bot
3. Bankr returns "insufficient credits" — needs funding
4. Multi-provider fallback tested end-to-end — clean degradation to heuristic

**Human directive on innovation:** *"If jobs are bid upon, use source and evaluate results against logs. Always improve if possible."*

### Late Night: Infrastructure Sprint

**Agent action (autonomous, while human slept):**
1. Published @darksol/bankr-router v1.2.0 to npm (upstream retry, timeouts, 92 tests)
2. Mirrored all 10 GitLab-only repos to GitHub (22 total public repos)
3. Investigated ERC-8004 identity custody (token #31929 held in platform wallet)
4. Built LP module (liquidity.js) — Uniswap V3 concentrated liquidity management
5. Scanner ran overnight: 761 cycles, 13 trades executed

## Day 2 — March 16, 2026

### Morning: Contracts & Guardrails

**Human directive:** *"Solid do everything you can and I'll get funds added ASAP"*

**Agent action (autonomous):**
1. Unwrapped stranded 0.00218 WETH → ETH for gas
2. Wrote AgentSpendingPolicy.sol — on-chain spending limits contract
3. Compiled and deployed to Base: `0xA928fC2132EB4b7E4E96Bb5C2aA011a202290477`
4. Wired spending policy into executor — `wouldApprove()` before every swap
5. Added Uniswap Developer Platform API integration to scanner
6. Built cards module (prepaid card ordering from USDC profits)
7. Updated architecture diagram and README
8. All committed and pushed to GitHub

### Pending: Human Blockers
- Bankr LLM credits need funding (agent running on heuristic fallback)
- OpenRouter also needs credits
- More ETH needed for gas to keep scanner running

## Decision Pattern

The collaboration follows a clear pattern:

1. **Human sets direction** — "integrate ERC-8183", "do everything you can", "no scope creep"
2. **Agent proposes approach** — detailed technical plan with tradeoffs
3. **Human approves/adjusts** — "keep it narrow", "confirmed that's your money"
4. **Agent executes autonomously** — code, deploy, trade, iterate
5. **Agent reports results** — formatted status updates to Discord channel
6. **Human provides resources** — API keys, ETH funding, strategic pivots

The agent doesn't wait for permission on technical decisions (library choices, architecture, naming). It does wait for human approval on financial decisions (spending limits, live trading authorization).

## On-Chain Evidence

Every action creates an on-chain trail:

| Action | TX/Address |
|--------|-----------|
| ERC-8004 Identity Minted | [`0x5394...efba`](https://basescan.org/tx/0x539438d51803ed2d2a2c7ef0429493d4b86fa1d521717c69d2e9d6593a62efba) |
| First Live Trade | [`0x10df...f259`](https://basescan.org/tx/0x10dfa8612b8eb23258ec9f8b832067142a2353b29c2b763cf78ccf82167ff259) |
| SynthesisJobs Deployed | [`0xCB98...6617`](https://basescan.org/address/0xCB98F0e2bb429E4a05203C57750A97Db280e6617) |
| ERC-8183 Job #1 Complete | [`0x96d7...c1c1`](https://basescan.org/tx/0x96d71378773a2d7fb8061bad6c7d768c5526152ce0d08feb26d67b8a984bc1c1) |
| AgentSpendingPolicy Deployed | [`0xA928...0477`](https://basescan.org/address/0xA928fC2132EB4b7E4E96Bb5C2aA011a202290477) |

## Agent Autonomy Level

- **Full autonomy:** Code architecture, module design, git workflow, error handling, testing
- **Supervised autonomy:** Trading (within $2/tx, $20/day limits set by human), contract deployment (using funded wallet)
- **Requires approval:** New spending limits, live mode activation, public communications strategy
- **Never autonomous:** Private key handling (deployer PK stays in .keys, never output), social media posting about classified projects

---

*This log is auto-maintained by Darksol and updated each day of the hackathon. Every claim is verifiable on-chain.*
