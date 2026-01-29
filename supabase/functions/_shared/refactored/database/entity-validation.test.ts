/**
 * Tests for Database Entity Validation
 * Tests Property 16 and schema mismatch detection
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  validateSignal,
  validatePosition,
  validateGEXSignal,
  validateContextData,
  SchemaValidationError,
} from './entity-validation.ts';

describe('Database Entity Validation Property Tests', () => {
  /**
   * Property 16: Null Value Handling in Database Reconstruction
   * For any database row containing null values, reconstructing objects from that row
   * SHALL handle nulls explicitly without throwing null reference errors.
   * Validates: Requirements 9.3
   */
  it('Property 16: Null values are handled explicitly without errors', () => {
    fc.assert(
      fc.property(
        fc.record({
          id: fc.string({ minLength: 1 }),
          source: fc.constantFrom('TRADINGVIEW', 'GEX', 'MTF', 'MANUAL'),
          symbol: fc.constantFrom('SPY', 'QQQ', 'IWM'),
          direction: fc.constantFrom('CALL', 'PUT'),
          timeframe: fc.constantFrom('5m', '15m', '1h'),
          timestamp: fc.date(),
          // Nullable fields
          metadata: fc.oneof(fc.constant(null), fc.object()),
          validation_result: fc.oneof(fc.constant(null), fc.object()),
        }),
        (row) => {
          // Should not throw on null values
          const signal = validateSignal(row);
          
          // Must have valid signal
          expect(signal).toBeDefined();
          expect(signal.id).toBe(row.id);
          expect(signal.symbol).toBe(row.symbol);
          
          // Null metadata should be converted to empty object
          expect(signal.metadata).toBeDefined();
          expect(typeof signal.metadata).toBe('object');
        }
      ),
      { numRuns: 100 }
    );
  });

  it('Property 16: Position null values handled explicitly', () => {
    fc.assert(
      fc.property(
        fc.record({
          id: fc.string({ minLength: 1 }),
          signal_id: fc.string({ minLength: 1 }),
          symbol: fc.constantFrom('SPY', 'QQQ'),
          direction: fc.constantFrom('CALL', 'PUT'),
          quantity: fc.integer({ min: 1, max: 10 }),
          entry_price: fc.double({ min: 1, max: 1000 }),
          entry_time: fc.date(),
          status: fc.constantFrom('OPEN', 'CLOSED'),
          created_at: fc.date(),
          updated_at: fc.date(),
          // Nullable fields
          current_price: fc.oneof(fc.constant(null), fc.double({ min: 1, max: 1000 })),
          unrealized_pnl: fc.oneof(fc.constant(null), fc.double({ min: -1000, max: 1000 })),
          exit_price: fc.oneof(fc.constant(null), fc.double({ min: 1, max: 1000 })),
          exit_time: fc.oneof(fc.constant(null), fc.date()),
          realized_pnl: fc.oneof(fc.constant(null), fc.double({ min: -1000, max: 1000 })),
        }),
        (row) => {
          // Should not throw on null values
          const position = validatePosition(row);
          
          // Must have valid position
          expect(position).toBeDefined();
          expect(position.id).toBe(row.id);
          expect(position.signalId).toBe(row.signal_id);
          
          // Null values should be undefined (not null)
          if (row.current_price === null) {
            expect(position.currentPrice).toBeUndefined();
          }
          if (row.unrealized_pnl === null) {
            expect(position.unrealizedPnL).toBeUndefined();
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('Property 16: GEXSignal null values handled explicitly', () => {
    fc.assert(
      fc.property(
        fc.record({
          id: fc.string({ minLength: 1 }),
          symbol: fc.constantFrom('SPY', 'QQQ'),
          timeframe: fc.constantFrom('5m', '15m', '1h'),
          strength: fc.double({ min: -1, max: 1 }),
          direction: fc.constantFrom('CALL', 'PUT'),
          timestamp: fc.date(),
          created_at: fc.date(),
          // Nullable fields
          age: fc.oneof(fc.constant(null), fc.integer({ min: 0, max: 1000000 })),
          metadata: fc.oneof(fc.constant(null), fc.object()),
        }),
        (row) => {
          // Should not throw on null values
          const gexSignal = validateGEXSignal(row);
          
          // Must have valid GEX signal
          expect(gexSignal).toBeDefined();
          expect(gexSignal.symbol).toBe(row.symbol);
          expect(gexSignal.strength).toBe(row.strength);
          
          // Null age should default to 0
          if (row.age === null) {
            expect(gexSignal.age).toBe(0);
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});

describe('Database Entity Validation Unit Tests', () => {
  /**
   * Unit Test: Schema Mismatch Detection
   * Test that schema mismatches throw specific errors
   * Validates: Requirements 9.5
   */
  it('should throw SchemaValidationError for missing required fields', () => {
    const invalidSignal = {
      id: 'test-123',
      // Missing source, symbol, direction, timeframe
      timestamp: new Date(),
    };

    expect(() => validateSignal(invalidSignal)).toThrow(SchemaValidationError);
  });

  it('should throw SchemaValidationError for invalid direction', () => {
    const invalidSignal = {
      id: 'test-123',
      source: 'TRADINGVIEW',
      symbol: 'SPY',
      direction: 'INVALID', // Invalid direction
      timeframe: '5m',
      timestamp: new Date(),
    };

    expect(() => validateSignal(invalidSignal)).toThrow(SchemaValidationError);
    expect(() => validateSignal(invalidSignal)).toThrow(/direction must be CALL or PUT/);
  });

  it('should throw SchemaValidationError for invalid quantity', () => {
    const invalidPosition = {
      id: 'test-123',
      signal_id: 'signal-123',
      symbol: 'SPY',
      direction: 'CALL',
      quantity: -1, // Invalid quantity
      entry_price: 100,
      entry_time: new Date(),
      status: 'OPEN',
      created_at: new Date(),
      updated_at: new Date(),
    };

    expect(() => validatePosition(invalidPosition)).toThrow(SchemaValidationError);
    expect(() => validatePosition(invalidPosition)).toThrow(/quantity must be a positive number/);
  });

  it('should throw SchemaValidationError for invalid GEX strength', () => {
    const invalidGEX = {
      id: 'test-123',
      symbol: 'SPY',
      timeframe: '5m',
      strength: 2.0, // Invalid strength (> 1)
      direction: 'CALL',
      timestamp: new Date(),
      created_at: new Date(),
    };

    expect(() => validateGEXSignal(invalidGEX)).toThrow(SchemaValidationError);
    expect(() => validateGEXSignal(invalidGEX)).toThrow(/strength must be a number between -1 and 1/);
  });

  it('should throw SchemaValidationError for invalid VIX', () => {
    const invalidContext = {
      id: 'test-123',
      vix: -5, // Invalid VIX (negative)
      trend: 'BULLISH',
      bias: 0.5,
      regime: 'NORMAL',
      timestamp: new Date(),
      created_at: new Date(),
    };

    expect(() => validateContextData(invalidContext)).toThrow(SchemaValidationError);
    expect(() => validateContextData(invalidContext)).toThrow(/vix must be a non-negative number/);
  });

  it('should throw SchemaValidationError for invalid trend', () => {
    const invalidContext = {
      id: 'test-123',
      vix: 20,
      trend: 'INVALID', // Invalid trend
      bias: 0.5,
      regime: 'NORMAL',
      timestamp: new Date(),
      created_at: new Date(),
    };

    expect(() => validateContextData(invalidContext)).toThrow(SchemaValidationError);
    expect(() => validateContextData(invalidContext)).toThrow(/trend must be BULLISH, BEARISH, or NEUTRAL/);
  });

  it('should throw SchemaValidationError for null row', () => {
    expect(() => validateSignal(null)).toThrow(SchemaValidationError);
    expect(() => validateSignal(null)).toThrow(/null or undefined/);
  });

  it('should throw SchemaValidationError for undefined row', () => {
    expect(() => validatePosition(undefined)).toThrow(SchemaValidationError);
    expect(() => validatePosition(undefined)).toThrow(/null or undefined/);
  });

  it('should handle valid signal with all fields', () => {
    const validSignal = {
      id: 'test-123',
      source: 'TRADINGVIEW',
      symbol: 'SPY',
      direction: 'CALL',
      timeframe: '5m',
      timestamp: new Date(),
      metadata: { price: 450 },
      validation_result: { valid: true },
      created_at: new Date(),
    };

    const signal = validateSignal(validSignal);
    
    expect(signal).toBeDefined();
    expect(signal.id).toBe('test-123');
    expect(signal.source).toBe('TRADINGVIEW');
    expect(signal.symbol).toBe('SPY');
    expect(signal.direction).toBe('CALL');
    expect(signal.metadata.price).toBe(450);
  });

  it('should handle valid position with null optional fields', () => {
    const validPosition = {
      id: 'test-123',
      signal_id: 'signal-123',
      symbol: 'SPY',
      direction: 'CALL',
      quantity: 2,
      entry_price: 100,
      entry_time: new Date(),
      current_price: null,
      unrealized_pnl: null,
      exit_price: null,
      exit_time: null,
      realized_pnl: null,
      status: 'OPEN',
      created_at: new Date(),
      updated_at: new Date(),
    };

    const position = validatePosition(validPosition);
    
    expect(position).toBeDefined();
    expect(position.id).toBe('test-123');
    expect(position.currentPrice).toBeUndefined();
    expect(position.unrealizedPnL).toBeUndefined();
  });

  it('should provide clear error messages with field information', () => {
    const invalidSignal = {
      id: 'test-123',
      source: 'TRADINGVIEW',
      symbol: 'SPY',
      direction: 'INVALID',
      timeframe: '5m',
      timestamp: new Date(),
    };

    try {
      validateSignal(invalidSignal);
      fail('Should have thrown SchemaValidationError');
    } catch (error) {
      expect(error).toBeInstanceOf(SchemaValidationError);
      const schemaError = error as SchemaValidationError;
      expect(schemaError.entityType).toBe('Signal');
      expect(schemaError.field).toBe('direction');
      expect(schemaError.expectedType).toBe('CALL | PUT');
      expect(schemaError.actualValue).toBe('INVALID');
    }
  });
});
