/**
 * Property-based tests for Position Manager
 * Tests Properties 28, 29, 30
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as fc from 'fast-check';
import { PositionManager } from './position-manager.ts';
import { Signal, Position } from '../core/types.ts';
import { defaultConfig } from '../core/config.ts';

describe('Position Manager Property Tests', () => {
  let mockSupabaseClient: any;
  let positionManager: PositionManager;

  beforeEach(() => {
    mockSupabaseClient = {
      from: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
    };
    
    // Mock successful database operations
    mockSupabaseClient.insert.mockResolvedValue({ error: null });
    mockSupabaseClient.update.mockResolvedValue({ error: null });
    mockSupabaseClient.select.mockResolvedValue({ data: [], error: null });
    
    positionManager = new PositionManager(mockSupabaseClient, defaultConfig);
  });

  /**
   * Property 28: Position Field Completeness
   * For any position stored by the Position_Manager, the position SHALL include
   * all required fields: entry price, entry time, quantity, and symbol.
   * Validates: Requirements 14.1
   */
  it('Property 28: All positions have required fields', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          symbol: fc.constantFrom('SPY', 'QQQ', 'IWM'),
          direction: fc.constantFrom('CALL', 'PUT'),
          quantity: fc.integer({ min: 1, max: 10 }),
          entryPrice: fc.double({ min: 1, max: 1000 }),
        }),
        async (data) => {
          positionManager.clear();

          const signal: Signal = {
            id: `signal_${Date.now()}_${Math.random()}`,
            source: 'TRADINGVIEW',
            symbol: data.symbol,
            direction: data.direction,
            timeframe: '5m',
            timestamp: new Date(),
            metadata: {},
          };

          const result = await positionManager.openPosition(
            signal,
            data.quantity,
            data.entryPrice
          );

          if (result.success && result.position) {
            const position = result.position;

            // All required fields must be present
            expect(position.entryPrice).toBeDefined();
            expect(position.entryTime).toBeDefined();
            expect(position.quantity).toBeDefined();
            expect(position.symbol).toBeDefined();

            // Fields must have correct values
            expect(position.entryPrice).toBe(data.entryPrice);
            expect(position.quantity).toBe(data.quantity);
            expect(position.symbol).toBe(data.symbol);
            expect(position.entryTime).toBeInstanceOf(Date);

            // Additional required fields
            expect(position.id).toBeDefined();
            expect(position.signalId).toBe(signal.id);
            expect(position.direction).toBe(data.direction);
            expect(position.status).toBe('OPEN');
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 29: Position P&L Calculation
   * For any open position and current market price, the unrealized P&L SHALL equal
   * (current price - entry price) × quantity × multiplier, where multiplier is 100 for options.
   * Validates: Requirements 14.3
   */
  it('Property 29: P&L calculation formula is correct', () => {
    fc.assert(
      fc.property(
        fc.record({
          entryPrice: fc.double({ min: 1, max: 1000 }),
          currentPrice: fc.double({ min: 1, max: 1000 }),
          quantity: fc.integer({ min: 1, max: 10 }),
        }),
        (data) => {
          const position: Position = {
            id: 'test',
            signalId: 'signal-1',
            symbol: 'SPY',
            direction: 'CALL',
            quantity: data.quantity,
            entryPrice: data.entryPrice,
            entryTime: new Date(),
            status: 'OPEN',
          };

          const unrealizedPnL = positionManager.calculateUnrealizedPnL(
            position,
            data.currentPrice
          );

          // Expected: (current - entry) × quantity × 100
          const expectedPnL = (data.currentPrice - data.entryPrice) * data.quantity * 100;

          expect(unrealizedPnL).toBeCloseTo(expectedPnL, 5);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 30: Duplicate Position Prevention
   * For any signal ID, attempting to open a position twice SHALL result in
   * the second attempt being rejected or returning the existing position without creating a duplicate.
   * Validates: Requirements 14.5
   */
  it('Property 30: Duplicate positions are prevented', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          symbol: fc.constantFrom('SPY', 'QQQ'),
          direction: fc.constantFrom('CALL', 'PUT'),
          quantity: fc.integer({ min: 1, max: 5 }),
          entryPrice: fc.double({ min: 100, max: 500 }),
        }),
        async (data) => {
          positionManager.clear();

          const signal: Signal = {
            id: `signal_${Date.now()}_${Math.random()}`,
            source: 'TRADINGVIEW',
            symbol: data.symbol,
            direction: data.direction,
            timeframe: '5m',
            timestamp: new Date(),
            metadata: {},
          };

          // First attempt should succeed
          const result1 = await positionManager.openPosition(
            signal,
            data.quantity,
            data.entryPrice
          );

          expect(result1.success).toBe(true);
          expect(result1.position).toBeDefined();

          // Second attempt with same signal ID should fail
          const result2 = await positionManager.openPosition(
            signal,
            data.quantity,
            data.entryPrice
          );

          expect(result2.success).toBe(false);
          expect(result2.error).toContain('already exists');

          // Should only have one position
          const openPositions = positionManager.getOpenPositions();
          const positionsForSignal = openPositions.filter(p => p.signalId === signal.id);
          expect(positionsForSignal.length).toBe(1);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Additional property: Realized P&L equals unrealized P&L at exit
   */
  it('Property: Realized P&L matches unrealized P&L at exit price', () => {
    fc.assert(
      fc.property(
        fc.record({
          entryPrice: fc.double({ min: 100, max: 500 }),
          exitPrice: fc.double({ min: 100, max: 500 }),
          quantity: fc.integer({ min: 1, max: 10 }),
        }),
        (data) => {
          const position: Position = {
            id: 'test',
            signalId: 'signal-1',
            symbol: 'SPY',
            direction: 'CALL',
            quantity: data.quantity,
            entryPrice: data.entryPrice,
            entryTime: new Date(),
            status: 'OPEN',
          };

          const unrealizedPnL = positionManager.calculateUnrealizedPnL(
            position,
            data.exitPrice
          );

          const realizedPnL = positionManager.calculateRealizedPnL(
            position,
            data.exitPrice
          );

          // Realized and unrealized should be equal at the same price
          expect(realizedPnL).toBeCloseTo(unrealizedPnL, 5);
        }
      ),
      { numRuns: 100 }
    );
  });
});

describe('Position Manager Unit Tests', () => {
  let mockSupabaseClient: any;
  let positionManager: PositionManager;

  beforeEach(() => {
    mockSupabaseClient = {
      from: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
    };
    
    mockSupabaseClient.insert.mockResolvedValue({ error: null });
    mockSupabaseClient.update.mockResolvedValue({ error: null });
    mockSupabaseClient.select.mockResolvedValue({ data: [], error: null });
    
    positionManager = new PositionManager(mockSupabaseClient, defaultConfig);
  });

  it('should open a position successfully', async () => {
    const signal: Signal = {
      id: 'signal-1',
      source: 'TRADINGVIEW',
      symbol: 'SPY',
      direction: 'CALL',
      timeframe: '5m',
      timestamp: new Date(),
      metadata: {},
    };

    const result = await positionManager.openPosition(signal, 2, 450);

    expect(result.success).toBe(true);
    expect(result.position).toBeDefined();
    expect(result.position!.symbol).toBe('SPY');
    expect(result.position!.quantity).toBe(2);
    expect(result.position!.entryPrice).toBe(450);
  });

  it('should prevent duplicate positions', async () => {
    const signal: Signal = {
      id: 'signal-1',
      source: 'TRADINGVIEW',
      symbol: 'SPY',
      direction: 'CALL',
      timeframe: '5m',
      timestamp: new Date(),
      metadata: {},
    };

    await positionManager.openPosition(signal, 2, 450);
    const result = await positionManager.openPosition(signal, 2, 450);

    expect(result.success).toBe(false);
    expect(result.error).toContain('already exists');
  });

  it('should calculate unrealized P&L correctly', () => {
    const position: Position = {
      id: 'pos-1',
      signalId: 'signal-1',
      symbol: 'SPY',
      direction: 'CALL',
      quantity: 2,
      entryPrice: 450,
      entryTime: new Date(),
      status: 'OPEN',
    };

    const pnl = positionManager.calculateUnrealizedPnL(position, 460);

    // (460 - 450) × 2 × 100 = 2000
    expect(pnl).toBe(2000);
  });

  it('should calculate negative P&L correctly', () => {
    const position: Position = {
      id: 'pos-1',
      signalId: 'signal-1',
      symbol: 'SPY',
      direction: 'CALL',
      quantity: 2,
      entryPrice: 450,
      entryTime: new Date(),
      status: 'OPEN',
    };

    const pnl = positionManager.calculateUnrealizedPnL(position, 440);

    // (440 - 450) × 2 × 100 = -2000
    expect(pnl).toBe(-2000);
  });

  it('should update position P&L', async () => {
    const signal: Signal = {
      id: 'signal-1',
      source: 'TRADINGVIEW',
      symbol: 'SPY',
      direction: 'CALL',
      timeframe: '5m',
      timestamp: new Date(),
      metadata: {},
    };

    const openResult = await positionManager.openPosition(signal, 2, 450);
    const positionId = openResult.position!.id;

    const updateResult = await positionManager.updatePositionPnL(positionId, 460);

    expect(updateResult.success).toBe(true);
    expect(updateResult.position!.currentPrice).toBe(460);
    expect(updateResult.position!.unrealizedPnL).toBe(2000);
  });

  it('should close a position', async () => {
    const signal: Signal = {
      id: 'signal-1',
      source: 'TRADINGVIEW',
      symbol: 'SPY',
      direction: 'CALL',
      timeframe: '5m',
      timestamp: new Date(),
      metadata: {},
    };

    const openResult = await positionManager.openPosition(signal, 2, 450);
    const positionId = openResult.position!.id;

    const closeResult = await positionManager.closePosition(positionId, 460);

    expect(closeResult.success).toBe(true);
    expect(closeResult.realizedPnL).toBe(2000);
    expect(closeResult.position!.status).toBe('CLOSED');
  });

  it('should get open positions', async () => {
    const signal1: Signal = {
      id: 'signal-1',
      source: 'TRADINGVIEW',
      symbol: 'SPY',
      direction: 'CALL',
      timeframe: '5m',
      timestamp: new Date(),
      metadata: {},
    };

    const signal2: Signal = {
      id: 'signal-2',
      source: 'TRADINGVIEW',
      symbol: 'QQQ',
      direction: 'PUT',
      timeframe: '5m',
      timestamp: new Date(),
      metadata: {},
    };

    await positionManager.openPosition(signal1, 2, 450);
    await positionManager.openPosition(signal2, 1, 380);

    const openPositions = positionManager.getOpenPositions();

    expect(openPositions.length).toBe(2);
  });

  it('should get position by signal ID', async () => {
    const signal: Signal = {
      id: 'signal-1',
      source: 'TRADINGVIEW',
      symbol: 'SPY',
      direction: 'CALL',
      timeframe: '5m',
      timestamp: new Date(),
      metadata: {},
    };

    await positionManager.openPosition(signal, 2, 450);

    const position = positionManager.getPositionBySignalId('signal-1');

    expect(position).not.toBeNull();
    expect(position!.symbol).toBe('SPY');
  });

  it('should calculate total exposure', async () => {
    const signal1: Signal = {
      id: 'signal-1',
      source: 'TRADINGVIEW',
      symbol: 'SPY',
      direction: 'CALL',
      timeframe: '5m',
      timestamp: new Date(),
      metadata: {},
    };

    const signal2: Signal = {
      id: 'signal-2',
      source: 'TRADINGVIEW',
      symbol: 'QQQ',
      direction: 'PUT',
      timeframe: '5m',
      timestamp: new Date(),
      metadata: {},
    };

    await positionManager.openPosition(signal1, 2, 450); // 2 × 450 × 100 = 90,000
    await positionManager.openPosition(signal2, 1, 380); // 1 × 380 × 100 = 38,000

    const totalExposure = positionManager.getTotalExposure();

    expect(totalExposure).toBe(128000);
  });

  it('should check if max exposure would be exceeded', async () => {
    const signal: Signal = {
      id: 'signal-1',
      source: 'TRADINGVIEW',
      symbol: 'SPY',
      direction: 'CALL',
      timeframe: '5m',
      timestamp: new Date(),
      metadata: {},
    };

    await positionManager.openPosition(signal, 2, 450);

    const wouldExceed = positionManager.wouldExceedMaxExposure(100000);

    // Current: 90,000, Additional: 100,000, Total: 190,000
    // Max: 50,000 (from config)
    expect(wouldExceed).toBe(true);
  });
});
