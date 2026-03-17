// ── Technical Analysis Engine ───────────────────────────────────────
// Pure-JS TA indicators for autonomous trading decisions.
// No external dependencies — everything computed from raw candle data.
// Compatible with Bankr skill format for export.
//
// Indicators: RSI, MACD, Bollinger Bands, EMA/SMA, ATR, VWAP,
//   Stochastic, OBV, Ichimoku, Fibonacci levels, Support/Resistance,
//   Volume Profile, Divergence detection, Signal aggregation.

import { config } from './config.js';
import { log, logWarn } from './logger.js';

// ── Core Math Helpers ───────────────────────────────────────────────

function sma(data, period) {
  if (data.length < period) return null;
  const slice = data.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / period;
}

function ema(data, period) {
  if (data.length < period) return null;
  const k = 2 / (period + 1);
  let em = sma(data.slice(0, period), period);
  for (let i = period; i < data.length; i++) {
    em = data[i] * k + em * (1 - k);
  }
  return em;
}

function stddev(data, period) {
  if (data.length < period) return null;
  const slice = data.slice(-period);
  const mean = slice.reduce((a, b) => a + b, 0) / period;
  const variance = slice.reduce((sum, x) => sum + (x - mean) ** 2, 0) / period;
  return Math.sqrt(variance);
}

// ── Indicator Calculations ──────────────────────────────────────────

/**
 * RSI — Relative Strength Index
 * @param {number[]} closes - closing prices
 * @param {number} period - lookback (default 14)
 * @returns {{ value: number, signal: string }}
 */
export function rsi(closes, period = 14) {
  if (closes.length < period + 1) return { value: null, signal: 'neutral' };

  let gains = 0, losses = 0;
  for (let i = closes.length - period; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff > 0) gains += diff;
    else losses -= diff;
  }

  const avgGain = gains / period;
  const avgLoss = losses / period;
  if (avgLoss === 0) return { value: 100, signal: 'overbought' };

  const rs = avgGain / avgLoss;
  const value = 100 - (100 / (1 + rs));

  let signal = 'neutral';
  if (value >= 70) signal = 'overbought';
  else if (value >= 60) signal = 'bullish';
  else if (value <= 30) signal = 'oversold';
  else if (value <= 40) signal = 'bearish';

  return { value: Math.round(value * 100) / 100, signal };
}

/**
 * MACD — Moving Average Convergence Divergence
 * @param {number[]} closes
 * @param {number} fast - fast EMA period (default 12)
 * @param {number} slow - slow EMA period (default 26)
 * @param {number} signal - signal line period (default 9)
 */
export function macd(closes, fast = 12, slow = 26, signalPeriod = 9) {
  if (closes.length < slow + signalPeriod) return { macd: null, signal: null, histogram: null, trend: 'neutral' };

  // Calculate MACD line (fast EMA - slow EMA)
  const macdLine = [];
  for (let i = slow; i <= closes.length; i++) {
    const slice = closes.slice(0, i);
    const fastEma = ema(slice, fast);
    const slowEma = ema(slice, slow);
    if (fastEma !== null && slowEma !== null) {
      macdLine.push(fastEma - slowEma);
    }
  }

  if (macdLine.length < signalPeriod) return { macd: null, signal: null, histogram: null, trend: 'neutral' };

  const signalLine = ema(macdLine, signalPeriod);
  const currentMacd = macdLine[macdLine.length - 1];
  const histogram = currentMacd - signalLine;

  // Detect crossovers
  let trend = 'neutral';
  if (macdLine.length >= 2) {
    const prevMacd = macdLine[macdLine.length - 2];
    const prevSignal = ema(macdLine.slice(0, -1), signalPeriod);
    if (prevMacd !== null && prevSignal !== null) {
      if (prevMacd <= prevSignal && currentMacd > signalLine) trend = 'bullish_cross';
      else if (prevMacd >= prevSignal && currentMacd < signalLine) trend = 'bearish_cross';
      else if (currentMacd > signalLine) trend = 'bullish';
      else trend = 'bearish';
    }
  }

  return {
    macd: Math.round(currentMacd * 1e8) / 1e8,
    signal: Math.round(signalLine * 1e8) / 1e8,
    histogram: Math.round(histogram * 1e8) / 1e8,
    trend,
  };
}

