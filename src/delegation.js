// ── MetaMask Delegation Framework Integration ──────────────────────
// Creates EIP-712 signed delegations using MetaMask's deployed
// DelegationManager and Caveat Enforcers on Base.
//
// Our agent creates delegations that encode spending policy as
// MetaMask-native caveats — AllowedTargets, ERC20TransferAmount,
// and Timestamp enforcers. These delegations can be shared with
// sub-agents or verified by any MetaMask-compatible system.

import { ethers } from 'ethers';
import { config } from './config.js';
import { log, logError, logWarn } from './logger.js';

// ── MetaMask Delegation Framework v1.3.0 on Base ──
const DELEGATION_MANAGER = '0xdb9B1e94B5b69Df7e401DDbedE43491141047dB3';
const ENFORCERS = {
  AllowedTargets:        '0x7F20f61b1f09b08D970938F6fa563634d65c4EeB',
  AllowedMethods:        '0x2c21fD0Cb9DC8445CB3fb0DC5E7Bb0Aca01842B5',
  ERC20TransferAmount:   '0xf100b0819427117EcF76Ed94B358B1A5b5C6D2Fc',
  NativeTokenTransfer:   '0xF71af580b9c3078fbc2BBF16FbB8EEd82b330320',
  LimitedCalls:          '0x04658B29F6b82ed55274221a06Fc97D318E25416',
  Timestamp:             '0x1046bb45C8d673d4ea75321280DB34899413c069',
  ValueLte:              '0x92bF12322527cAa612fD31a0e810472bBf106a8f',
};

// Root authority constant (self-signed, no parent delegation)
const ROOT_AUTHORITY = '0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff';
// Open delegate (any redeemer, protected by caveats)
const OPEN_DELEGATE = '0x000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000a11';
const ANY_DELEGATE = '0x0000000000000000000000000000000000000a11';

const DELEGATION_MANAGER_ABI = [
  'function getDomainHash() view returns (bytes32)',
  'function getDelegationHash((address delegate, address delegator, bytes32 authority, (address enforcer, bytes terms, bytes args)[] caveats, uint256 salt, bytes signature)) pure returns (bytes32)',
  'function disabledDelegations(bytes32) view returns (bool)',
  'function enableDelegation((address delegate, address delegator, bytes32 authority, (address enforcer, bytes terms, bytes args)[] caveats, uint256 salt, bytes signature))',
  'function disableDelegation((address delegate, address delegator, bytes32 authority, (address enforcer, bytes terms, bytes args)[] caveats, uint256 salt, bytes signature))',
  'event EnabledDelegation(bytes32 indexed delegationHash, address indexed delegator, address indexed delegate, (address delegate, address delegator, bytes32 authority, (address enforcer, bytes terms, bytes args)[] caveats, uint256 salt, bytes signature) delegation)',
  'event DisabledDelegation(bytes32 indexed delegationHash, address indexed delegator, address indexed delegate, (address delegate, address delegator, bytes32 authority, (address enforcer, bytes terms, bytes args)[] caveats, uint256 salt, bytes signature) delegation)',
];

// EIP-712 types for the Delegation struct
const DELEGATION_TYPEHASH = {
  Delegation: [
    { name: 'delegate',  type: 'address'  },
    { name: 'delegator', type: 'address'  },
    { name: 'authority', type: 'bytes32'  },
    { name: 'caveats',   type: 'Caveat[]' },
    { name: 'salt',      type: 'uint256'  },
  ],
  Caveat: [
    { name: 'enforcer', type: 'address' },
    { name: 'terms',    type: 'bytes'   },
  ],
};

export class DelegationManager {
  constructor(provider) {
    this.provider = provider;
    this.contract = new ethers.Contract(DELEGATION_MANAGER, DELEGATION_MANAGER_ABI, provider);
    this.delegations = [];     // signed delegations we've created
    this.domainHash = null;
    this.domainData = null;
  }

