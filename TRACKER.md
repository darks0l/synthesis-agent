# Synthesis Hackathon — Progress Tracker

**Event:** The Synthesis (March 13-22, 2026)
**Deadline:** March 22, 2026 (Saturday)
**Submission:** synthesis.devfolio.co
**Team ID:** debc7354208942a8a647c7cf9daa32f9
**Repo:** https://github.com/darks0l/synthesis-agent

---

## Task Checklist

### Day 1-2 (March 15-16) — Foundation
- [x] Register for hackathon
- [x] Mint ERC-8004 on-chain identity
- [x] Scaffold synthesis-agent project
- [x] Implement core modules (scanner, executor, LLM, identity, reporter)
- [x] Verify dry run works
- [x] Push to GitHub (public)
- [x] Store Uniswap API key
- [x] Execute first real on-chain swap — TX: 0x10dfa861...
- [x] Wire Bankr LLM Gateway (enabled, needs credits — fallback chain active)
- [x] Multi-provider LLM routing (Bankr→OpenAI→Anthropic→OpenRouter→Ollama→heuristic)
- [x] Build ERC-8183 orchestrator + feedback loop
- [x] Deploy SynthesisJobs contract on Base — `0xCB98F0e2bb429E4a05203C57750A97Db280e6617`
- [x] Swap USDC→ETH for gas
- [x] Bankr Router v1.2.0 published (retry chain, timeouts, health check)

