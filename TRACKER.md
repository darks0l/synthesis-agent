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
- [x] Execute first real on-chain swap (small ETH→USDC) — TX: 0x10dfa8612b8eb23258ec9f8b832067142a2353b29c2b763cf78ccf82167ff259
- [ ] Wire Bankr LLM Gateway (get API key)
- [ ] Deploy AgentSpendingPolicy contract on Base

### Day 3-4 (March 17-18) — Integration
- [ ] Run arb scanner live → generate on-chain activity
- [ ] Wire agent signer for autonomous execution
- [ ] Add Uniswap Developer Platform API integration
- [ ] Deploy to Status Network Sepolia (gasless $50 prize)
- [ ] Start submission README + architecture diagram

### Day 5-6 (March 19-20) — Polish
- [ ] Compile conversation log from session history
- [ ] Record demo video (terminal in action)
- [ ] Run autonomous agent loop live end-to-end
- [ ] Write submission narrative
- [ ] Open source terminal + facilitator repos (if not already)

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
3. Bankr LLM Gateway — $3k/$1.5k/$500
4. Uniswap Agentic Finance — $2.5k/$1.5k/$1k
5. Open Track — $14.5k
6. bond.credit — $1k/$500
7. AgentCash x402 — $1k/$500/$250
8. Status Network Gasless — $50

## On-Chain Artifacts
- ERC-8004 TX: https://basescan.org/tx/0x539438d51803ed2d2a2c7ef0429493d4b86fa1d521717c69d2e9d6593a62efba
- Agent Address: 0x3e6e304421993D7E95a77982E11C93610DD4fFC5
- Trade TXs: (pending)

## Daily Log
### March 15
- Registered for hackathon
- Minted ERC-8004 identity on Base
- Built synthesis-agent from scratch (8 modules, ~600 lines)
- Dry run successful — scanner found 45bps WETH/USDC spread
- Pushed to GitHub: https://github.com/darks0l/synthesis-agent
- Received $10 ETH funding from Meta
- Stored Uniswap API key
- Fixed key parsing, USDC balance fallback, smart LLM heuristic
- **FIRST LIVE TRADE** — 0.0005 ETH → 1.05 USDC via Uniswap V3 (TX: 0x10dfa86...)
- Agent running in continuous live mode — scanning every 60s, auto-trading