/**
 * Bollinger Bands
 * @param {number[]} closes
 * @param {number} period - SMA period (default 20)
 * @param {number} multiplier - standard deviation multiplier (default 2)
 */
export function bollingerBands(closes, period = 20, multiplier = 2) {
  if (closes.length < period) return { upper: null, middle: null, lower: null, signal: 'neutral', width: null };

  const middle = sma(closes, period);
  const sd = stddev(closes, period);
  const upper = middle + multiplier * sd;
  const lower = middle - multiplier * sd;
  const price = closes[closes.length - 1];
  const width = ((upper - lower) / middle) * 100; // bandwidth %

  let signal = 'neutral';
  if (price >= upper) signal = 'overbought';
  else if (price <= lower) signal = 'oversold';
  else if (price > middle) signal = 'bullish';
  else signal = 'bearish';

  // Squeeze detection — low bandwidth means breakout incoming
  const squeeze = width < 3; // <3% bandwidth = tight squeeze

  return {
    upper: Math.round(upper * 1e8) / 1e8,
    middle: Math.round(middle * 1e8) / 1e8,
    lower: Math.round(lower * 1e8) / 1e8,
    width: Math.round(width * 100) / 100,
    squeeze,
    signal,
  };
}

/**
 * ATR — Average True Range (volatility)
 * @param {{ high: number, low: number, close: number }[]} candles
 * @param {number} period
 */
export function atr(candles, period = 14) {
  if (candles.length < period + 1) return { value: null };

  const trs = [];
  for (let i = 1; i < candles.length; i++) {
    const tr = Math.max(
      candles[i].high - candles[i].low,
      Math.abs(candles[i].high - candles[i - 1].close),
      Math.abs(candles[i].low - candles[i - 1].close)
    );
    trs.push(tr);
  }

  const value = sma(trs.slice(-period), period);
  const pct = (value / candles[candles.length - 1].close) * 100;

  return {
    value: Math.round(value * 1e8) / 1e8,
    pct: Math.round(pct * 100) / 100,
    volatility: pct > 5 ? 'high' : pct > 2 ? 'medium' : 'low',
  };
}

/**
 * Stochastic Oscillator
 * @param {{ high: number, low: number, close: number }[]} candles
 * @param {number} kPeriod
 * @param {number} dPeriod
 */
export function stochastic(candles, kPeriod = 14, dPeriod = 3) {
  if (candles.length < kPeriod + dPeriod) return { k: null, d: null, signal: 'neutral' };

  const kValues = [];
  for (let i = kPeriod - 1; i < candles.length; i++) {
    const window = candles.slice(i - kPeriod + 1, i + 1);
    const high = Math.max(...window.map(c => c.high));
    const low = Math.min(...window.map(c => c.low));
    const k = high === low ? 50 : ((candles[i].close - low) / (high - low)) * 100;
    kValues.push(k);
  }

  const k = kValues[kValues.length - 1];
  const d = sma(kValues, dPeriod);

  let signal = 'neutral';
  if (k >= 80 && d >= 80) signal = 'overbought';
  else if (k <= 20 && d <= 20) signal = 'oversold';
  else if (k > d && kValues.length >= 2 && kValues[kValues.length - 2] <= (sma(kValues.slice(0, -1), dPeriod) || 50)) signal = 'bullish_cross';
  else if (k < d && kValues.length >= 2 && kValues[kValues.length - 2] >= (sma(kValues.slice(0, -1), dPeriod) || 50)) signal = 'bearish_cross';

  return { k: Math.round(k * 100) / 100, d: Math.round(d * 100) / 100, signal };
}

/**
 * OBV — On-Balance Volume
 * @param {number[]} closes
 * @param {number[]} volumes
 */
export function obv(closes, volumes) {
  if (closes.length < 2 || closes.length !== volumes.length) return { value: null, trend: 'neutral' };

  let cumObv = 0;
  const obvValues = [0];
  for (let i = 1; i < closes.length; i++) {
    if (closes[i] > closes[i - 1]) cumObv += volumes[i];
    else if (closes[i] < closes[i - 1]) cumObv -= volumes[i];
    obvValues.push(cumObv);
  }

  // OBV trend: compare recent vs older
  const recent = sma(obvValues.slice(-5), 5);
  const older = sma(obvValues.slice(-10, -5), 5);
  let trend = 'neutral';
  if (recent !== null && older !== null) {
    if (recent > older * 1.05) trend = 'bullish';
    else if (recent < older * 0.95) trend = 'bearish';
  }

  return { value: cumObv, trend };
}