### Day 2 cont. (March 16) — Scaling Up
- [x] Ran scanner overnight — 761 cycles, 13 trades, $13 spent
- [x] Added prepaid card module (DARKSOL Cards API integration)
- [x] Deployed AgentSpendingPolicy contract — `0xA928fC2132EB4b7E4E96Bb5C2aA011a202290477`
- [x] Swapped USDC→ETH for gas (2x refuels)
- [x] Wire spending policy into executor (on-chain wouldApprove + requestApproval)
- [x] Add Uniswap Developer Platform API integration (3-source scanner)
- [x] Built LP module (liquidity.js) — Uniswap V3 concentrated liquidity
- [x] Post first ERC-8183 job on-chain (Job #1 full lifecycle complete)
- [x] Start submission README + architecture diagram (10KB README done)
- [x] COLLABORATION.md — human-agent decision log for submission
- [x] Scanner restarted with all integrations live
- [ ] Run arb scanner live → keep generating on-chain activity (⚠ low ETH: 0.0001)
- [x] Built AgentMail module (src/mail.js) — inter-agent communication
- [x] Full codebase audit + 10 fixes (wallet dedup, slippage, CLI, dead code, .env)
- [x] 38 tests passing (config, feedback, cards, LLM, mail)
- [x] Version bump to v0.2.0

### Day 3-4 (March 17-18) — Integration & Demo
- [ ] Get Bankr LLM credits funded (blocker — running heuristic only)
- [ ] ETH top-up for continued trading
- [ ] Wire agent signer for autonomous execution
- [ ] Deploy to Status Network Sepolia (gasless $50 prize)
- [ ] Record demo video (terminal in action)
- [ ] Run autonomous agent loop live end-to-end with LLM

### Day 5-6 (March 19-20) — Polish
- [ ] Write submission narrative
- [ ] Run full autonomous loop live (24h+ with LLM)
- [ ] Open source terminal + facilitator repos (already public)
- [ ] Architecture diagram (visual, for submission)

### Day 7 (March 21-22) — Submit
- [ ] Final submission on Devfolio
- [ ] Verify all repos public
- [ ] Verify all on-chain artifacts linked
- [ ] Submit to all target tracks
- [ ] Double-check all links work

---

## Prize Targets
1. Let the Agent Cook — $4k/$2.5k/$1.5k
2. ERC-8004 Agents With Receipts — $4k/$3k/$1k
3. ERC-8183 Open Build (Virtuals) — $2k
4. Bankr LLM Gateway — $3k/$1.5k/$500
5. Uniswap Agentic Finance — $2.5k/$1.5k/$1k
6. Open Track — $14.5k
7. bond.credit — $1k/$500
8. AgentCash x402 — $1k/$500/$250
9. Status Network Gasless — $50

## On-Chain Artifacts
- ERC-8004 TX: https://basescan.org/tx/0x539438d51803ed2d2a2c7ef0429493d4b86fa1d521717c69d2e9d6593a62efba
- Agent Address: `0x3e6e304421993D7E95a77982E11C93610DD4fFC5`
- SynthesisJobs Contract: `0xCB98F0e2bb429E4a05203C57750A97Db280e6617` — [BaseScan](https://basescan.org/address/0xCB98F0e2bb429E4a05203C57750A97Db280e6617)
- USDC→ETH Swap: `0xbe7f5b9866144927d76febcc723be328cc14c7257348ffee3bf3522766e677f0`
- WETH Unwrap: `0x73faf8551f0e0b4b908bd5d4eeebb92df6f7f7f8cf485d79a3ab2defc11d4bb3`
- Trade TX #1: `0x10dfa8612b8eb23258ec9f8b832067142a2353b29c2b763cf78ccf82167ff259`
- Trade TX #2: `0x7b72228d7e195f0dd01e9f5fd6769076e306e726143ffe654f1299e5c17edfd1`
- AgentSpendingPolicy: `0xA928fC2132EB4b7E4E96Bb5C2aA011a202290477` — [BaseScan](https://basescan.org/address/0xA928fC2132EB4b7E4E96Bb5C2aA011a202290477)
- USDC→ETH Refuel #2: `0x4167abf69ee0ea7a20c818a5b92af937c55fb3f2ef08d0b5da1bd69563d21de2`

## Daily Log
### March 15
- Registered for hackathon
- Minted ERC-8004 identity on Base
- Built synthesis-agent from scratch (8 modules, ~600 lines)
- Dry run successful — scanner found 45bps WETH/USDC spread
- Pushed to GitHub: https://github.com/darks0l/synthesis-agent
- Received $10 ETH funding from Meta
- Stored Uniswap + Bankr API keys
- Fixed key parsing, USDC balance fallback, smart LLM heuristic
- **FIRST LIVE TRADE** — 0.0005 ETH → 1.05 USDC (×10 trades, earned 11.56 USDC)
- Built ERC-8183 orchestrator (job posting, self-fulfill, feedback loop)
- Built multi-provider LLM routing (6 providers, auto-fallback)
- **Deployed SynthesisJobs contract** to Base: `0xCB98F0e2bb429E4a05203C57750A97Db280e6617`
- Swapped 10 USDC → ETH for gas, unwrapped WETH
- Published @darksol/bankr-router v1.2.0 (upstream retry, timeouts, health check)
- Wallet: ~0.00474 ETH + 1.56 USDC

### March 16
- Scanner ran overnight: 761 cycles, 13 total trades, $13 daily spend
- Added `src/cards.js` — prepaid card ordering via DARKSOL Cards API
- Swapped 5 USDC → ETH (2x refuels to keep scanner running)
- **Deployed AgentSpendingPolicy** to Base: `0xA928fC2132EB4b7E4E96Bb5C2aA011a202290477`
  - 2 USDC/tx limit, 20 USDC/day, 30s cooldown
  - Approved targets: Uniswap SwapRouter02 + Aerodrome Router
  - Human-controlled: owner sets limits, agent cannot raise them
  - Emergency freeze function for instant kill
- Wired spending policy into executor (on-chain wouldApprove + requestApproval)
- Added Uniswap Developer Platform API as 3rd scanner source
- Built `src/liquidity.js` — Uniswap V3 concentrated LP management (497 lines)
- ERC-8183 Job #1 full lifecycle completed on-chain
- Built `src/mail.js` — AgentMail inter-agent communication (339 lines)
- Full codebase audit: fixed wallet dedup, slippage protection, dead code, CLI --help/--version
- Created `.env.example` + `.env` support for portability
- Wrote 38 tests (config, feedback, cards, LLM, mail) — all passing
- **v0.2.0 released** — 19 commits, 48 files, 19,364 lines, 11 source modules
- Added ERC-8183 Open Build track (Virtuals, $2k) — now targeting 9 tracks
- Wallet: ~0.0001 ETH + 11.5 USDC on Base
