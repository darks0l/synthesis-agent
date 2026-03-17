// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title SynthesisIdentity — Lightweight on-chain identity + receipt log for Status Network
/// @notice Deployed gaslessly on Status Network Sepolia as part of The Synthesis Hackathon
contract SynthesisIdentity {
    address public immutable agent;
    string public name;
    string public identityHash; // ERC-8004 tx hash reference
    uint256 public receiptsCount;

    struct Receipt {
        string action;
        uint256 amount;
        uint256 timestamp;
    }

    Receipt[] public receipts;

    event ReceiptLogged(address indexed agent, string action, uint256 amount, uint256 timestamp);
    event IdentityUpdated(string field, string value);

    modifier onlyAgent() {
        require(msg.sender == agent, "Not agent");
        _;
    }

    constructor(string memory _name, string memory _identityHash) {
        agent = msg.sender;
        name = _name;
        identityHash = _identityHash;
    }

    function logReceipt(string calldata _action, uint256 _amount) external onlyAgent {
        receipts.push(Receipt(_action, _amount, block.timestamp));
        receiptsCount++;
        emit ReceiptLogged(agent, _action, _amount, block.timestamp);
    }

    function updateName(string calldata _name) external onlyAgent {
        name = _name;
        emit IdentityUpdated("name", _name);
    }

    function getReceipt(uint256 _index) external view returns (string memory action, uint256 amount, uint256 timestamp) {
        Receipt storage r = receipts[_index];
        return (r.action, r.amount, r.timestamp);
    }
}