  // ── Initialize: fetch EIP-712 domain from deployed contract ──
  async init() {
    try {
      this.domainHash = await this.contract.getDomainHash();
      // EIP-712 domain for the DelegationManager on Base
      this.domainData = {
        name: 'DelegationManager',
        version: '1',
        chainId: config.chain.chainId,
        verifyingContract: DELEGATION_MANAGER,
      };
      log('DELEGATION', `MetaMask Delegation Framework connected — DelegationManager: ${DELEGATION_MANAGER}`);
      log('DELEGATION', `Domain hash: ${this.domainHash}`);
      log('DELEGATION', `Enforcers: ${Object.keys(ENFORCERS).length} caveat enforcers available`);
      return true;
    } catch (err) {
      logError('DELEGATION', `Failed to initialize: ${err.message}`);
      return false;
    }
  }

  // ── Encode caveat terms ──

  /**
   * AllowedTargetsEnforcer terms: packed array of 20-byte addresses
   */
  encodeAllowedTargets(addresses) {
    return ethers.concat(addresses.map(a => ethers.zeroPadValue(a, 20)));
  }

  /**
   * ERC20TransferAmountEnforcer terms: address(20) + uint256(32) = 52 bytes
   */
  encodeERC20TransferLimit(tokenAddress, maxAmount) {
    return ethers.concat([
      ethers.zeroPadValue(tokenAddress, 20),
      ethers.zeroPadValue(ethers.toBeHex(maxAmount), 32),
    ]);
  }

  /**
   * TimestampEnforcer terms: uint128 afterTimestamp + uint128 beforeTimestamp
   */
  encodeTimestamp(afterTs, beforeTs) {
    const after = ethers.zeroPadValue(ethers.toBeHex(afterTs), 16);
    const before = ethers.zeroPadValue(ethers.toBeHex(beforeTs), 16);
    return ethers.concat([after, before]);
  }

  /**
   * ValueLteEnforcer terms: uint256 maxValue
   */
  encodeValueLte(maxWei) {
    return ethers.zeroPadValue(ethers.toBeHex(maxWei), 32);
  }

  /**
   * LimitedCallsEnforcer terms: uint256 maxCalls
   */
  encodeLimitedCalls(maxCalls) {
    return ethers.zeroPadValue(ethers.toBeHex(maxCalls), 32);
  }

  // ── Build our agent's spending policy as MetaMask caveats ──
  buildSpendingPolicyCaveats() {
    const caveats = [];

    // 1. AllowedTargets — only Uniswap SwapRouter02 + Aerodrome Router
    const allowedTargets = [
      config.uniswap.routerV3,                                    // Uniswap SwapRouter02
      '0xcF77a3Ba9A5CA399B7c97c74d54e5b1Beb874E43',              // Aerodrome Router
    ];
    caveats.push({
      enforcer: ENFORCERS.AllowedTargets,
      terms: this.encodeAllowedTargets(allowedTargets),
      args: '0x',
    });

    // 2. ERC20TransferAmount — max 2 USDC per delegation redemption
    const maxUsdc = ethers.parseUnits(config.spending.maxPerTx, 6);
    caveats.push({
      enforcer: ENFORCERS.ERC20TransferAmount,
      terms: this.encodeERC20TransferLimit(config.tokens.USDC, maxUsdc),
      args: '0x',
    });

    // 3. ValueLte — max 0.01 ETH per call (for gas-bounded execution)
    const maxEth = ethers.parseEther('0.01');
    caveats.push({
      enforcer: ENFORCERS.ValueLte,
      terms: this.encodeValueLte(maxEth),
      args: '0x',
    });

    // 4. LimitedCalls — max 20 redemptions (matches daily trade limit)
    caveats.push({
      enforcer: ENFORCERS.LimitedCalls,
      terms: this.encodeLimitedCalls(20),
      args: '0x',
    });

    // 5. Timestamp — valid for 24 hours from creation
    const now = Math.floor(Date.now() / 1000);
    const expiry = now + 86400; // 24h window
    caveats.push({
      enforcer: ENFORCERS.Timestamp,
      terms: this.encodeTimestamp(now, expiry),
      args: '0x',
    });

    return caveats;
  }

