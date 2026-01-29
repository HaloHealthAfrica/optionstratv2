/**
 * Database Entity Validation
 * 
 * Validates database query results against TypeScript interfaces
 * Handles null values explicitly and fails fast on schema mismatches
 * 
 * Requirements: 9.2, 9.3, 9.5
 */

import { Signal, Position, ContextData, GEXSignal, Direction, SignalSource, Trend, Regime } from '../core/types.ts';

/**
 * Validation error for schema mismatches
 */
export class SchemaValidationError extends Error {
  constructor(
    message: string,
    public entityType: string,
    public field: string,
    public expectedType: string,
    public actualValue: any
  ) {
    super(message);
    this.name = 'SchemaValidationError';
  }
}

/**
 * Database entity types with explicit null handling
 */
export interface SignalEntity {
  id: string;
  source: string;
  symbol: string;
  direction: string;
  timeframe: string;
  timestamp: string | Date;
  metadata: Record<string, any> | null;
  validation_result: Record<string, any> | null;
  created_at: string | Date;
}

export interface PositionEntity {
  id: string;
  signal_id: string;
  symbol: string;
  direction: string;
  quantity: number;
  entry_price: number;
  entry_time: string | Date;
  current_price: number | null;
  unrealized_pnl: number | null;
  exit_price: number | null;
  exit_time: string | Date | null;
  realized_pnl: number | null;
  status: string;
  created_at: string | Date;
  updated_at: string | Date;
}

export interface GEXSignalEntity {
  id: string;
  symbol: string;
  timeframe: string;
  strength: number;
  direction: string;
  timestamp: string | Date;
  age: number | null;
  metadata: Record<string, any> | null;
  created_at: string | Date;
}

export interface ContextSnapshotEntity {
  id: string;
  vix: number;
  trend: string;
  bias: number;
  regime: string;
  timestamp: string | Date;
  created_at: string | Date;
}

/**
 * Validate and reconstruct Signal from database row
 * Requirement: 9.2, 9.3
 */
export function validateSignal(row: any): Signal {
  if (!row) {
    throw new SchemaValidationError(
      'Signal row is null or undefined',
      'Signal',
      'row',
      'object',
      row
    );
  }

  // Validate required fields
  if (typeof row.id !== 'string' || !row.id) {
    throw new SchemaValidationError(
      'Signal.id must be a non-empty string',
      'Signal',
      'id',
      'string',
      row.id
    );
  }

  if (typeof row.source !== 'string' || !row.source) {
    throw new SchemaValidationError(
      'Signal.source must be a non-empty string',
      'Signal',
      'source',
      'string',
      row.source
    );
  }

  if (typeof row.symbol !== 'string' || !row.symbol) {
    throw new SchemaValidationError(
      'Signal.symbol must be a non-empty string',
      'Signal',
      'symbol',
      'string',
      row.symbol
    );
  }

  if (typeof row.direction !== 'string' || !['CALL', 'PUT'].includes(row.direction)) {
    throw new SchemaValidationError(
      'Signal.direction must be CALL or PUT',
      'Signal',
      'direction',
      'CALL | PUT',
      row.direction
    );
  }

  if (typeof row.timeframe !== 'string' || !row.timeframe) {
    throw new SchemaValidationError(
      'Signal.timeframe must be a non-empty string',
      'Signal',
      'timeframe',
      'string',
      row.timeframe
    );
  }

  // Handle null values explicitly (Requirement 9.3)
  const metadata = row.metadata !== null && row.metadata !== undefined 
    ? row.metadata 
    : {};

  // Reconstruct Signal
  return {
    id: row.id,
    source: row.source as SignalSource,
    symbol: row.symbol,
    direction: row.direction as Direction,
    timeframe: row.timeframe,
    timestamp: new Date(row.timestamp),
    metadata,
  };
}

/**
 * Validate and reconstruct Position from database row
 * Requirement: 9.2, 9.3
 */
export function validatePosition(row: any): Position {
  if (!row) {
    throw new SchemaValidationError(
      'Position row is null or undefined',
      'Position',
      'row',
      'object',
      row
    );
  }

  // Validate required fields
  if (typeof row.id !== 'string' || !row.id) {
    throw new SchemaValidationError(
      'Position.id must be a non-empty string',
      'Position',
      'id',
      'string',
      row.id
    );
  }

  if (typeof row.signal_id !== 'string' || !row.signal_id) {
    throw new SchemaValidationError(
      'Position.signal_id must be a non-empty string',
      'Position',
      'signal_id',
      'string',
      row.signal_id
    );
  }

  if (typeof row.quantity !== 'number' || row.quantity <= 0) {
    throw new SchemaValidationError(
      'Position.quantity must be a positive number',
      'Position',
      'quantity',
      'number > 0',
      row.quantity
    );
  }

  if (typeof row.entry_price !== 'number' || row.entry_price <= 0) {
    throw new SchemaValidationError(
      'Position.entry_price must be a positive number',
      'Position',
      'entry_price',
      'number > 0',
      row.entry_price
    );
  }

  // Handle null values explicitly (Requirement 9.3)
  const currentPrice = row.current_price !== null && row.current_price !== undefined
    ? row.current_price
    : undefined;

  const unrealizedPnL = row.unrealized_pnl !== null && row.unrealized_pnl !== undefined
    ? row.unrealized_pnl
    : undefined;

  // Reconstruct Position
  return {
    id: row.id,
    signalId: row.signal_id,
    symbol: row.symbol,
    direction: row.direction as Direction,
    quantity: row.quantity,
    entryPrice: row.entry_price,
    entryTime: new Date(row.entry_time),
    currentPrice,
    unrealizedPnL,
    status: row.status as 'OPEN' | 'CLOSED',
  };
}

