// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @title SynthesisJobs — ERC-8183 Agentic Commerce for Synthesis Agent
/// @notice Minimal job escrow where the agent outsources skills to other agents.
///         Each job is a task the agent needs done (trade eval, market scan, risk check).
///         Providers bid, submit work, evaluator attests, payment releases.
///         All participants are ERC-8004 identified agents.
/// @dev Implements the ERC-8183 state machine: Open → Funded → Submitted → Terminal
///      with on-chain price discovery for agent labor costs.

contract SynthesisJobs {
    using SafeERC20 for IERC20;

    // ── Types ───────────────────────────────────────────────────────

    enum Status { Open, Funded, Submitted, Completed, Rejected, Expired }

    enum SkillType { TradeEval, MarketScan, RiskAssess, PriceQuote, Custom }

    struct Job {
        address client;       // agent posting the job
        address provider;     // agent doing the work (0 = open bid)
        address evaluator;    // attester (can be client)
        string  description;  // task brief
        SkillType skillType;  // what kind of work
        uint256 budget;       // USDC amount escrowed
        uint256 expiredAt;    // deadline timestamp
        Status  status;
        bytes32 deliverable;  // hash of submitted work
        bytes32 attestation;  // evaluator's reason hash
        uint256 createdAt;
        uint256 completedAt;
    }

    // ── State ───────────────────────────────────────────────────────

    IERC20 public immutable paymentToken; // USDC
    uint256 public jobCount;
    mapping(uint256 => Job) public jobs;

    // Price discovery: running averages per skill type
    mapping(SkillType => uint256) public totalPaidBySkill;
    mapping(SkillType => uint256) public jobsCompletedBySkill;

    // Agent reputation: jobs completed per provider
    mapping(address => uint256) public providerCompletions;
    mapping(address => uint256) public providerRejections;

    // Platform fee (bps, e.g. 100 = 1%)
    uint256 public constant FEE_BPS = 0; // No fees for hackathon
    address public owner;

    // ── Events ──────────────────────────────────────────────────────

    event JobCreated(uint256 indexed jobId, address indexed client, SkillType skillType, uint256 budget, string description);
    event JobFunded(uint256 indexed jobId, uint256 amount);
    event ProviderSet(uint256 indexed jobId, address indexed provider);
    event BudgetSet(uint256 indexed jobId, uint256 amount);
    event JobSubmitted(uint256 indexed jobId, address indexed provider, bytes32 deliverable);
    event JobCompleted(uint256 indexed jobId, address indexed provider, uint256 payout, bytes32 attestation);
    event JobRejected(uint256 indexed jobId, bytes32 reason);
    event JobExpired(uint256 indexed jobId);

    // ── Constructor ─────────────────────────────────────────────────

    constructor(address _paymentToken) {
        paymentToken = IERC20(_paymentToken);
        owner = msg.sender;
    }

    // ── Core Functions (ERC-8183 compliant) ─────────────────────────

    /// @notice Create a job. Provider can be address(0) for open bidding.
    function createJob(
        address provider,
        address evaluator,
        uint256 expiredAt,
        string calldata description,
        SkillType skillType,
        uint256 budget
    ) external returns (uint256 jobId) {
        require(evaluator != address(0), "evaluator required");
        require(expiredAt > block.timestamp, "expiredAt must be future");
        require(budget > 0, "budget must be > 0");

        jobId = jobCount++;
        jobs[jobId] = Job({
            client: msg.sender,
            provider: provider,
            evaluator: evaluator,
            description: description,
            skillType: skillType,
            budget: budget,
            expiredAt: expiredAt,
            status: Status.Open,
            deliverable: bytes32(0),
            attestation: bytes32(0),
            createdAt: block.timestamp,
            completedAt: 0
        });

        emit JobCreated(jobId, msg.sender, skillType, budget, description);
    }

    /// @notice Set provider on an open job (client only, provider must be 0)
    function setProvider(uint256 jobId, address provider) external {
        Job storage job = jobs[jobId];
        require(msg.sender == job.client, "only client");
        require(job.status == Status.Open, "not open");
        require(job.provider == address(0), "provider already set");
        require(provider != address(0), "zero address");
        job.provider = provider;
        emit ProviderSet(jobId, provider);
    }

    /// @notice Set or negotiate budget (client or provider)
    function setBudget(uint256 jobId, uint256 amount) external {
        Job storage job = jobs[jobId];
        require(job.status == Status.Open, "not open");
        require(msg.sender == job.client || msg.sender == job.provider, "not authorized");
        require(amount > 0, "budget must be > 0");
        job.budget = amount;
        emit BudgetSet(jobId, amount);
    }

    /// @notice Fund the job — pulls budget from client into escrow
    function fund(uint256 jobId, uint256 expectedBudget) external {
        Job storage job = jobs[jobId];
        require(msg.sender == job.client, "only client");
        require(job.status == Status.Open, "not open");
        require(job.provider != address(0), "provider not set");
        require(job.budget == expectedBudget, "budget mismatch");

        paymentToken.safeTransferFrom(msg.sender, address(this), job.budget);
        job.status = Status.Funded;

        emit JobFunded(jobId, job.budget);
    }

    /// @notice Create + fund in one call (convenience for known provider)
    function createAndFund(
        address provider,
        address evaluator,
        uint256 expiredAt,
        string calldata description,
        SkillType skillType,
        uint256 budget
    ) external returns (uint256 jobId) {
        require(provider != address(0), "provider required for instant fund");
        jobId = this.createJob(provider, evaluator, expiredAt, description, skillType, budget);
        // Fund requires approval beforehand
        paymentToken.safeTransferFrom(msg.sender, address(this), budget);
        jobs[jobId].status = Status.Funded;
        emit JobFunded(jobId, budget);
    }

    /// @notice Provider submits completed work
    function submit(uint256 jobId, bytes32 deliverable) external {
        Job storage job = jobs[jobId];
        require(msg.sender == job.provider, "only provider");
        require(job.status == Status.Funded, "not funded");
        require(block.timestamp < job.expiredAt, "expired");

        job.deliverable = deliverable;
        job.status = Status.Submitted;

        emit JobSubmitted(jobId, msg.sender, deliverable);
    }

    /// @notice Evaluator marks job completed — releases escrow to provider
    function complete(uint256 jobId, bytes32 reason) external {
        Job storage job = jobs[jobId];
        require(msg.sender == job.evaluator, "only evaluator");
        require(job.status == Status.Submitted, "not submitted");

        job.status = Status.Completed;
        job.attestation = reason;
        job.completedAt = block.timestamp;

        // Update price discovery
        totalPaidBySkill[job.skillType] += job.budget;
        jobsCompletedBySkill[job.skillType]++;

        // Update provider reputation
        providerCompletions[job.provider]++;

        // Transfer payment to provider
        paymentToken.safeTransfer(job.provider, job.budget);

        emit JobCompleted(jobId, job.provider, job.budget, reason);
    }

    /// @notice Evaluator or client rejects the job — refunds client
    function reject(uint256 jobId, bytes32 reason) external {
        Job storage job = jobs[jobId];

        if (job.status == Status.Open) {
            require(msg.sender == job.client, "only client can reject open");
        } else if (job.status == Status.Funded) {
            require(msg.sender == job.evaluator, "only evaluator when funded");
            paymentToken.safeTransfer(job.client, job.budget);
        } else if (job.status == Status.Submitted) {
            require(msg.sender == job.evaluator, "only evaluator when submitted");
            paymentToken.safeTransfer(job.client, job.budget);
            providerRejections[job.provider]++;
        } else {
            revert("cannot reject in terminal state");
        }

        job.status = Status.Rejected;
        job.attestation = reason;

        emit JobRejected(jobId, reason);
    }

    /// @notice Anyone can trigger refund after expiry
    function claimRefund(uint256 jobId) external {
        Job storage job = jobs[jobId];
        require(job.status == Status.Funded || job.status == Status.Submitted, "not refundable");
        require(block.timestamp >= job.expiredAt, "not expired yet");

        job.status = Status.Expired;
        paymentToken.safeTransfer(job.client, job.budget);

        emit JobExpired(jobId);
    }

    // ── Price Discovery (View Functions) ────────────────────────────

    /// @notice Average cost per skill type (USDC, raw units)
    function averageCost(SkillType skillType) external view returns (uint256) {
        uint256 count = jobsCompletedBySkill[skillType];
        if (count == 0) return 0;
        return totalPaidBySkill[skillType] / count;
    }

    /// @notice Provider success rate (bps, e.g. 9500 = 95%)
    function providerSuccessRate(address provider) external view returns (uint256) {
        uint256 total = providerCompletions[provider] + providerRejections[provider];
        if (total == 0) return 0;
        return (providerCompletions[provider] * 10000) / total;
    }

    /// @notice Get full job details
    function getJob(uint256 jobId) external view returns (Job memory) {
        return jobs[jobId];
    }
}