/**
 * VWAP — Volume-Weighted Average Price
 * @param {{ close: number, volume: number, high: number, low: number }[]} candles
 */
export function vwap(candles) {
  if (candles.length < 1) return { value: null, signal: 'neutral' };

  let cumVol = 0, cumTP = 0;
  for (const c of candles) {
    const tp = (c.high + c.low + c.close) / 3;
    cumTP += tp * c.volume;
    cumVol += c.volume;
  }

  if (cumVol === 0) return { value: null, signal: 'neutral' };
  const value = cumTP / cumVol;
  const price = candles[candles.length - 1].close;

  return {
    value: Math.round(value * 1e8) / 1e8,
    signal: price > value ? 'bullish' : price < value ? 'bearish' : 'neutral',
  };
}

/**
 * Fibonacci Retracement Levels
 * @param {number} high - recent swing high
 * @param {number} low - recent swing low
 */
export function fibonacci(high, low) {
  const diff = high - low;
  return {
    levels: {
      0: high,
      0.236: high - diff * 0.236,
      0.382: high - diff * 0.382,
      0.5: high - diff * 0.5,
      0.618: high - diff * 0.618,
      0.786: high - diff * 0.786,
      1: low,
    },
    range: { high, low },
  };
}

/**
 * Support & Resistance detection via pivot points
 * @param {{ high: number, low: number, close: number }[]} candles
 */
export function supportResistance(candles) {
  if (candles.length < 5) return { support: [], resistance: [] };

  const pivots = [];
  for (let i = 2; i < candles.length - 2; i++) {
    const c = candles[i];
    // Swing high
    if (c.high > candles[i-1].high && c.high > candles[i-2].high &&
        c.high > candles[i+1].high && c.high > candles[i+2].high) {
      pivots.push({ type: 'resistance', price: c.high, idx: i });
    }
    // Swing low
    if (c.low < candles[i-1].low && c.low < candles[i-2].low &&
        c.low < candles[i+1].low && c.low < candles[i+2].low) {
      pivots.push({ type: 'support', price: c.low, idx: i });
    }
  }

  // Cluster nearby levels (within 0.5%)
  const clustered = clusterLevels(pivots, 0.005);

  return {
    support: clustered.filter(l => l.type === 'support').map(l => l.price),
    resistance: clustered.filter(l => l.type === 'resistance').map(l => l.price),
    pivots: clustered,
  };
}

function clusterLevels(pivots, threshold) {
  if (pivots.length === 0) return [];
  const sorted = [...pivots].sort((a, b) => a.price - b.price);
  const clusters = [{ ...sorted[0], count: 1 }];

  for (let i = 1; i < sorted.length; i++) {
    const last = clusters[clusters.length - 1];
    if (Math.abs(sorted[i].price - last.price) / last.price < threshold) {
      last.price = (last.price * last.count + sorted[i].price) / (last.count + 1);
      last.count++;
    } else {
      clusters.push({ ...sorted[i], count: 1 });
    }
  }

  return clusters.sort((a, b) => b.count - a.count);
}

// ── Divergence Detection ────────────────────────────────────────────

/**
 * Detect bullish/bearish divergences between price and RSI
 * @param {number[]} closes
 * @param {number} period
 */
export function detectDivergence(closes, period = 14) {
  if (closes.length < period * 3) return { divergence: null };

  // Get RSI values for recent windows
  const rsiValues = [];
  for (let i = period + 1; i <= closes.length; i++) {
    const r = rsi(closes.slice(0, i), period);
    rsiValues.push(r.value);
  }

  if (rsiValues.length < 10) return { divergence: null };

  const recentCloses = closes.slice(-10);
  const recentRsi = rsiValues.slice(-10);

  // Find local min/max in last 10 candles
  const priceMin1 = Math.min(...recentCloses.slice(0, 5));
  const priceMin2 = Math.min(...recentCloses.slice(5));
  const rsiMin1 = Math.min(...recentRsi.slice(0, 5));
  const rsiMin2 = Math.min(...recentRsi.slice(5));

  const priceMax1 = Math.max(...recentCloses.slice(0, 5));
  const priceMax2 = Math.max(...recentCloses.slice(5));
  const rsiMax1 = Math.max(...recentRsi.slice(0, 5));
  const rsiMax2 = Math.max(...recentRsi.slice(5));

  // Bullish divergence: price makes lower low, RSI makes higher low
  if (priceMin2 < priceMin1 && rsiMin2 > rsiMin1) {
    return { divergence: 'bullish', type: 'price_lower_rsi_higher' };
  }

  // Bearish divergence: price makes higher high, RSI makes lower high
  if (priceMax2 > priceMax1 && rsiMax2 < rsiMax1) {
    return { divergence: 'bearish', type: 'price_higher_rsi_lower' };
  }

  return { divergence: null };
}

