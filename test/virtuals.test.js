import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

describe('VirtualsACP', () => {
  it('should export VirtualsACP class', async () => {
    const { VirtualsACP } = await import('../src/virtuals.js');
    assert.ok(VirtualsACP);
    assert.equal(typeof VirtualsACP, 'function');
  });

  it('should initialize as disabled when not configured', async () => {
    const { VirtualsACP } = await import('../src/virtuals.js');
    const acp = new VirtualsACP();
    assert.equal(acp.enabled, false);
    assert.equal(acp.initialized, false);
  });

  it('should return empty array for browseAgents when disabled', async () => {
    const { VirtualsACP } = await import('../src/virtuals.js');
    const acp = new VirtualsACP();
    const agents = await acp.browseAgents('trading');
    assert.deepEqual(agents, []);
  });

  it('should return null for postJob when disabled', async () => {
    const { VirtualsACP } = await import('../src/virtuals.js');
    const acp = new VirtualsACP();
    const result = await acp.postJob({ provider: '0x123', description: 'test', budgetUSDC: 1 });
    assert.equal(result, null);
  });

  it('should return correct config info', async () => {
    const { VirtualsACP } = await import('../src/virtuals.js');
    const info = VirtualsACP.getConfigInfo();
    assert.equal(info.contractAddress, '0xa6C9BA866992cfD7fd6460ba912bfa405adA9df0');
    assert.equal(info.network, 'Base mainnet');
    assert.equal(info.sdk, '@virtuals-protocol/acp-node');
    assert.ok(info.registryUrl.includes('virtuals.io'));
  });

  it('should return summary string when disabled', async () => {
    const { VirtualsACP } = await import('../src/virtuals.js');
    const acp = new VirtualsACP();
    const summary = acp.summary();
    assert.ok(summary.includes('disabled'));
  });

  it('should track stats correctly', async () => {
    const { VirtualsACP } = await import('../src/virtuals.js');
    const acp = new VirtualsACP();
    assert.equal(acp.stats.jobsPosted, 0);
    assert.equal(acp.stats.jobsReceived, 0);
    assert.equal(acp.stats.agentsDiscovered, 0);
  });
});