  // ── Create and sign a delegation ──
  async createDelegation(signer, opts = {}) {
    const delegator = await signer.getAddress();
    const delegate = opts.delegate || ANY_DELEGATE; // Open delegation by default
    const caveats = opts.caveats || this.buildSpendingPolicyCaveats();
    const salt = opts.salt || BigInt(Date.now());

    // Build the delegation struct (unsigned)
    const delegation = {
      delegate,
      delegator,
      authority: ROOT_AUTHORITY,
      caveats: caveats.map(c => ({
        enforcer: c.enforcer,
        terms: c.terms,
        args: c.args || '0x',
      })),
      salt,
      signature: '0x',
    };

    // Sign via EIP-712
    try {
      // For EIP-712 signing, caveats only include enforcer + terms (not args)
      const signable = {
        delegate: delegation.delegate,
        delegator: delegation.delegator,
        authority: delegation.authority,
        caveats: delegation.caveats.map(c => ({
          enforcer: c.enforcer,
          terms: c.terms,
        })),
        salt: delegation.salt,
      };

      const signature = await signer.signTypedData(
        this.domainData,
        DELEGATION_TYPEHASH,
        signable,
      );

      delegation.signature = signature;

      // Get the delegation hash from the contract
      const delegationForHash = {
        delegate: delegation.delegate,
        delegator: delegation.delegator,
        authority: delegation.authority,
        caveats: delegation.caveats,
        salt: delegation.salt,
        signature: delegation.signature,
      };

      let delegationHash;
      try {
        delegationHash = await this.contract.getDelegationHash(delegationForHash);
      } catch {
        // If contract call fails, compute locally
        delegationHash = ethers.keccak256(ethers.toUtf8Bytes(JSON.stringify({
          delegate, delegator, authority: ROOT_AUTHORITY, salt: salt.toString(),
          caveats: caveats.map(c => c.enforcer),
        })));
      }

      const record = {
        delegation,
        delegationHash,
        createdAt: new Date().toISOString(),
        caveatsDescribed: this._describeCaveats(caveats),
        delegate,
        delegator,
        status: 'active',
      };

      this.delegations.push(record);

      log('DELEGATION', `✅ Delegation created and signed`);
      log('DELEGATION', `   Hash: ${delegationHash}`);
      log('DELEGATION', `   Delegator: ${delegator}`);
      log('DELEGATION', `   Delegate: ${delegate === ANY_DELEGATE ? 'OPEN (any redeemer)' : delegate}`);
      log('DELEGATION', `   Caveats: ${caveats.length}`);
      for (const desc of record.caveatsDescribed) {
        log('DELEGATION', `     → ${desc}`);
      }

      return record;
    } catch (err) {
      logError('DELEGATION', `Failed to sign delegation: ${err.message}`);
      return null;
    }
  }

  // ── Check if a delegation is still valid (not disabled on-chain) ──
  async isDelegationActive(delegationHash) {
    try {
      const disabled = await this.contract.disabledDelegations(delegationHash);
      return !disabled;
    } catch (err) {
      logWarn('DELEGATION', `Cannot check delegation status: ${err.message}`);
      return null;
    }
  }

  // ── Create a sub-agent delegation with tighter caveats ──
  async createSubAgentDelegation(signer, subAgentAddress, opts = {}) {
    const maxUsdc = ethers.parseUnits(opts.maxUsdc || '1.0', 6);
    const maxCalls = opts.maxCalls || 5;
    const ttlSeconds = opts.ttlSeconds || 3600; // 1 hour default

    const now = Math.floor(Date.now() / 1000);
    const caveats = [
      {
        enforcer: ENFORCERS.AllowedTargets,
        terms: this.encodeAllowedTargets([config.uniswap.routerV3]),
        args: '0x',
      },
      {
        enforcer: ENFORCERS.ERC20TransferAmount,
        terms: this.encodeERC20TransferLimit(config.tokens.USDC, maxUsdc),
        args: '0x',
      },
      {
        enforcer: ENFORCERS.LimitedCalls,
        terms: this.encodeLimitedCalls(maxCalls),
        args: '0x',
      },
      {
        enforcer: ENFORCERS.Timestamp,
        terms: this.encodeTimestamp(now, now + ttlSeconds),
        args: '0x',
      },
    ];

    log('DELEGATION', `Creating sub-agent delegation for ${subAgentAddress}`);
    return this.createDelegation(signer, {
      delegate: subAgentAddress,
      caveats,
    });
  }