// ── Signal Aggregation ──────────────────────────────────────────────

/**
 * Aggregate all TA indicators into a single trade signal.
 * @param {{ close: number, high: number, low: number, volume: number, open: number }[]} candles
 * @returns {{ signal: string, confidence: number, indicators: object, recommendation: string }}
 */
export function analyze(candles) {
  if (!candles || candles.length < 30) {
    return { signal: 'insufficient_data', confidence: 0, indicators: {}, recommendation: 'wait' };
  }

  const closes = candles.map(c => c.close);
  const volumes = candles.map(c => c.volume);
  const price = closes[closes.length - 1];

  // Calculate all indicators
  const indicators = {
    rsi: rsi(closes),
    macd: macd(closes),
    bollinger: bollingerBands(closes),
    atr: atr(candles),
    stochastic: stochastic(candles),
    obv: obv(closes, volumes),
    vwap: vwap(candles),
    divergence: detectDivergence(closes),
    ema20: { value: ema(closes, 20), trend: ema(closes, 20) > ema(closes, 50) ? 'bullish' : 'bearish' },
    ema50: { value: ema(closes, 50) },
    sma200: { value: closes.length >= 200 ? sma(closes, 200) : null },
    supportResistance: supportResistance(candles),
    fibonacci: fibonacci(
      Math.max(...candles.slice(-50).map(c => c.high)),
      Math.min(...candles.slice(-50).map(c => c.low))
    ),
  };

  // Score signals: +1 bullish, -1 bearish, 0 neutral
  const scores = [];

  // RSI
  if (indicators.rsi.signal === 'oversold') scores.push({ name: 'rsi', score: 1, weight: 1.5 });
  else if (indicators.rsi.signal === 'overbought') scores.push({ name: 'rsi', score: -1, weight: 1.5 });
  else if (indicators.rsi.signal === 'bullish') scores.push({ name: 'rsi', score: 0.5, weight: 1 });
  else if (indicators.rsi.signal === 'bearish') scores.push({ name: 'rsi', score: -0.5, weight: 1 });
  else scores.push({ name: 'rsi', score: 0, weight: 0.5 });

  // MACD
  if (indicators.macd.trend === 'bullish_cross') scores.push({ name: 'macd', score: 1, weight: 2 });
  else if (indicators.macd.trend === 'bearish_cross') scores.push({ name: 'macd', score: -1, weight: 2 });
  else if (indicators.macd.trend === 'bullish') scores.push({ name: 'macd', score: 0.5, weight: 1 });
  else if (indicators.macd.trend === 'bearish') scores.push({ name: 'macd', score: -0.5, weight: 1 });
  else scores.push({ name: 'macd', score: 0, weight: 0.5 });

  // Bollinger Bands
  if (indicators.bollinger.signal === 'oversold') scores.push({ name: 'bollinger', score: 1, weight: 1.5 });
  else if (indicators.bollinger.signal === 'overbought') scores.push({ name: 'bollinger', score: -1, weight: 1.5 });
  else if (indicators.bollinger.squeeze) scores.push({ name: 'bollinger', score: 0.5, weight: 1 }); // breakout pending
  else scores.push({ name: 'bollinger', score: 0, weight: 0.5 });

  // Stochastic
  if (indicators.stochastic.signal === 'bullish_cross' || indicators.stochastic.signal === 'oversold') scores.push({ name: 'stochastic', score: 1, weight: 1 });
  else if (indicators.stochastic.signal === 'bearish_cross' || indicators.stochastic.signal === 'overbought') scores.push({ name: 'stochastic', score: -1, weight: 1 });
  else scores.push({ name: 'stochastic', score: 0, weight: 0.5 });

  // OBV trend
  if (indicators.obv.trend === 'bullish') scores.push({ name: 'obv', score: 0.5, weight: 1 });
  else if (indicators.obv.trend === 'bearish') scores.push({ name: 'obv', score: -0.5, weight: 1 });
  else scores.push({ name: 'obv', score: 0, weight: 0.5 });

  // VWAP
  if (indicators.vwap.signal === 'bullish') scores.push({ name: 'vwap', score: 0.5, weight: 1 });
  else if (indicators.vwap.signal === 'bearish') scores.push({ name: 'vwap', score: -0.5, weight: 1 });
  else scores.push({ name: 'vwap', score: 0, weight: 0.5 });

  // EMA crossover
  if (indicators.ema20.trend === 'bullish') scores.push({ name: 'ema_cross', score: 0.5, weight: 1.5 });
  else scores.push({ name: 'ema_cross', score: -0.5, weight: 1.5 });

  // Divergence (strongest signal)
  if (indicators.divergence.divergence === 'bullish') scores.push({ name: 'divergence', score: 1, weight: 2.5 });
  else if (indicators.divergence.divergence === 'bearish') scores.push({ name: 'divergence', score: -1, weight: 2.5 });

  // Weighted average
  const totalWeight = scores.reduce((s, x) => s + x.weight, 0);
  const weightedScore = scores.reduce((s, x) => s + x.score * x.weight, 0) / totalWeight;

  // Confidence: how aligned are the indicators? (0-100)
  const agreement = scores.filter(s => Math.sign(s.score) === Math.sign(weightedScore)).length / scores.length;
  const confidence = Math.round(Math.abs(weightedScore) * agreement * 100);

  // Signal determination
  let signal, recommendation;
  if (weightedScore > 0.3 && confidence >= 40) {
    signal = 'bullish';
    recommendation = confidence >= 65 ? 'strong_buy' : 'buy';
  } else if (weightedScore < -0.3 && confidence >= 40) {
    signal = 'bearish';
    recommendation = confidence >= 65 ? 'strong_sell' : 'sell';
  } else {
    signal = 'neutral';
    recommendation = 'hold';
  }

  return {
    signal,
    confidence: Math.min(confidence, 100),
    weightedScore: Math.round(weightedScore * 1000) / 1000,
    recommendation,
    price,
    indicators,
    scores: scores.map(s => ({ name: s.name, score: s.score, weight: s.weight })),
    timestamp: new Date().toISOString(),
  };
}

