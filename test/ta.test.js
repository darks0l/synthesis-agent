import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { rsi, macd, bollingerBands, atr, stochastic, obv, vwap, fibonacci, supportResistance, detectDivergence, analyze, TAEngine } from '../src/ta.js';

// Generate fake candle data
function makeCandles(n = 100, basePrice = 2000) {
  const candles = [];
  let price = basePrice;
  for (let i = 0; i < n; i++) {
    const change = (Math.random() - 0.48) * 50; // slight upward bias
    price = Math.max(price + change, 100);
    const high = price + Math.random() * 30;
    const low = price - Math.random() * 30;
    candles.push({
      timestamp: Date.now() - (n - i) * 3600000,
      open: price - change / 2,
      high,
      low,
      close: price,
      volume: Math.random() * 1e6,
    });
  }
  return candles;
}

describe('RSI', () => {
  it('returns valid RSI for sufficient data', () => {
    const closes = makeCandles(50).map(c => c.close);
    const result = rsi(closes);
    assert.ok(result.value >= 0 && result.value <= 100, `RSI ${result.value} out of range`);
    assert.ok(['overbought', 'bullish', 'neutral', 'bearish', 'oversold'].includes(result.signal));
  });

  it('returns null for insufficient data', () => {
    assert.strictEqual(rsi([1, 2, 3]).value, null);
  });
});

describe('MACD', () => {
  it('returns MACD components', () => {
    const closes = makeCandles(60).map(c => c.close);
    const result = macd(closes);
    assert.ok(result.macd !== null, 'MACD line should not be null');
    assert.ok(['bullish', 'bearish', 'bullish_cross', 'bearish_cross', 'neutral'].includes(result.trend));
  });
});

describe('Bollinger Bands', () => {
  it('returns upper > middle > lower', () => {
    const closes = makeCandles(50).map(c => c.close);
    const result = bollingerBands(closes);
    assert.ok(result.upper > result.middle, 'upper > middle');
    assert.ok(result.middle > result.lower, 'middle > lower');
    assert.ok(result.width > 0, 'bandwidth positive');
  });
});

describe('ATR', () => {
  it('returns positive ATR', () => {
    const candles = makeCandles(50);
    const result = atr(candles);
    assert.ok(result.value > 0, 'ATR should be positive');
    assert.ok(['high', 'medium', 'low'].includes(result.volatility));
  });
});

describe('Stochastic', () => {
  it('returns K and D in 0-100 range', () => {
    const candles = makeCandles(50);
    const result = stochastic(candles);
    assert.ok(result.k >= 0 && result.k <= 100, `K=${result.k} out of range`);
    assert.ok(result.d >= 0 && result.d <= 100, `D=${result.d} out of range`);
  });
});

describe('OBV', () => {
  it('returns trend', () => {
    const candles = makeCandles(50);
    const result = obv(candles.map(c => c.close), candles.map(c => c.volume));
    assert.ok(['bullish', 'bearish', 'neutral'].includes(result.trend));
  });
});

describe('VWAP', () => {
  it('returns a value near price', () => {
    const candles = makeCandles(50);
    const result = vwap(candles);
    assert.ok(result.value > 0);
    assert.ok(['bullish', 'bearish', 'neutral'].includes(result.signal));
  });
});

describe('Fibonacci', () => {
  it('calculates correct levels', () => {
    const result = fibonacci(100, 50);
    assert.strictEqual(result.levels[0], 100);
    assert.strictEqual(result.levels[1], 50);
    assert.ok(result.levels[0.5] === 75);
  });
});

describe('Support/Resistance', () => {
  it('finds levels in sufficient data', () => {
    const candles = makeCandles(100);
    const result = supportResistance(candles);
    assert.ok(Array.isArray(result.support));
    assert.ok(Array.isArray(result.resistance));
  });
});

describe('Divergence Detection', () => {
  it('returns divergence or null', () => {
    const closes = makeCandles(80).map(c => c.close);
    const result = detectDivergence(closes);
    assert.ok(result.divergence === null || ['bullish', 'bearish'].includes(result.divergence));
  });
});

describe('analyze (aggregator)', () => {
  it('returns signal with confidence for valid candles', () => {
    const candles = makeCandles(100);
    const result = analyze(candles);
    assert.ok(['bullish', 'bearish', 'neutral'].includes(result.signal));
    assert.ok(result.confidence >= 0 && result.confidence <= 100);
    assert.ok(['strong_buy', 'buy', 'hold', 'sell', 'strong_sell'].includes(result.recommendation));
    assert.ok(result.indicators.rsi);
    assert.ok(result.indicators.macd);
    assert.ok(result.indicators.bollinger);
  });

  it('returns insufficient_data for small dataset', () => {
    const result = analyze([{ close: 1, high: 2, low: 0.5, volume: 100, open: 1 }]);
    assert.strictEqual(result.signal, 'insufficient_data');
  });
});

describe('TAEngine', () => {
  it('exports class', () => {
    const engine = new TAEngine();
    assert.ok(engine);
    assert.strictEqual(engine.stats.runs, 0);
  });

  it('summary returns correct shape', () => {
    const engine = new TAEngine();
    const s = engine.summary();
    assert.strictEqual(s.runs, 0);
    assert.strictEqual(s.lastSignal, 'none');
  });

  it('formatForLLM handles null', () => {
    const engine = new TAEngine();
    const text = engine.formatForLLM(null);
    assert.ok(text.includes('insufficient'));
  });

  it('formatForLLM formats valid result', () => {
    const candles = makeCandles(100);
    const result = analyze(candles);
    const engine = new TAEngine();
    engine.lastAnalysis = result;
    const text = engine.formatForLLM(result);
    assert.ok(text.includes('TA Signal:'));
    assert.ok(text.includes('RSI:'));
    assert.ok(text.includes('MACD:'));
  });
});
