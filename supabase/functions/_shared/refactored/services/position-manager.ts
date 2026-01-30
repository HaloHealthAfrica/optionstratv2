/**
 * Position Manager with P&L tracking
 * Implements Requirements 14.1, 14.2, 14.3, 14.4, 14.5
 */

import { Position, Signal, Config } from '../core/types.ts';

export class PositionManager {
  private positions: Map<string, Position> = new Map();
  private positionsBySignalId: Map<string, string> = new Map();

  constructor(
    private supabaseClient: any,
    private config: Config
  ) {}

  /**
   * Open a new position
   * Implements Requirements 14.1, 14.2, 14.5
   */
  async openPosition(
    signal: Signal,
    quantity: number,
    entryPrice: number
  ): Promise<{ success: boolean; position?: Position; error?: string }> {
    try {
      // Check for duplicate position (Requirement 14.5)
      if (this.positionsBySignalId.has(signal.id)) {
        const existingPositionId = this.positionsBySignalId.get(signal.id)!;
        const existingPosition = this.positions.get(existingPositionId);
        
        return {
          success: false,
          position: existingPosition,
          error: 'Position already exists for this signal',
        };
      }

      const parsedSignal = signal.metadata?.parsed_signal as Record<string, unknown> | undefined;
      const strike = typeof parsedSignal?.strike === 'number' ? parsedSignal.strike : undefined;
      const expiration = typeof parsedSignal?.expiration === 'string' ? parsedSignal.expiration : undefined;
      const optionType = typeof parsedSignal?.option_type === 'string'
        ? (parsedSignal.option_type as 'CALL' | 'PUT')
        : undefined;
      const underlying = typeof parsedSignal?.underlying === 'string' ? parsedSignal.underlying : signal.symbol;
      const timeframe = typeof signal.timeframe === 'string' ? signal.timeframe : undefined;

      // Create position with all required fields (Requirement 14.1)
      const position: Position = {
        id: this.generatePositionId(),
        signalId: signal.id,
        symbol: signal.symbol,
        direction: signal.direction,
        quantity,
        entryPrice,
        entryTime: new Date(),
        status: 'OPEN',
        underlying,
        strike,
        expiration,
        optionType,
        timeframe,
      };

      // Persist to database immediately (Requirement 14.2)
      const { error: dbError } = await this.supabaseClient
        .from('refactored_positions')
        .insert({
          id: position.id,
          signal_id: position.signalId,
          symbol: position.symbol,
          direction: position.direction,
          quantity: position.quantity,
          entry_price: position.entryPrice,
          entry_time: position.entryTime.toISOString(),
          status: position.status,
          underlying: position.underlying ?? null,
          strike: position.strike ?? null,
          expiration: position.expiration ?? null,
          option_type: position.optionType ?? null,
          timeframe: position.timeframe ?? null,
        });

      if (dbError) {
        throw new Error(`Failed to persist position: ${dbError.message}`);
      }

      // Store in memory
      this.positions.set(position.id, position);
      this.positionsBySignalId.set(signal.id, position.id);

      return {
        success: true,
        position,
      };
    } catch (error) {
      return {
        success: false,
        error: (error as Error).message,
      };
    }
  }

  /**
   * Calculate unrealized P&L for an open position
   * Implements Requirement 14.3
   * Formula: (current - entry) × quantity × 100
   */
  calculateUnrealizedPnL(position: Position, currentPrice: number): number {
    if (position.status !== 'OPEN') {
      return 0;
    }

    const priceDiff = currentPrice - position.entryPrice;
    const multiplier = 100; // Options multiplier
    
    return priceDiff * position.quantity * multiplier;
  }

  /**
   * Calculate realized P&L for a closed position
   * Implements Requirement 14.4
   */
  calculateRealizedPnL(position: Position, exitPrice: number): number {
    const priceDiff = exitPrice - position.entryPrice;
    const multiplier = 100; // Options multiplier
    
    return priceDiff * position.quantity * multiplier;
  }

  /**
   * Update position with current market price and P&L
   * Implements Requirement 14.3
   */
  async updatePositionPnL(
    positionId: string,
    currentPrice: number
  ): Promise<{ success: boolean; position?: Position; error?: string }> {
    try {
      const position = this.positions.get(positionId);
      
      if (!position) {
        return {
          success: false,
          error: 'Position not found',
        };
      }

      if (position.status !== 'OPEN') {
        return {
          success: false,
          error: 'Position is not open',
        };
      }

      // Calculate unrealized P&L
      const unrealizedPnL = this.calculateUnrealizedPnL(position, currentPrice);

      // Update position
      position.currentPrice = currentPrice;
      position.unrealizedPnL = unrealizedPnL;

      // Update in memory
      this.positions.set(positionId, position);

      return {
        success: true,
        position,
      };
    } catch (error) {
      return {
        success: false,
        error: (error as Error).message,
      };
    }
  }

