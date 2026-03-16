import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { FeedbackLoop } from '../src/feedback.js';

describe('FeedbackLoop', () => {
  let feedback;

  beforeEach(() => {
    feedback = new FeedbackLoop();
    // Reset in-memory state
    feedback.tradeHistory = [];
    feedback.learnings = {
      minSpreadBps: 40,
      confidenceBoost: 0,
      providerScores: {},
      pairInsights: {},
      totalEvaluations: 0,
      improvementsAdopted: 0,
    };
  });

  it('records a trade', () => {
    const record = feedback.recordTrade({
      pair: 'WETH/USDC',
      spreadBps: 50,
      decision: 'execute',
      confidence: 70,
      txHash: '0xabc123',
      amountIn: '0.001',
    });

    assert.equal(record.pair, 'WETH/USDC');
    assert.equal(record.spreadBps, 50);
    assert.equal(feedback.tradeHistory.length, 1);
  });

  it('updates pair insights on trade', () => {
    feedback.recordTrade({ pair: 'WETH/USDC', spreadBps: 45, decision: 'execute' });
    feedback.recordTrade({ pair: 'WETH/USDC', spreadBps: 55, decision: 'execute' });

    const insights = feedback.learnings.pairInsights['WETH/USDC'];
    assert.equal(insights.trades, 2);
    assert.equal(insights.avgSpread, 50); // (45+55)/2
  });

  it('evaluates outsourced result — accepts valid response', () => {
    const result = feedback.evaluateOutsourcedResult(
      { execute: true, confidence: 75, reasoning: 'Good spread with deep liquidity' },
      { pair: 'WETH/USDC', spreadBps: 50 }
    );

    assert.equal(result.accept, true);
    assert.ok(['acceptable', 'good_with_insight'].includes(result.quality));
  });

  it('rejects malformed outsourced result', () => {
    const result = feedback.evaluateOutsourcedResult(
      { foo: 'bar' }, // missing execute and confidence
      { pair: 'WETH/USDC', spreadBps: 50 }
    );

    assert.equal(result.accept, false);
    assert.equal(result.quality, 'malformed');
  });

  it('rejects unparseable outsourced result', () => {
    const result = feedback.evaluateOutsourcedResult(
      'not json at all {{{{',
      { pair: 'WETH/USDC', spreadBps: 50 }
    );

    assert.equal(result.accept, false);
    assert.equal(result.quality, 'unparseable');
  });

  it('scores providers', () => {
    feedback.scoreProvider('0xabc', true);
    feedback.scoreProvider('0xabc', true);
    feedback.scoreProvider('0xabc', false);

    const scores = feedback.learnings.providerScores['0xabc'];
    assert.equal(scores.good, 2);
    assert.equal(scores.bad, 1);
  });

  it('records trade outcome and updates insights', () => {
    feedback.recordTrade({
      pair: 'WETH/USDC',
      spreadBps: 50,
      decision: 'execute',
      txHash: '0xabc',
    });

    feedback.recordOutcome('0xabc', true);

    const pi = feedback.learnings.pairInsights['WETH/USDC'];
    assert.equal(pi.wins, 1);
    assert.equal(pi.lastOutcome, 'win');
  });

  it('caps trade history at 500', () => {
    for (let i = 0; i < 550; i++) {
      feedback.recordTrade({ pair: 'WETH/USDC', spreadBps: 50, decision: 'skip' });
    }
    assert.equal(feedback.tradeHistory.length, 500);
  });

  it('expected confidence scales with spread', () => {
    assert.ok(feedback._expectedConfidence(100) > feedback._expectedConfidence(30));
    assert.ok(feedback._expectedConfidence(60) > feedback._expectedConfidence(20));
  });

  it('returns stats', () => {
    const stats = feedback.stats();
    assert.equal(typeof stats.totalTrades, 'number');
    assert.equal(typeof stats.currentMinSpreadBps, 'number');
    assert.ok('providerScores' in stats);
    assert.ok('pairInsights' in stats);
  });
});