/**
 * Validate and reconstruct GEXSignal from database row
 * Requirement: 9.2, 9.3
 */
export function validateGEXSignal(row: any): GEXSignal {
  if (!row) {
    throw new SchemaValidationError(
      'GEXSignal row is null or undefined',
      'GEXSignal',
      'row',
      'object',
      row
    );
  }

  // Validate required fields
  if (typeof row.symbol !== 'string' || !row.symbol) {
    throw new SchemaValidationError(
      'GEXSignal.symbol must be a non-empty string',
      'GEXSignal',
      'symbol',
      'string',
      row.symbol
    );
  }

  if (typeof row.strength !== 'number' || row.strength < -1 || row.strength > 1) {
    throw new SchemaValidationError(
      'GEXSignal.strength must be a number between -1 and 1',
      'GEXSignal',
      'strength',
      'number [-1, 1]',
      row.strength
    );
  }

  // Handle null values explicitly (Requirement 9.3)
  const age = row.age !== null && row.age !== undefined
    ? row.age
    : 0;

  // Reconstruct GEXSignal
  return {
    symbol: row.symbol,
    timeframe: row.timeframe,
    strength: row.strength,
    direction: row.direction as Direction,
    timestamp: new Date(row.timestamp),
    age,
  };
}

/**
 * Validate and reconstruct ContextData from database row
 * Requirement: 9.2, 9.3
 */
export function validateContextData(row: any): ContextData {
  if (!row) {
    throw new SchemaValidationError(
      'ContextData row is null or undefined',
      'ContextData',
      'row',
      'object',
      row
    );
  }

  // Validate required fields
  if (typeof row.vix !== 'number' || row.vix < 0) {
    throw new SchemaValidationError(
      'ContextData.vix must be a non-negative number',
      'ContextData',
      'vix',
      'number >= 0',
      row.vix
    );
  }

  if (!['BULLISH', 'BEARISH', 'NEUTRAL'].includes(row.trend)) {
    throw new SchemaValidationError(
      'ContextData.trend must be BULLISH, BEARISH, or NEUTRAL',
      'ContextData',
      'trend',
      'BULLISH | BEARISH | NEUTRAL',
      row.trend
    );
  }

  if (typeof row.bias !== 'number' || row.bias < -1 || row.bias > 1) {
    throw new SchemaValidationError(
      'ContextData.bias must be a number between -1 and 1',
      'ContextData',
      'bias',
      'number [-1, 1]',
      row.bias
    );
  }

  if (!['LOW_VOL', 'HIGH_VOL', 'NORMAL'].includes(row.regime)) {
    throw new SchemaValidationError(
      'ContextData.regime must be LOW_VOL, HIGH_VOL, or NORMAL',
      'ContextData',
      'regime',
      'LOW_VOL | HIGH_VOL | NORMAL',
      row.regime
    );
  }

  // Reconstruct ContextData
  return {
    vix: row.vix,
    trend: row.trend as Trend,
    bias: row.bias,
    regime: row.regime as Regime,
    timestamp: new Date(row.timestamp),
  };
}

/**
 * Validate array of entities
 * Requirement: 9.2
 */
export function validateSignals(rows: any[]): Signal[] {
  if (!Array.isArray(rows)) {
    throw new SchemaValidationError(
      'Expected array of Signal rows',
      'Signal[]',
      'rows',
      'array',
      rows
    );
  }

  return rows.map((row, index) => {
    try {
      return validateSignal(row);
    } catch (error) {
      if (error instanceof SchemaValidationError) {
        throw new SchemaValidationError(
          `${error.message} (at index ${index})`,
          error.entityType,
          error.field,
          error.expectedType,
          error.actualValue
        );
      }
      throw error;
    }
  });
}

export function validatePositions(rows: any[]): Position[] {
  if (!Array.isArray(rows)) {
    throw new SchemaValidationError(
      'Expected array of Position rows',
      'Position[]',
      'rows',
      'array',
      rows
    );
  }

  return rows.map((row, index) => {
    try {
      return validatePosition(row);
    } catch (error) {
      if (error instanceof SchemaValidationError) {
        throw new SchemaValidationError(
          `${error.message} (at index ${index})`,
          error.entityType,
          error.field,
          error.expectedType,
          error.actualValue
        );
      }
      throw error;
    }
  });
}

export function validateGEXSignals(rows: any[]): GEXSignal[] {
  if (!Array.isArray(rows)) {
    throw new SchemaValidationError(
      'Expected array of GEXSignal rows',
      'GEXSignal[]',
      'rows',
      'array',
      rows
    );
  }

  return rows.map((row, index) => {
    try {
      return validateGEXSignal(row);
    } catch (error) {
      if (error instanceof SchemaValidationError) {
        throw new SchemaValidationError(
          `${error.message} (at index ${index})`,
          error.entityType,
          error.field,
          error.expectedType,
          error.actualValue
        );
      }
      throw error;
    }
  });
}
