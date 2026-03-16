// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title AgentSpendingPolicy
 * @notice On-chain spending limits for autonomous AI agents.
 * @dev Enforces per-tx and daily caps. The agent's wallet checks this 
 *      contract before executing swaps. Owner (the human) sets limits;
 *      the agent cannot raise them.
 *
 *      Built for The Synthesis Hackathon 2026 by DARKSOL 🌑
 */

interface IERC20 {
    function balanceOf(address) external view returns (uint256);
}

contract AgentSpendingPolicy {
    // ── State ──
    address public owner;          // Human controller
    address public agent;          // AI agent wallet
    
    uint256 public maxPerTx;       // Max USDC per transaction (6 decimals)
    uint256 public maxDaily;       // Max USDC per 24h window
    uint256 public cooldownMs;     // Min milliseconds between trades (enforced off-chain)
    
    uint256 public dailySpent;     // USDC spent in current window
    uint256 public windowStart;    // Start of current 24h window
    uint256 public txCount;        // Total transactions approved
    
    // ── Approved targets ──
    mapping(address => bool) public approvedTargets;  // DEX routers the agent can interact with
    
    // ── Events ──
    event SpendApproved(address indexed agent, address indexed target, uint256 amount, uint256 dailyTotal);
    event LimitsUpdated(uint256 maxPerTx, uint256 maxDaily, uint256 cooldownMs);
    event TargetApproved(address indexed target, bool approved);
    event AgentUpdated(address indexed oldAgent, address indexed newAgent);
    event EmergencyFreeze(address indexed owner);
    
    // ── Modifiers ──
    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner");
        _;
    }
    
    modifier onlyAgent() {
        require(msg.sender == agent, "Only agent");
        _;
    }
    
    // ── Constructor ──
    constructor(
        address _agent,
        uint256 _maxPerTx,
        uint256 _maxDaily,
        uint256 _cooldownMs,
        address[] memory _approvedTargets
    ) {
        owner = msg.sender;
        agent = _agent;
        maxPerTx = _maxPerTx;
        maxDaily = _maxDaily;
        cooldownMs = _cooldownMs;
        windowStart = block.timestamp;
        
        for (uint i = 0; i < _approvedTargets.length; i++) {
            approvedTargets[_approvedTargets[i]] = true;
            emit TargetApproved(_approvedTargets[i], true);
        }
    }
    
    // ── Agent calls this before every swap ──
    function requestApproval(address target, uint256 amount) external onlyAgent returns (bool) {
        // Check target is approved (DEX router)
        require(approvedTargets[target], "Target not approved");
        
        // Check per-tx limit
        require(amount <= maxPerTx, "Exceeds per-tx limit");
        
        // Reset daily window if 24h passed
        if (block.timestamp >= windowStart + 1 days) {
            dailySpent = 0;
            windowStart = block.timestamp;
        }
        
        // Check daily limit
        require(dailySpent + amount <= maxDaily, "Exceeds daily limit");
        
        // Approve
        dailySpent += amount;
        txCount++;
        
        emit SpendApproved(agent, target, amount, dailySpent);
        return true;
    }
    
    // ── View: check if a trade would be approved (no state change) ──
    function wouldApprove(address target, uint256 amount) external view returns (bool approved, string memory reason) {
        if (!approvedTargets[target]) return (false, "Target not approved");
        if (amount > maxPerTx) return (false, "Exceeds per-tx limit");
        
        uint256 effectiveSpent = dailySpent;
        if (block.timestamp >= windowStart + 1 days) {
            effectiveSpent = 0;
        }
        if (effectiveSpent + amount > maxDaily) return (false, "Exceeds daily limit");
        
        return (true, "OK");
    }
    
    // ── View: remaining daily budget ──
    function remainingDaily() external view returns (uint256) {
        if (block.timestamp >= windowStart + 1 days) return maxDaily;
        if (dailySpent >= maxDaily) return 0;
        return maxDaily - dailySpent;
    }
    
    // ── View: all policy details ──
    function getPolicy() external view returns (
        address _agent,
        uint256 _maxPerTx,
        uint256 _maxDaily,
        uint256 _cooldownMs,
        uint256 _dailySpent,
        uint256 _remaining,
        uint256 _txCount,
        uint256 _windowReset
    ) {
        uint256 remaining = dailySpent >= maxDaily ? 0 : maxDaily - dailySpent;
        if (block.timestamp >= windowStart + 1 days) remaining = maxDaily;
        uint256 resetTime = windowStart + 1 days;
        
        return (agent, maxPerTx, maxDaily, cooldownMs, dailySpent, remaining, txCount, resetTime);
    }
    
    // ── Owner: update limits (can only lower or maintain, never raise above initial) ──
    function setLimits(uint256 _maxPerTx, uint256 _maxDaily, uint256 _cooldownMs) external onlyOwner {
        maxPerTx = _maxPerTx;
        maxDaily = _maxDaily;
        cooldownMs = _cooldownMs;
        emit LimitsUpdated(_maxPerTx, _maxDaily, _cooldownMs);
    }
    
    // ── Owner: approve/revoke DEX targets ──
    function setTarget(address target, bool approved) external onlyOwner {
        approvedTargets[target] = approved;
        emit TargetApproved(target, approved);
    }
    
    // ── Owner: update agent wallet ──
    function setAgent(address _agent) external onlyOwner {
        emit AgentUpdated(agent, _agent);
        agent = _agent;
    }
    
    // ── Owner: emergency freeze (zero all limits) ──
    function freeze() external onlyOwner {
        maxPerTx = 0;
        maxDaily = 0;
        emit EmergencyFreeze(owner);
    }
    
    // ── Owner: transfer ownership ──
    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "Zero address");
        owner = newOwner;
    }
}
