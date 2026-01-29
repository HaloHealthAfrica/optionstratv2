/**
 * Unit tests for SignalNormalizer
 */

import { describe, it, expect } from 'vitest';
import { SignalNormalizer } from './signal-normalizer.ts';

describe('SignalNormalizer', () => {
  it('normalizes TradingView symbol formats and directions', async () => {
    const normalizer = new SignalNormalizer();

    const exchangePrefixed = await normalizer.normalize({
      source: 'tradingview',
      symbol: 'NASDAQ:SPY',
      direction: 'BUY',
      timeframe: '5m',
    });

    expect(exchangePrefixed.symbol).toBe('SPY');
    expect(exchangePrefixed.direction).toBe('CALL');

    const dottedSymbol = await normalizer.normalize({
      source: 'tradingview',
      symbol: 'SPY.US',
      direction: 'SELL',
      timeframe: '15m',
    });

    expect(dottedSymbol.symbol).toBe('SPY');
    expect(dottedSymbol.direction).toBe('PUT');
  });

  it('accepts ticker/underlying fallbacks and timeframe variants', async () => {
    const normalizer = new SignalNormalizer();

    const signal = await normalizer.normalize({
      source: 'tradingview',
      ticker: 'QQQ',
      action: 'BUY',
      tf: '1H',
    });

    expect(signal.symbol).toBe('QQQ');
    expect(signal.direction).toBe('CALL');
    expect(signal.timeframe).toBe('1h');
  });
});
