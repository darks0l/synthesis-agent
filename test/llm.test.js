import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { LLMGateway } from '../src/llm.js';

describe('LLMGateway', () => {
  it('initializes and detects available providers', () => {
    const llm = new LLMGateway();
    assert.equal(typeof llm.available, 'boolean');
    assert.equal(typeof llm.providerName, 'string');
  });

  it('fallback heuristic approves high spread', () => {
    const llm = new LLMGateway();
    const result = llm._fallbackAnalysis('Found opportunity: 50 bps spread');
    const parsed = JSON.parse(result);
    assert.equal(parsed.execute, true);
    assert.equal(parsed.confidence, 65);
  });

  it('fallback heuristic rejects low spread', () => {
    const llm = new LLMGateway();
    const result = llm._fallbackAnalysis('Found opportunity: 20 bps spread');
    const parsed = JSON.parse(result);
    assert.equal(parsed.execute, false);
    assert.equal(parsed.confidence, 40);
  });

  it('fallback heuristic handles no bps in prompt', () => {
    const llm = new LLMGateway();
    const result = llm._fallbackAnalysis('No numbers here');
    const parsed = JSON.parse(result);
    assert.equal(parsed.execute, false);
  });

  it('returns stats', () => {
    const llm = new LLMGateway();
    const stats = llm.stats();
    assert.equal(stats.calls, 0);
    assert.equal(stats.tokens, 0);
    assert.ok('breakdown' in stats);
  });
});
