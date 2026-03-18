import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import { ethers } from 'ethers';

// Import and test caveat encoding functions
describe('DelegationManager', () => {
  // We test the encoding functions directly since they're pure

  it('imports delegation module', async () => {
    const mod = await import('../src/delegation.js');
    assert.ok(mod.DelegationManager);
  });

  it('constructs with a provider', async () => {
    const { DelegationManager } = await import('../src/delegation.js');
    const provider = new ethers.JsonRpcProvider('https://1rpc.io/base');
    const mgr = new DelegationManager(provider);
    assert.ok(mgr);
    assert.ok(mgr.contract);
    assert.deepEqual(mgr.delegations, []);
  });

  it('encodes AllowedTargets correctly', async () => {
    const { DelegationManager } = await import('../src/delegation.js');
    const provider = new ethers.JsonRpcProvider('https://1rpc.io/base');
    const mgr = new DelegationManager(provider);

    const targets = [
      '0x2626664c2603336E57B271c5C0b26F421741e481',
      '0xcF77a3Ba9A5CA399B7c97c74d54e5b1Beb874E43',
    ];
    const encoded = mgr.encodeAllowedTargets(targets);
    assert.ok(encoded);
    // Each address is 20 bytes, so 2 addresses = 40 bytes
    const bytes = ethers.getBytes(encoded);
    assert.equal(bytes.length, 40);
  });

  it('encodes ERC20 transfer limit correctly', async () => {
    const { DelegationManager } = await import('../src/delegation.js');
    const provider = new ethers.JsonRpcProvider('https://1rpc.io/base');
    const mgr = new DelegationManager(provider);

    const usdc = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
    const maxAmount = ethers.parseUnits('2.0', 6); // 2 USDC
    const encoded = mgr.encodeERC20TransferLimit(usdc, maxAmount);
    assert.ok(encoded);
    // 20 bytes address + 32 bytes uint256 = 52 bytes
    const bytes = ethers.getBytes(encoded);
    assert.equal(bytes.length, 52);
  });

  it('encodes timestamp window correctly', async () => {
    const { DelegationManager } = await import('../src/delegation.js');
    const provider = new ethers.JsonRpcProvider('https://1rpc.io/base');
    const mgr = new DelegationManager(provider);

    const now = Math.floor(Date.now() / 1000);
    const expiry = now + 86400;
    const encoded = mgr.encodeTimestamp(now, expiry);
    assert.ok(encoded);
    // 16 + 16 = 32 bytes
    const bytes = ethers.getBytes(encoded);
    assert.equal(bytes.length, 32);
  });

  it('encodes limited calls correctly', async () => {
    const { DelegationManager } = await import('../src/delegation.js');
    const provider = new ethers.JsonRpcProvider('https://1rpc.io/base');
    const mgr = new DelegationManager(provider);

    const encoded = mgr.encodeLimitedCalls(20);
    assert.ok(encoded);
    const bytes = ethers.getBytes(encoded);
    assert.equal(bytes.length, 32);
  });

  it('builds spending policy caveats', async () => {
    const { DelegationManager } = await import('../src/delegation.js');
    const provider = new ethers.JsonRpcProvider('https://1rpc.io/base');
    const mgr = new DelegationManager(provider);

    const caveats = mgr.buildSpendingPolicyCaveats();
    assert.ok(Array.isArray(caveats));
    assert.equal(caveats.length, 5); // targets, erc20 limit, value lte, limited calls, timestamp
    // Each caveat has enforcer, terms, args
    for (const c of caveats) {
      assert.ok(c.enforcer);
      assert.ok(c.terms);
      assert.match(c.enforcer, /^0x[a-fA-F0-9]{40}$/);
    }
  });

  it('describes caveats in human-readable form', async () => {
    const { DelegationManager } = await import('../src/delegation.js');
    const provider = new ethers.JsonRpcProvider('https://1rpc.io/base');
    const mgr = new DelegationManager(provider);

    const caveats = mgr.buildSpendingPolicyCaveats();
    const descriptions = mgr._describeCaveats(caveats);
    assert.equal(descriptions.length, 5);
    assert.ok(descriptions[0].includes('AllowedTargets'));
    assert.ok(descriptions[1].includes('ERC20TransferLimit'));
    assert.ok(descriptions[2].includes('ValueLte'));
    assert.ok(descriptions[3].includes('LimitedCalls'));
    assert.ok(descriptions[4].includes('Timestamp'));
  });

  it('returns status report', async () => {
    const { DelegationManager } = await import('../src/delegation.js');
    const provider = new ethers.JsonRpcProvider('https://1rpc.io/base');
    const mgr = new DelegationManager(provider);

    const status = mgr.getStatus();
    assert.equal(status.connected, false); // not init'd yet
    assert.equal(status.delegationManager, '0xdb9B1e94B5b69Df7e401DDbedE43491141047dB3');
    assert.equal(status.enforcersAvailable, 7);
    assert.equal(status.totalDelegations, 0);
  });
});
