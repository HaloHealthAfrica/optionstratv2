/**
 * Signal Processing Pipeline
 * 
 * Orchestrates signal flow through stages:
 * reception → normalization → validation → decision → execution
 * 
 * Requirements: 10.1, 10.2, 10.3, 10.4
 */

import { Signal, EntryDecision, Config } from '../core/types.ts';
import { SignalNormalizer } from './signal-normalizer.ts';
import { SignalValidator } from '../validation/signal-validator.ts';
import { DeduplicationCache } from '../cache/deduplication-cache.ts';
import { DecisionOrchestrator } from '../orchestrator/decision-orchestrator.ts';
import { PositionManager } from '../services/position-manager.ts';
import { AuditLogger } from '../monitoring/audit-logger.ts';

export type PipelineStage = 'RECEPTION' | 'NORMALIZATION' | 'VALIDATION' | 'DEDUPLICATION' | 'DECISION' | 'EXECUTION';

export interface PipelineResult {
  success: boolean;
  signal: Signal;
  trackingId: string;
  stage: PipelineStage;
  failureReason?: string;
  decision?: EntryDecision;
  timestamp: Date;
}

export interface PipelineFailure {
  trackingId: string;
  signal: Signal;
  stage: PipelineStage;
  reason: string;
  timestamp: Date;
}

/**
 * SignalPipeline orchestrates the complete signal processing flow
 */
export class SignalPipeline {
  private failures: Map<string, PipelineFailure> = new Map();
  
  constructor(
    private normalizer: SignalNormalizer,
    private validator: SignalValidator,
    private deduplicationCache: DeduplicationCache,
    private orchestrator: DecisionOrchestrator,
    private positionManager: PositionManager,
    private config: Config,
    private auditLogger?: AuditLogger
  ) {}

