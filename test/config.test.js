import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { config } from '../src/config.js';

describe('Config', () => {
  it('has required chain config', () => {
    assert.equal(config.chain.name, 'base');
    assert.equal(config.chain.chainId, 8453);
    assert.ok(config.chain.rpc);
    assert.ok(config.chain.explorer);
  });

  it('has agent address', () => {
    assert.ok(config.agentAddress);
    assert.match(config.agentAddress, /^0x[a-fA-F0-9]{40}$/);
  });

  it('has ERC-8004 tx hash', () => {
    assert.ok(config.erc8004TxHash);
    assert.match(config.erc8004TxHash, /^0x[a-fA-F0-9]{64}$/);
  });

  it('has token addresses', () => {
    assert.ok(config.tokens.WETH);
    assert.ok(config.tokens.USDC);
    assert.ok(config.tokens.DAI);
  });

  it('has spending limits', () => {
    assert.ok(parseFloat(config.spending.maxPerTx) > 0);
    assert.ok(parseFloat(config.spending.maxDaily) > 0);
    assert.ok(config.spending.cooldownMs > 0);
  });

  it('has scan config', () => {
    assert.ok(config.scan.intervalMs > 0);
    assert.ok(config.scan.minProfitBps > 0);
    assert.ok(config.scan.pairs.length > 0);
  });

  it('has LLM provider config', () => {
    assert.ok(config.llm.bankrGateway);
    assert.ok(config.llm.openaiGateway);
    assert.ok(config.llm.anthropicGateway);
    assert.ok(config.llm.openrouterGateway);
    assert.ok(config.llm.ollamaUrl);
  });

  it('has orchestrator config', () => {
    assert.equal(typeof config.orchestrator.enabled, 'boolean');
    assert.equal(typeof config.orchestrator.selfFulfill, 'boolean');
  });

  it('has cards config', () => {
    assert.ok(config.cards.apiUrl);
    assert.ok(config.cards.minUsdcForCard > 0);
  });

  it('has mail config section', () => {
    assert.ok('mail' in config);
    assert.equal(typeof config.mail, 'object');
  });
});
