/**
 * Signal Normalizer
 * 
 * Converts signals from different sources into a unified Signal interface
 * 
 * Requirements: 10.1
 */

import { Signal, SignalSource, Direction } from '../core/types.ts';
import { v4 as uuidv4 } from 'https://deno.land/std@0.208.0/uuid/mod.ts';

export interface RawSignal {
  source?: string;
  symbol?: string;
  direction?: string;
  timeframe?: string;
  timestamp?: string | Date;
  [key: string]: any;
}

/**
 * SignalNormalizer converts different signal formats to unified Signal interface
 */
export class SignalNormalizer {
  /**
   * Normalize a raw signal to the unified Signal format
   * 
   * Requirements: 10.1, 10.2
   */
  async normalize(rawSignal: RawSignal): Promise<Signal> {
    // Resolve raw values with fallbacks
    const rawSource = rawSignal.source;
    const rawSymbol = rawSignal.symbol ?? rawSignal.ticker ?? rawSignal.underlying;
    const rawDirection = rawSignal.direction ?? rawSignal.action ?? rawSignal.side ?? rawSignal.signal ?? rawSignal.type ?? rawSignal.option_type ?? rawSignal.optionType;
    const rawTimeframe = rawSignal.timeframe ?? rawSignal.tf ?? rawSignal.interval;
    const rawTimestamp = rawSignal.timestamp ?? rawSignal.time ?? rawSignal.signal_time;

    // Validate required fields
    this.validateRequiredFields({
      source: rawSource,
      symbol: rawSymbol,
      direction: rawDirection,
      timeframe: rawTimeframe,
    });
    
    // Assign unique tracking ID (Requirement 10.2)
    const trackingId = uuidv4();
    
    // Extract and normalize fields
    const source = this.normalizeSource(rawSource);
    const symbol = this.normalizeSymbol(rawSymbol as string);
    const direction = this.normalizeDirection(rawDirection as string);
    const timeframe = this.normalizeTimeframe(rawTimeframe as string);
    const timestamp = this.normalizeTimestamp(rawTimestamp ?? new Date());
    
    // Extract metadata (all other fields)
    const metadata = this.extractMetadata(rawSignal);
    
    return {
      id: trackingId,
      source,
      symbol,
      direction,
      timeframe,
      timestamp,
      metadata,
    };
  }

  /**
   * Validate that required fields are present
   */
  private validateRequiredFields(rawSignal: RawSignal): void {
    const requiredFields = ['symbol', 'direction', 'timeframe'];
    const missingFields: string[] = [];
    
    for (const field of requiredFields) {
      if (!rawSignal[field]) {
        missingFields.push(field);
      }
    }
    
    if (missingFields.length > 0) {
      throw new Error(`Missing required fields: ${missingFields.join(', ')}`);
    }
  }

  /**
   * Normalize source to SignalSource type
   */
  private normalizeSource(source?: string): SignalSource {
    if (!source) {
      return 'TRADINGVIEW';
    }

    const normalized = source.toUpperCase();
    
    const validSources: SignalSource[] = ['TRADINGVIEW', 'GEX', 'MTF', 'MANUAL'];
    
    if (validSources.includes(normalized as SignalSource)) {
      return normalized as SignalSource;
    }
    
    // Default to TRADINGVIEW if unknown
    console.warn(`Unknown signal source: ${source}, defaulting to TRADINGVIEW`);
    return 'TRADINGVIEW';
  }

  /**
   * Normalize symbol (uppercase, trim whitespace)
   */
  private normalizeSymbol(symbol: string): string {
    const upper = symbol.toUpperCase().trim();
    const withoutExchange = upper.includes(':') ? upper.split(':').pop()! : upper;
    const withoutSuffix = withoutExchange.includes('.') ? withoutExchange.split('.')[0] : withoutExchange;
    return withoutSuffix.trim();
  }

  /**
   * Normalize direction to Direction type
   */
  private normalizeDirection(direction: string): Direction {
    const normalized = direction.toUpperCase();
    
    if (normalized === 'CALL' || normalized === 'PUT') {
      return normalized as Direction;
    }

    const actionMap: Record<string, Direction> = {
      BUY: 'CALL',
      LONG: 'CALL',
      SELL: 'PUT',
      SHORT: 'PUT',
    };

    if (actionMap[normalized]) {
      return actionMap[normalized];
    }
    
    // Try to infer from common variations
    if (normalized.includes('CALL') || normalized === 'C' || normalized === 'LONG') {
      return 'CALL';
    }
    
    if (normalized.includes('PUT') || normalized === 'P' || normalized === 'SHORT') {
      return 'PUT';
    }
    
    throw new Error(`Invalid direction: ${direction}. Must be CALL or PUT`);
  }

  /**
   * Normalize timeframe (lowercase, standardize format)
   */
  private normalizeTimeframe(timeframe: string): string {
    const normalized = timeframe.toLowerCase().trim();
    
    // Standardize common variations
    const timeframeMap: Record<string, string> = {
      '1m': '1m',
      '1min': '1m',
      '5m': '5m',
      '5min': '5m',
      '15m': '15m',
      '15min': '15m',
      '30m': '30m',
      '30min': '30m',
      '1h': '1h',
      '1hr': '1h',
      '1hour': '1h',
      '4h': '4h',
      '4hr': '4h',
      '1d': '1d',
      '1day': '1d',
      'daily': '1d',
    };
    
    return timeframeMap[normalized] || normalized;
  }

  /**
   * Normalize timestamp to Date object
   */
  private normalizeTimestamp(timestamp: string | Date): Date {
    if (timestamp instanceof Date) {
      return timestamp;
    }
    
    // Try to parse string timestamp
    const parsed = new Date(timestamp);
    
    if (isNaN(parsed.getTime())) {
      // If parsing fails, use current time
      console.warn(`Invalid timestamp: ${timestamp}, using current time`);
      return new Date();
    }
    
    return parsed;
  }

  /**
   * Extract metadata (all fields except the standard ones)
   */
  private extractMetadata(rawSignal: RawSignal): Record<string, any> {
    const standardFields = [
      'source',
      'symbol',
      'ticker',
      'underlying',
      'direction',
      'action',
      'side',
      'signal',
      'type',
      'option_type',
      'optionType',
      'timeframe',
      'tf',
      'interval',
      'timestamp',
      'time',
      'signal_time',
    ];
    const metadata: Record<string, any> = {};
    
    for (const [key, value] of Object.entries(rawSignal)) {
      if (!standardFields.includes(key)) {
        metadata[key] = value;
      }
    }
    
    return metadata;
  }
}