  /**
   * Close a position
   * Implements Requirement 14.4
   */
  async closePosition(
    positionId: string,
    exitPrice: number
  ): Promise<{ success: boolean; position?: Position; realizedPnL?: number; error?: string }> {
    try {
      const position = this.positions.get(positionId);
      
      if (!position) {
        return {
          success: false,
          error: 'Position not found',
        };
      }

      if (position.status !== 'OPEN') {
        return {
          success: false,
          error: 'Position is already closed',
        };
      }

      // Calculate realized P&L
      const realizedPnL = this.calculateRealizedPnL(position, exitPrice);

      // Update position
      position.status = 'CLOSED';
      position.currentPrice = exitPrice;
      position.unrealizedPnL = 0;

      // Update database
      const { error: dbError } = await this.supabaseClient
        .from('refactored_positions')
        .update({
          status: 'CLOSED',
          exit_price: exitPrice,
          exit_time: new Date().toISOString(),
          realized_pnl: realizedPnL,
          updated_at: new Date().toISOString(),
        })
        .eq('id', positionId);

      if (dbError) {
        throw new Error(`Failed to update position: ${dbError.message}`);
      }

      // Update in memory
      this.positions.set(positionId, position);

      return {
        success: true,
        position,
        realizedPnL,
      };
    } catch (error) {
      return {
        success: false,
        error: (error as Error).message,
      };
    }
  }

  /**
   * Get all open positions
   * Implements Requirement 14.4
   */
  getOpenPositions(): Position[] {
    return Array.from(this.positions.values()).filter(
      position => position.status === 'OPEN'
    );
  }

  /**
   * Get position by signal ID
   * Implements Requirement 14.4
   */
  getPositionBySignalId(signalId: string): Position | null {
    const positionId = this.positionsBySignalId.get(signalId);
    if (!positionId) {
      return null;
    }
    return this.positions.get(positionId) || null;
  }

  /**
   * Get position by ID
   */
  getPositionById(positionId: string): Position | null {
    return this.positions.get(positionId) || null;
  }

  /**
   * Get all positions for a symbol
   */
  getPositionsBySymbol(symbol: string): Position[] {
    return Array.from(this.positions.values()).filter(
      position => position.symbol === symbol
    );
  }

  /**
   * Get total exposure (sum of all open position values)
   */
  getTotalExposure(): number {
    return this.getOpenPositions().reduce((total, position) => {
      const positionValue = position.entryPrice * position.quantity * 100;
      return total + positionValue;
    }, 0);
  }

  /**
   * Get total unrealized P&L across all open positions
   */
  getTotalUnrealizedPnL(): number {
    return this.getOpenPositions().reduce((total, position) => {
      return total + (position.unrealizedPnL || 0);
    }, 0);
  }

  /**
   * Check if maximum exposure limit is exceeded
   */
  wouldExceedMaxExposure(additionalExposure: number): boolean {
    const currentExposure = this.getTotalExposure();
    const totalExposure = currentExposure + additionalExposure;
    return totalExposure > this.config.risk.maxTotalExposure;
  }

  /**
   * Generate unique position ID
   */
  private generatePositionId(): string {
    return `pos_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Load positions from database (for initialization)
   */
  async loadPositions(): Promise<{ success: boolean; count?: number; error?: string }> {
    try {
      const { data, error } = await this.supabaseClient
        .from('refactored_positions')
        .select('*')
        .eq('status', 'OPEN');

      if (error) {
        throw new Error(`Failed to load positions: ${error.message}`);
      }

      if (data) {
        for (const row of data) {
          const position: Position = {
            id: row.id,
            signalId: row.signal_id,
            symbol: row.symbol,
            direction: row.direction,
            quantity: row.quantity,
            entryPrice: row.entry_price,
            entryTime: new Date(row.entry_time),
            currentPrice: row.current_price,
            unrealizedPnL: row.unrealized_pnl,
            status: row.status,
            underlying: row.underlying ?? undefined,
            strike: row.strike ?? undefined,
            expiration: row.expiration ?? undefined,
            optionType: row.option_type ?? undefined,
            timeframe: row.timeframe ?? undefined,
          };

          this.positions.set(position.id, position);
          this.positionsBySignalId.set(position.signalId, position.id);
        }
      }

      return {
        success: true,
        count: data?.length || 0,
      };
    } catch (error) {
      return {
        success: false,
        error: (error as Error).message,
      };
    }
  }

  /**
   * Clear all positions (for testing)
   */
  clear(): void {
    this.positions.clear();
    this.positionsBySignalId.clear();
  }
}