// ── Price Data Fetching ─────────────────────────────────────────────

/**
 * Fetch OHLCV candle data from CoinGecko (free, no key).
 * @param {string} coinId - e.g. 'ethereum', 'bitcoin'
 * @param {string} vs - e.g. 'usd'
 * @param {number} days - lookback days
 */
export async function fetchCandles(coinId = 'ethereum', vs = 'usd', days = 90) {
  try {
    const url = `https://api.coingecko.com/api/v3/coins/${coinId}/ohlc?vs_currency=${vs}&days=${days}`;
    const resp = await fetch(url);
    if (!resp.ok) {
      logWarn('ta', `CoinGecko ${resp.status}: ${resp.statusText}`);
      return null;
    }
    const data = await resp.json();
    // CoinGecko OHLC returns [timestamp, open, high, low, close]
    return data.map(d => ({
      timestamp: d[0],
      open: d[1],
      high: d[2],
      low: d[3],
      close: d[4],
      volume: 0, // CoinGecko OHLC doesn't include volume
    }));
  } catch (e) {
    logWarn('ta', `Failed to fetch candles: ${e.message}`);
    return null;
  }
}

/**
 * Fetch candles with volume from CoinGecko market_chart
 * @param {string} coinId
 * @param {string} vs
 * @param {number} days
 */
export async function fetchCandlesWithVolume(coinId = 'ethereum', vs = 'usd', days = 30) {
  try {
    const url = `https://api.coingecko.com/api/v3/coins/${coinId}/market_chart?vs_currency=${vs}&days=${days}`;
    const resp = await fetch(url);
    if (!resp.ok) {
      logWarn('ta', `CoinGecko market_chart ${resp.status}`);
      return null;
    }
    const data = await resp.json();
    // Convert timeseries to candles (approximate: use price as OHLC since it's sampled)
    const prices = data.prices || [];
    const volumes = data.total_volumes || [];

    const candles = [];
    for (let i = 0; i < prices.length; i++) {
      const p = prices[i][1];
      const v = volumes[i] ? volumes[i][1] : 0;
      candles.push({
        timestamp: prices[i][0],
        open: i > 0 ? prices[i-1][1] : p,
        high: p * 1.001, // approximate
        low: p * 0.999,
        close: p,
        volume: v,
      });
    }
    return candles;
  } catch (e) {
    logWarn('ta', `Failed to fetch market chart: ${e.message}`);
    return null;
  }
}

