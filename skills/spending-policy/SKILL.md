---
name: synthesis-spending-policy
description: "On-chain agent spending limits via AgentSpendingPolicy smart contract. Per-transaction caps, daily limits, cooldowns, approved targets, emergency freeze. Use when: (1) enforcing on-chain spending guardrails, (2) limiting autonomous agent trade sizes, (3) auditing agent spending on-chain, (4) building spending governance for any agent."
---

# Synthesis Spending Policy — On-Chain Agent Guardrails

**Enforce spending limits on-chain. No trust required. 🌑**

From: `synthesis-agent` | Contract: `AgentSpendingPolicy.sol`

---

## What It Does

A Solidity contract that enforces per-transaction and daily spending limits for autonomous agents. Every swap checks the contract BEFORE executing. The agent cannot bypass these limits — they're enforced on-chain.

### Deployed Instances

| Chain | Address | Explorer |
|-------|---------|----------|
| Base | `0xA928fC2132EB4b7E4E96Bb5C2aA011a202290477` | [BaseScan](https://basescan.org/address/0xA928fC2132EB4b7E4E96Bb5C2aA011a202290477) |
| Status Sepolia | `0xbbe1443E24587C7d38F9Da3eF8D809cCeF9AfCb3` | [Status Explorer](https://sepoliascan.status.network/address/0xbbe1443E24587C7d38F9Da3eF8D809cCeF9AfCb3) |

### Contract Interface

```solidity
// View — check before executing
function wouldApprove(address target, uint256 amount) view returns (bool approved, string reason);
function remainingDaily() view returns (uint256);
function getPolicy() view returns (address _agent, uint256 _maxPerTx, uint256 _maxDaily, uint256 _cooldownMs, uint256 _dailySpent, uint256 _remaining, uint256 _txCount, uint256 _windowReset);

// State-changing — record approval
function requestApproval(address target, uint256 amount) returns (bool);

// Owner-only
function updateLimits(uint256 _maxPerTx, uint256 _maxDaily, uint256 _cooldownMs) external;
function addTarget(address target) external;
function removeTarget(address target) external;
function freeze() external;    // Emergency stop
function unfreeze() external;
```

### Integration Pattern

```js
// In your executor, before every trade:
const [approved, reason] = await policyContract.wouldApprove(routerAddress, amountUsdc);
if (!approved) {
  console.log(`Spending policy rejected: ${reason}`);
  return;
}

// Record the approval on-chain
await policyContract.requestApproval(routerAddress, amountUsdc);

// Now execute the swap
await router.exactInputSingle(...);
```

### Constructor Parameters

```solidity
constructor(
  address _agent,           // Agent wallet address
  uint256 _maxPerTx,        // Max USDC per transaction (6 decimals)
  uint256 _maxDaily,        // Max USDC per 24h window
  uint256 _cooldownMs,      // Min seconds between trades
  address[] _approvedTargets // Approved swap router addresses
)
```

### Default Configuration

| Parameter | Value |
|-----------|-------|
| maxPerTx | 2 USDC |
| maxDaily | 20 USDC |
| cooldown | 30 seconds |
| Approved targets | Uniswap SwapRouter02, Aerodrome Router |

---

Built with teeth. 🌑
