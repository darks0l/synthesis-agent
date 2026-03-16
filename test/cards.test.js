import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { CardManager } from '../src/cards.js';

describe('CardManager', () => {
  it('rejects when USDC balance too low', () => {
    const cards = new CardManager();
    const result = cards.shouldOrderCard(10, 0.01);
    assert.equal(result.should, false);
    assert.ok(result.reason.includes('below'));
  });

  it('rejects when ETH too low for gas', () => {
    const cards = new CardManager();
    const result = cards.shouldOrderCard(50, 0.0001);
    assert.equal(result.should, false);
    assert.ok(result.reason.includes('ETH'));
  });

  it('approves when balance sufficient', () => {
    const cards = new CardManager();
    const result = cards.shouldOrderCard(50, 0.01);
    assert.equal(result.should, true);
    assert.ok(result.amount > 0);
    assert.ok(result.amount <= 45); // 50 - 5 reserve
  });

  it('rounds down to $5 increments', () => {
    const cards = new CardManager();
    const result = cards.shouldOrderCard(33, 0.01);
    assert.equal(result.should, true);
    assert.equal(result.amount, 25); // (33-5) = 28, floor to 25
  });

  it('rejects when after reserve less than $10', () => {
    const cards = new CardManager();
    const result = cards.shouldOrderCard(26, 0.01);
    // 26 - 5 = 21, floor to 20 → should be true
    assert.equal(result.should, true);
    assert.equal(result.amount, 20);
  });

  it('tracks stats', () => {
    const cards = new CardManager();
    const stats = cards.getStats();
    assert.equal(stats.totalOrdered, 0);
    assert.equal(stats.orderCount, 0);
  });
});