  /**
   * Process a signal through the complete pipeline
   * 
   * Stages:
   * 1. Reception - Receive raw signal data
   * 2. Normalization - Convert to unified Signal format
   * 3. Validation - Check if signal meets criteria
   * 4. Deduplication - Check for duplicate signals
   * 5. Decision - Make entry decision
   * 6. Execution - Execute trade (if ENTER decision)
   * 
   * Requirements: 10.1, 10.2, 10.3, 10.4
   */
  async processSignal(rawSignal: any): Promise<PipelineResult> {
    const startTime = new Date();
    let currentStage: PipelineStage = 'RECEPTION';
    let signal: Signal | null = null;
    let trackingId = '';

    try {
      // Stage 1: Reception
      currentStage = 'RECEPTION';
      this.logStageTransition(trackingId, currentStage, startTime);
      
      // Stage 2: Normalization
      currentStage = 'NORMALIZATION';
      signal = await this.normalizer.normalize(rawSignal);
      trackingId = signal.id;
      this.logStageTransition(trackingId, currentStage, new Date());

      // Audit log signal reception (Requirement 20.1)
      if (this.auditLogger) {
        this.auditLogger.logSignalReceived(signal).catch((error) => {
          console.warn(`[Pipeline] Audit log failed for signal ${trackingId}:`, error);
        });
      }
      
      // Stage 3: Validation
      currentStage = 'VALIDATION';
      this.logStageTransition(trackingId, currentStage, new Date());
      const validationResult = await this.validator.validate(signal);
      
      if (!validationResult.valid) {
        return this.recordFailure(
          signal,
          trackingId,
          currentStage,
          validationResult.rejectionReason || 'Validation failed'
        );
      }
      
      // Stage 4: Deduplication
      currentStage = 'DEDUPLICATION';
      this.logStageTransition(trackingId, currentStage, new Date());
      const isDuplicate = this.deduplicationCache.isDuplicate(signal);
      
      if (isDuplicate) {
        return this.recordFailure(
          signal,
          trackingId,
          currentStage,
          'Duplicate signal detected'
        );
      }
      
      // Stage 5: Decision
      currentStage = 'DECISION';
      this.logStageTransition(trackingId, currentStage, new Date());
      const decision = await this.orchestrator.orchestrateEntryDecision(signal);
      
      if (decision.decision === 'REJECT') {
        return this.recordFailure(
          signal,
          trackingId,
          currentStage,
          decision.reasoning.join('; ')
        );
      }
      
      // Stage 6: Execution
      currentStage = 'EXECUTION';
      this.logStageTransition(trackingId, currentStage, new Date());

      // Execute position if decision is ENTER
      if (decision.decision === 'ENTER') {
        const entryPrice = this.resolveEntryPrice(signal);

        if (entryPrice === null) {
          return this.recordFailure(
            signal,
            trackingId,
            currentStage,
            'Missing entry price in signal metadata'
          );
        }

        const openResult = await this.positionManager.openPosition(
          signal,
          decision.positionSize,
          entryPrice
        );

        if (!openResult.success || !openResult.position) {
          return this.recordFailure(
            signal,
            trackingId,
            currentStage,
            openResult.error || 'Failed to open position'
          );
        }

        if (this.auditLogger) {
          this.auditLogger.logTradeOpened(openResult.position).catch((error) => {
            console.warn(`[Pipeline] Audit log failed for trade ${openResult.position?.id}:`, error);
          });
        }
      } else {
        console.log(`[Pipeline] Signal ${trackingId} ready for execution:`, {
          symbol: signal.symbol,
          direction: signal.direction,
          positionSize: decision.positionSize,
          confidence: decision.confidence,
        });
      }
      
      return {
        success: true,
        signal,
        trackingId,
        stage: currentStage,
        decision,
        timestamp: new Date(),
      };
      
    } catch (error) {
      // Pipeline error isolation (Requirement 19.4)
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[Pipeline] Error at stage ${currentStage}:`, errorMessage);
      
      if (signal) {
        return this.recordFailure(
          signal,
          trackingId || 'unknown',
          currentStage,
          `Error: ${errorMessage}`
        );
      }
      
      // If we don't have a signal yet, create a minimal failure record
      return {
        success: false,
        signal: signal as any,
        trackingId: trackingId || 'unknown',
        stage: currentStage,
        failureReason: `Error: ${errorMessage}`,
        timestamp: new Date(),
      };
    }
  }

  /**
   * Log pipeline stage transitions with timestamps and tracking IDs
   * Requirement: 10.3
   */
  private logStageTransition(trackingId: string, stage: PipelineStage, timestamp: Date): void {
    console.log(`[Pipeline] ${trackingId || 'pending'} → ${stage} at ${timestamp.toISOString()}`);
  }

  /**
   * Record failure with tracking ID and reason
   * Requirement: 10.4
   */
  private recordFailure(
    signal: Signal,
    trackingId: string,
    stage: PipelineStage,
    reason: string
  ): PipelineResult {
    const failure: PipelineFailure = {
      trackingId,
      signal,
      stage,
      reason,
      timestamp: new Date(),
    };
    
    this.failures.set(trackingId, failure);
    
    console.log(`[Pipeline] Signal ${trackingId} failed at ${stage}: ${reason}`);
    
    return {
      success: false,
      signal,
      trackingId,
      stage,
      failureReason: reason,
      timestamp: failure.timestamp,
    };
  }

  /**
   * Resolve entry price from signal metadata
   */
  private resolveEntryPrice(signal: Signal): number | null {
    const candidates = [
      signal.metadata?.price,
      signal.metadata?.entryPrice,
      signal.metadata?.entry_price,
      signal.metadata?.limit_price,
      signal.metadata?.limitPrice,
      signal.metadata?.last,
      signal.metadata?.close,
      signal.metadata?.current_price,
      signal.metadata?.underlying_price,
    ];

    for (const candidate of candidates) {
      if (typeof candidate === 'number' && candidate > 0) {
        return candidate;
      }
      if (typeof candidate === 'string') {
        const parsed = Number(candidate);
        if (!Number.isNaN(parsed) && parsed > 0) {
          return parsed;
        }
      }
    }

    return null;
  }

  /**
   * Get failure record by tracking ID
   */
  getFailure(trackingId: string): PipelineFailure | undefined {
    return this.failures.get(trackingId);
  }

  /**
   * Get all failures
   */
  getAllFailures(): PipelineFailure[] {
    return Array.from(this.failures.values());
  }

  /**
   * Clear old failures (older than specified minutes)
   */
  clearOldFailures(olderThanMinutes: number): void {
    const cutoffTime = new Date(Date.now() - olderThanMinutes * 60 * 1000);
    
    for (const [trackingId, failure] of this.failures.entries()) {
      if (failure.timestamp < cutoffTime) {
        this.failures.delete(trackingId);
      }
    }
  }

  /**
   * Get pipeline status - shows signals in each stage
   * Requirement: 10.5
   * 
   * Note: This is a simplified implementation. In production, you would
   * track signals actively in each stage using a more sophisticated state machine.
   */
  getPipelineStatus(): Record<PipelineStage, number> {
    // For now, just return failure counts by stage
    const status: Record<PipelineStage, number> = {
      RECEPTION: 0,
      NORMALIZATION: 0,
      VALIDATION: 0,
      DEDUPLICATION: 0,
      DECISION: 0,
      EXECUTION: 0,
    };
    
    for (const failure of this.failures.values()) {
      status[failure.stage]++;
    }
    
    return status;
  }

  /**
   * Process multiple signals with error isolation
   * 
   * Individual signal failures do not prevent processing of subsequent signals
   * Requirement: 19.4
   */
  async processSignalBatch(rawSignals: any[]): Promise<PipelineResult[]> {
    const results: PipelineResult[] = [];
    
    for (const rawSignal of rawSignals) {
      try {
        // Process each signal independently
        const result = await this.processSignal(rawSignal);
        results.push(result);
      } catch (error) {
        // Isolate error - continue processing subsequent signals
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error('[Pipeline] Signal processing failed, continuing with next signal:', errorMessage);
        
        // Create a failure result for this signal
        results.push({
          success: false,
          signal: null as any,
          trackingId: 'batch-error',
          stage: 'RECEPTION',
          failureReason: `Batch processing error: ${errorMessage}`,
          timestamp: new Date(),
        });
      }
    }
    
    console.log(`[Pipeline] Batch processing complete: ${results.length} signals processed, ${results.filter(r => r.success).length} successful`);
    
    return results;
  }
}