  // ── Enable delegation on-chain (creates tx receipt) ──
  async enableOnChain(signer, delegationRecord) {
    const d = delegationRecord.delegation;
    const delegationTuple = {
      delegate: d.delegate,
      delegator: d.delegator,
      authority: d.authority,
      caveats: d.caveats.map(c => ({
        enforcer: c.enforcer,
        terms: c.terms,
        args: c.args || '0x',
      })),
      salt: d.salt,
      signature: d.signature,
    };

    try {
      const contract = this.contract.connect(signer);
      log('DELEGATION', `📝 Enabling delegation on-chain: ${delegationRecord.delegationHash}`);
      // Explicitly fetch nonce to avoid stale cache after prior TXs
      const nonce = await signer.provider.getTransactionCount(await signer.getAddress(), 'latest');
      const tx = await contract.enableDelegation(delegationTuple, { nonce });
      log('DELEGATION', `⏳ TX submitted: ${tx.hash}`);
      const receipt = await tx.wait();
      log('DELEGATION', `✅ Delegation enabled on-chain!`);
      log('DELEGATION', `   TX: ${receipt.hash}`);
      log('DELEGATION', `   Block: ${receipt.blockNumber}`);
      log('DELEGATION', `   Gas: ${receipt.gasUsed.toString()}`);

      delegationRecord.enableTxHash = receipt.hash;
      delegationRecord.enableBlock = receipt.blockNumber;
      delegationRecord.status = 'enabled_onchain';

      return {
        success: true,
        txHash: receipt.hash,
        blockNumber: receipt.blockNumber,
        gasUsed: receipt.gasUsed.toString(),
      };
    } catch (err) {
      logError('DELEGATION', `Enable on-chain failed: ${err.message}`);
      return { success: false, error: err.message };
    }
  }

  // ── Disable delegation on-chain (creates tx receipt) ──
  async disableOnChain(signer, delegationRecord) {
    const d = delegationRecord.delegation;
    const delegationTuple = {
      delegate: d.delegate,
      delegator: d.delegator,
      authority: d.authority,
      caveats: d.caveats.map(c => ({
        enforcer: c.enforcer,
        terms: c.terms,
        args: c.args || '0x',
      })),
      salt: d.salt,
      signature: d.signature,
    };

    try {
      const contract = this.contract.connect(signer);
      log('DELEGATION', `🔒 Disabling delegation on-chain: ${delegationRecord.delegationHash}`);
      const tx = await contract.disableDelegation(delegationTuple);
      log('DELEGATION', `⏳ TX submitted: ${tx.hash}`);
      const receipt = await tx.wait();
      log('DELEGATION', `✅ Delegation disabled on-chain!`);
      log('DELEGATION', `   TX: ${receipt.hash}`);
      log('DELEGATION', `   Block: ${receipt.blockNumber}`);
      log('DELEGATION', `   Gas: ${receipt.gasUsed.toString()}`);

      delegationRecord.disableTxHash = receipt.hash;
      delegationRecord.disableBlock = receipt.blockNumber;
      delegationRecord.status = 'disabled';

      return {
        success: true,
        txHash: receipt.hash,
        blockNumber: receipt.blockNumber,
        gasUsed: receipt.gasUsed.toString(),
      };
    } catch (err) {
      logError('DELEGATION', `Disable on-chain failed: ${err.message}`);
      return { success: false, error: err.message };
    }
  }