// ── TA Manager (wired into agent loop) ──────────────────────────────

export class TAEngine {
  constructor() {
    this.cache = new Map();
    this.lastAnalysis = null;
    this.stats = { runs: 0, signals: { bullish: 0, bearish: 0, neutral: 0 } };
  }

  /**
   * Run full TA analysis for a token pair.
   * @param {string} coinId - CoinGecko coin ID
   * @param {number} days - lookback
   * @returns {object} full analysis result
   */
  async analyze(coinId = 'ethereum', days = 90) {
    log('ta', `📊 Running TA for ${coinId} (${days}d)...`);

    // Try OHLC first, fall back to market_chart for volume
    let candles = await fetchCandles(coinId, 'usd', days);
    if (!candles || candles.length < 30) {
      candles = await fetchCandlesWithVolume(coinId, 'usd', Math.min(days, 30));
    }

    if (!candles || candles.length < 30) {
      logWarn('ta', `Insufficient candle data for ${coinId}`);
      return { signal: 'insufficient_data', confidence: 0, recommendation: 'wait', coinId };
    }

    const result = analyze(candles);
    result.coinId = coinId;
    result.candleCount = candles.length;
    result.timeframe = `${days}d`;

    this.lastAnalysis = result;
    this.stats.runs++;
    this.stats.signals[result.signal] = (this.stats.signals[result.signal] || 0) + 1;
    this.cache.set(coinId, { result, fetchedAt: Date.now() });

    log('ta', `${coinId}: ${result.signal.toUpperCase()} (${result.confidence}% confidence) → ${result.recommendation}`);
    return result;
  }

  /**
   * Get cached analysis if fresh enough
   * @param {string} coinId
   * @param {number} maxAgeMs - max cache age (default 5 min)
   */
  getCached(coinId, maxAgeMs = 300_000) {
    const cached = this.cache.get(coinId);
    if (cached && Date.now() - cached.fetchedAt < maxAgeMs) return cached.result;
    return null;
  }

  /**
   * Quick signal: returns just { signal, confidence, recommendation }
   */
  async quickSignal(coinId = 'ethereum') {
    const cached = this.getCached(coinId);
    if (cached) return { signal: cached.signal, confidence: cached.confidence, recommendation: cached.recommendation };

    const result = await this.analyze(coinId);
    return { signal: result.signal, confidence: result.confidence, recommendation: result.recommendation };
  }

  /** Format analysis for LLM context */
  formatForLLM(result) {
    if (!result || result.signal === 'insufficient_data') return 'TA: insufficient data';
    const lines = [
      `TA Signal: ${result.signal.toUpperCase()} (${result.confidence}% confidence)`,
      `Recommendation: ${result.recommendation}`,
      `Price: $${result.price}`,
      `RSI: ${result.indicators?.rsi?.value} (${result.indicators?.rsi?.signal})`,
      `MACD: ${result.indicators?.macd?.trend}`,
      `Bollinger: ${result.indicators?.bollinger?.signal}${result.indicators?.bollinger?.squeeze ? ' [SQUEEZE]' : ''}`,
      `Stochastic: K=${result.indicators?.stochastic?.k} D=${result.indicators?.stochastic?.d} (${result.indicators?.stochastic?.signal})`,
      `VWAP: ${result.indicators?.vwap?.signal}`,
      `ATR: ${result.indicators?.atr?.pct}% (${result.indicators?.atr?.volatility})`,
      `EMA 20/50: ${result.indicators?.ema20?.trend}`,
    ];
    if (result.indicators?.divergence?.divergence) {
      lines.push(`⚠️ DIVERGENCE: ${result.indicators.divergence.divergence}`);
    }
    return lines.join('\n');
  }

  summary() {
    return {
      runs: this.stats.runs,
      signals: this.stats.signals,
      lastSignal: this.lastAnalysis?.signal || 'none',
      lastConfidence: this.lastAnalysis?.confidence || 0,
      lastCoin: this.lastAnalysis?.coinId || 'none',
    };
  }
}