  // ── Full lifecycle: create → disable → enable → verify ──
  // Fresh delegations are AlreadyEnabled by default, so we disable first, then re-enable.
  async runFullLifecycle(signer) {
    const results = { steps: [], txHashes: [] };

    log('DELEGATION', '═══ Full Lifecycle Test ═══');

    // ── Delegation 1: Spending policy (open delegate) ──
    log('DELEGATION', '─── Delegation 1: Spending Policy ───');
    const record1 = await this.createDelegation(signer);
    if (!record1) {
      results.steps.push({ step: 'create_1', success: false });
      return results;
    }
    results.steps.push({ step: 'create_1', success: true, hash: record1.delegationHash });

    // Verify active by default
    const check1a = await this.isDelegationActive(record1.delegationHash);
    log('DELEGATION', `Initial status: ${check1a ? 'active ✅' : 'disabled'}`);
    results.steps.push({ step: 'verify_1_active', active: check1a });

    // Disable (TX #1)
    const disable1 = await this.disableOnChain(signer, record1);
    results.steps.push({ step: 'disable_1', ...disable1 });
    if (disable1.txHash) results.txHashes.push(disable1.txHash);

    // Wait for RPC to catch up
    await new Promise(r => setTimeout(r, 2000));

    // Re-enable (TX #2)
    const enable1 = await this.enableOnChain(signer, record1);
    results.steps.push({ step: 'enable_1', ...enable1 });
    if (enable1.txHash) results.txHashes.push(enable1.txHash);

    // Verify final state
    await new Promise(r => setTimeout(r, 1000));
    const check1b = await this.isDelegationActive(record1.delegationHash);
    log('DELEGATION', `Final status: ${check1b ? 'active ✅' : 'disabled ❌'}`);
    results.steps.push({ step: 'verify_1_final', active: check1b });

    // ── Delegation 2: Sub-agent delegation (specific delegate) ──
    log('DELEGATION', '─── Delegation 2: Sub-Agent ───');
    // Use a dummy sub-agent address for testing
    const subAgentAddr = '0x0000000000000000000000000000000000000042';
    const record2 = await this.createSubAgentDelegation(signer, subAgentAddr, {
      maxUsdc: '1.0',
      maxCalls: 5,
      ttlSeconds: 3600,
    });
    if (!record2) {
      results.steps.push({ step: 'create_2', success: false });
    } else {
      results.steps.push({ step: 'create_2', success: true, hash: record2.delegationHash });

      // Disable sub-agent delegation (TX #3)
      const disable2 = await this.disableOnChain(signer, record2);
      results.steps.push({ step: 'disable_2', ...disable2 });
      if (disable2.txHash) results.txHashes.push(disable2.txHash);
    }

    log('DELEGATION', `═══ Lifecycle Complete: ${results.txHashes.length} on-chain TXs ═══`);
    for (const tx of results.txHashes) {
      log('DELEGATION', `   🔗 ${config.chain.explorer}/tx/${tx}`);
    }

    return results;
  }

  // ── Describe caveats in human-readable form ──
  _describeCaveats(caveats) {
    return caveats.map(c => {
      if (c.enforcer === ENFORCERS.AllowedTargets) {
        return 'AllowedTargets: Uniswap SwapRouter02 + Aerodrome Router';
      }
      if (c.enforcer === ENFORCERS.ERC20TransferAmount) {
        return `ERC20TransferLimit: max ${config.spending.maxPerTx} USDC per redemption`;
      }
      if (c.enforcer === ENFORCERS.ValueLte) {
        return 'ValueLte: max 0.01 ETH per call';
      }
      if (c.enforcer === ENFORCERS.LimitedCalls) {
        return 'LimitedCalls: max 20 redemptions per delegation';
      }
      if (c.enforcer === ENFORCERS.Timestamp) {
        return 'Timestamp: 24-hour validity window';
      }
      if (c.enforcer === ENFORCERS.AllowedMethods) {
        return 'AllowedMethods: restricted function selectors';
      }
      return `Caveat: ${c.enforcer}`;
    });
  }

  // ── Get status report ──
  getStatus() {
    return {
      connected: !!this.domainHash,
      delegationManager: DELEGATION_MANAGER,
      domainHash: this.domainHash,
      enforcersAvailable: Object.keys(ENFORCERS).length,
      activeDelegations: this.delegations.filter(d => d.status === 'active').length,
      totalDelegations: this.delegations.length,
      delegations: this.delegations.map(d => ({
        hash: d.delegationHash,
        delegate: d.delegate === ANY_DELEGATE ? 'open' : d.delegate,
        caveats: d.caveatsDescribed,
        status: d.status,
        createdAt: d.createdAt,
      })),
    };
  }
}
