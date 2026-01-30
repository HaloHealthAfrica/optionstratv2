/**
 * Unified Decision Orchestrator for entry and exit decisions
 * Implements Requirements 1.1, 2.1, 2.2, 6.2, 6.3, 6.5, 8.1, 8.2, 11.3, 12.4, 19.1
 */

import { Signal, EntryDecision, ExitDecision, Position, ContextData, Config, GEXSignal } from '../core/types.ts';
import { ContextCache } from '../cache/context-cache.ts';
import { GEXService } from '../services/gex-service.ts';
import { PositionManager } from '../services/position-manager.ts';
import { RiskManager } from '../services/risk-manager.ts';
import { PositionSizingService } from '../services/position-sizing-service.ts';
import { ConfluenceCalculator } from '../services/confluence-calculator.ts';
import { AuditLogger } from '../monitoring/audit-logger.ts';

export class DecisionOrchestrator {
  constructor(
    private contextCache: ContextCache,
    private gexService: GEXService,
    private positionManager: PositionManager,
    private riskManager: RiskManager,
    private positionSizingService: PositionSizingService,
    private confluenceCalculator: ConfluenceCalculator,
    private config: Config,
    private auditLogger?: AuditLogger
  ) {}

  /**
   * Orchestrate entry decision
   * Implements Requirements 2.1, 6.2, 6.3, 6.5, 11.3, 12.4
   * 
   * Flow:
   * 1. Fetch context data (with timeout)
   * 2. Fetch GEX signal (with graceful degradation)
   * 3. Calculate base confidence
   * 4. Apply context adjustments
   * 5. Apply positioning adjustments
   * 6. Apply GEX adjustments
   * 7. Clamp confidence to [0, 100]
   * 8. Calculate position size
   * 9. Return decision with full reasoning
   */
  async orchestrateEntryDecision(
    signal: Signal,
    allSignals: Signal[] = []
  ): Promise<EntryDecision> {
    const reasoning: string[] = [];
    let gexSignal: GEXSignal | null = null;
    const indicatorContext = this.evaluateIndicatorContext(signal);
    
    try {
      if (indicatorContext.rejectionReason) {
        reasoning.push(`Indicator context rejected: ${indicatorContext.rejectionReason}`);
        return this.createRejectionDecision(signal, indicatorContext.rejectionReason, reasoning);
      }

      if (indicatorContext.warnings.length > 0) {
        reasoning.push(`Indicator warnings: ${indicatorContext.warnings.join('; ')}`);
      }

      // Step 1: Fetch context data with timeout (Requirement 8.1)
      reasoning.push('Fetching market context data...');
      let context: ContextData;
      
      try {
        context = await Promise.race([
          this.contextCache.getContext(),
          this.timeout(5000, 'Context fetch timeout')
        ]);
        reasoning.push(`Context fetched: VIX=${context.vix}, Trend=${context.trend}, Regime=${context.regime}`);
      } catch (error) {
        // Market data failure - reject signal (Requirement 8.1)
        reasoning.push(`Market data fetch failed: ${(error as Error).message}`);
        return this.createRejectionDecision(signal, 'Market data unavailable', reasoning);
      }

      // Step 2: Apply market filters
      reasoning.push('Applying market condition filters...');
      const filterResult = this.riskManager.applyMarketFilters(signal, context);
      
      if (!filterResult.passed) {
        reasoning.push(`Market filter failed: ${filterResult.rejectionReason}`);
        return this.createRejectionDecision(signal, filterResult.rejectionReason!, reasoning, context, gexSignal);
      }
      reasoning.push('Market filters passed');

      // Step 3: Fetch GEX signal with graceful degradation (Requirement 19.1)
      reasoning.push('Fetching GEX signal...');
      let gexAdjustment = 0;
      
      try {
        const gexData = await this.gexService.getSignalWithMetadata(signal.symbol, signal.timeframe);
        
        if (gexData.signal) {
          gexSignal = gexData.signal;
          reasoning.push(`GEX signal found: strength=${gexSignal.strength}, age=${(gexSignal.age / (60 * 60 * 1000)).toFixed(1)}h, stale=${gexData.isStale}`);
          
          // Apply GEX adjustment (Requirement 11.3)
          const gexStrength = gexSignal.strength;
          const effectiveWeight = gexData.effectiveWeight;
          gexAdjustment = gexStrength * effectiveWeight * this.config.confidence.gexAdjustmentRange;
          reasoning.push(`GEX adjustment: ${gexAdjustment.toFixed(1)} (strength=${gexStrength}, weight=${effectiveWeight})`);
        } else {
          reasoning.push('No GEX signal available - proceeding without GEX data');
        }
      } catch (error) {
        // Graceful degradation - continue without GEX (Requirement 19.1)
        reasoning.push(`GEX fetch failed: ${(error as Error).message} - continuing without GEX data`);
      }

      // Step 4: Calculate base confidence
      const baseConfidence = this.config.confidence.baseConfidence;
      reasoning.push(`Base confidence: ${baseConfidence}`);

      // Step 5: Apply context adjustments (Requirement 6.2)
      reasoning.push('Calculating context adjustments...');
      const contextAdjustment = this.riskManager.calculateContextAdjustment(signal, context);
      reasoning.push(`Context adjustment: ${contextAdjustment} (VIX, trend, bias)`);

      // Step 6: Apply positioning adjustments (Requirement 6.2)
      reasoning.push('Calculating positioning adjustments...');
      const positioningAdjustment = this.riskManager.calculatePositioningAdjustment(context);
      reasoning.push(`Positioning adjustment: ${positioningAdjustment} (regime)`);

      // Step 7: Calculate confluence and apply adjustment (Requirement 12.4)
      reasoning.push('Calculating confluence...');
      const confluenceScore = allSignals.length > 0 
        ? this.confluenceCalculator.calculateConfluence(signal, allSignals)
        : 0.5;
      
      const confluenceBoost = confluenceScore >= 0.7 ? 10 : 0;
      reasoning.push(`Confluence: ${confluenceScore.toFixed(2)} (boost: ${confluenceBoost})`);

      // Step 8: Apply indicator-specific adjustments
      const indicatorAdjustment = indicatorContext.confidenceDelta;
      if (indicatorAdjustment !== 0) {
        reasoning.push(`Indicator adjustment: ${indicatorAdjustment.toFixed(1)}`);
      }

      // Step 9: Calculate final confidence with ordered adjustments (Requirement 6.3)
      let confidence = baseConfidence;
      confidence += contextAdjustment;
      confidence += positioningAdjustment;
      confidence += gexAdjustment;
      confidence += confluenceBoost;
      confidence += indicatorAdjustment;

      // Step 10: Clamp confidence to [0, 100] (Requirement 6.5)
      const finalConfidence = Math.max(0, Math.min(100, confidence));
      reasoning.push(`Final confidence: ${finalConfidence} (clamped from ${confidence.toFixed(1)})`);

      // Step 11: Calculate position size
      reasoning.push('Calculating position size...');
      const sizingResult = this.positionSizingService.calculateSize(
        signal,
        finalConfidence,
        context,
        confluenceScore
      );

      // Apply VIX position size reduction if needed
      let finalSize = sizingResult.size;
      if (filterResult.positionSizeMultiplier < 1) {
        finalSize = Math.floor(finalSize * filterResult.positionSizeMultiplier);
        reasoning.push(`Position size reduced by VIX: ${sizingResult.size} → ${finalSize}`);
      }

      if (indicatorContext.sizeMultiplier !== 1) {
        const adjustedSize = Math.floor(finalSize * indicatorContext.sizeMultiplier);
        reasoning.push(`Indicator size multiplier ${indicatorContext.sizeMultiplier.toFixed(2)}: ${finalSize} → ${adjustedSize}`);
        finalSize = adjustedSize;
      }

      reasoning.push(`Position size: ${finalSize} contracts`);

      // Step 12: Check if size meets minimum threshold
      if (finalSize < this.config.sizing.minSize) {
        reasoning.push(`Position size ${finalSize} below minimum ${this.config.sizing.minSize} - rejecting`);
        return this.createRejectionDecision(signal, 'Position size below minimum', reasoning, context, gexSignal);
      }

      // Step 13: Check exposure limits
      const positionValue = signal.metadata?.price || 100; // Use signal price or default
      const additionalExposure = positionValue * finalSize * 100;
      
      if (this.positionManager.wouldExceedMaxExposure(additionalExposure)) {
        reasoning.push(`Would exceed maximum exposure - rejecting`);
        return this.createRejectionDecision(signal, 'Maximum exposure exceeded', reasoning, context, gexSignal);
      }

      // Step 14: Return ENTER decision
      reasoning.push('All checks passed - ENTER decision');

      const entryDecision: EntryDecision = {
        decision: 'ENTER',
        signal,
        confidence: finalConfidence,
        positionSize: finalSize,
        reasoning,
        calculations: {
          baseConfidence,
          contextAdjustment,
          positioningAdjustment,
          indicatorAdjustment,
          gexAdjustment: gexAdjustment + confluenceBoost,
          finalConfidence,
          baseSizing: sizingResult.calculation.baseSize,
          kellyMultiplier: sizingResult.calculation.kellyMultiplier,
          regimeMultiplier: sizingResult.calculation.regimeMultiplier,
          confluenceMultiplier: sizingResult.calculation.confluenceMultiplier,
          indicatorSizeMultiplier: indicatorContext.sizeMultiplier,
          finalSize,
        },
      };

      if (this.auditLogger) {
        this.auditLogger.logEntryDecision(entryDecision, context, gexSignal).catch((error) => {
          console.warn('[DecisionOrchestrator] Audit log failed:', error);
        });
      }

      return entryDecision;

    } catch (error) {
      // Comprehensive error handling (Requirement 8.2)
      reasoning.push(`Critical error: ${(error as Error).message}`);
      return this.createRejectionDecision(signal, `Error: ${(error as Error).message}`, reasoning);
    }
  }

  /**
   * Create rejection decision
   */
  private createRejectionDecision(
    signal: Signal,
    reason: string,
    reasoning: string[],
    context?: ContextData,
    gex?: GEXSignal | null
  ): EntryDecision {
    const decision: EntryDecision = {
      decision: 'REJECT',
      signal,
      confidence: 0,
      positionSize: 0,
      reasoning: [...reasoning, `REJECTED: ${reason}`],
      calculations: {
        baseConfidence: 0,
        contextAdjustment: 0,
        positioningAdjustment: 0,
          indicatorAdjustment: 0,
        gexAdjustment: 0,
        finalConfidence: 0,
        baseSizing: 0,
        kellyMultiplier: 0,
        regimeMultiplier: 0,
        confluenceMultiplier: 0,
          indicatorSizeMultiplier: 1,
        finalSize: 0,
      },
    };

    if (this.auditLogger) {
      this.auditLogger.logEntryDecision(decision, context, gex ?? null).catch((error) => {
        console.warn('[DecisionOrchestrator] Audit log failed:', error);
      });
    }

    return decision;
  }

  /**
   * Orchestrate exit decision
   * Implements Requirements 2.2, 2.3, 3.2, 3.3
   * 
   * Flow:
   * 1. Fetch current market price
   * 2. Calculate current P&L
   * 3. Check profit target (highest priority)
   * 4. Check stop loss (second priority)
   * 5. Check GEX flip (third priority)
   * 6. Check time-based exit (lowest priority)
   * 7. Return decision with highest priority exit reason
   */
  async orchestrateExitDecision(position: Position): Promise<ExitDecision> {
    const reasoning: string[] = [];
    
    try {
      // Step 1: Fetch current market price
      reasoning.push('Fetching current market price...');
      let currentPrice: number;
      
      try {
        // In production, this would fetch from market data API
        // For now, use position's current price if available
        currentPrice = position.currentPrice || position.entryPrice;
        reasoning.push(`Current price: ${currentPrice}`);
      } catch (error) {
        reasoning.push(`Failed to fetch current price: ${(error as Error).message}`);
        return this.createHoldDecision(position, 'Unable to fetch current price', reasoning);
      }

      // Step 2: Calculate current P&L
      const unrealizedPnL = this.positionManager.calculateUnrealizedPnL(
        position,
        currentPrice
      );
      const pnlPercent = ((currentPrice - position.entryPrice) / position.entryPrice) * 100;
      
      reasoning.push(`Unrealized P&L: $${unrealizedPnL.toFixed(2)} (${pnlPercent.toFixed(2)}%)`);

      // Step 3: Check profit target (highest priority)
      const profitTarget = this.config.exit?.profitTargetPercent || 50;
      if (pnlPercent >= profitTarget) {
        reasoning.push(`Profit target reached: ${pnlPercent.toFixed(2)}% >= ${profitTarget}%`);
        return {
          decision: 'EXIT',
          position,
          exitReason: 'PROFIT_TARGET',
          reasoning: [...reasoning, 'EXIT: Profit target reached'],
          calculations: {
            profitTarget: true,
            stopLoss: false,
            gexFlip: false,
            timeExit: false,
            currentPnL: unrealizedPnL,
            currentPnLPercent: pnlPercent,
          },
        };
      }
      reasoning.push(`Profit target not reached: ${pnlPercent.toFixed(2)}% < ${profitTarget}%`);

      // Step 4: Check stop loss (second priority)
      const stopLoss = this.config.exit?.stopLossPercent || -30;
      if (pnlPercent <= stopLoss) {
        reasoning.push(`Stop loss triggered: ${pnlPercent.toFixed(2)}% <= ${stopLoss}%`);
        return {
          decision: 'EXIT',
          position,
          exitReason: 'STOP_LOSS',
          reasoning: [...reasoning, 'EXIT: Stop loss triggered'],
          calculations: {
            profitTarget: false,
            stopLoss: true,
            gexFlip: false,
            timeExit: false,
            currentPnL: unrealizedPnL,
            currentPnLPercent: pnlPercent,
          },
        };
      }
      reasoning.push(`Stop loss not triggered: ${pnlPercent.toFixed(2)}% > ${stopLoss}%`);

      // Step 5: Check GEX flip (third priority)
      reasoning.push('Checking for GEX flip...');
      try {
        const flipResult = await this.gexService.detectFlip(
          position.symbol,
          '5m' // Use position's timeframe if available
        );
        
        if (flipResult.hasFlipped && flipResult.currentDirection !== position.direction) {
          reasoning.push(`GEX flip detected: ${flipResult.previousDirection} → ${flipResult.currentDirection}`);
          return {
            decision: 'EXIT',
            position,
            exitReason: 'GEX_FLIP',
            reasoning: [...reasoning, 'EXIT: GEX flip detected'],
            calculations: {
              profitTarget: false,
              stopLoss: false,
              gexFlip: true,
              timeExit: false,
              currentPnL: unrealizedPnL,
              currentPnLPercent: pnlPercent,
            },
          };
        }
        reasoning.push('No GEX flip detected');
      } catch (error) {
        // Graceful degradation - continue without GEX check
        reasoning.push(`GEX flip check failed: ${(error as Error).message} - continuing`);
      }

      // Step 6: Check time-based exit (lowest priority)
      const now = new Date();
      const timezone = 'America/New_York';
      const [closeHour, closeMinute] = this.parseTime(this.config.validation.marketHoursEnd);
      const { hours, minutes } = this.getTimeInTimezone(now, timezone);

      if (hours > closeHour || (hours === closeHour && minutes >= closeMinute)) {
        reasoning.push('Market close approaching - time-based exit');
        return {
          decision: 'EXIT',
          position,
          exitReason: 'TIME_EXIT',
          reasoning: [...reasoning, 'EXIT: Market close approaching'],
          calculations: {
            profitTarget: false,
            stopLoss: false,
            gexFlip: false,
            timeExit: true,
            currentPnL: unrealizedPnL,
            currentPnLPercent: pnlPercent,
          },
        };
      }
      reasoning.push('No time-based exit conditions met');

      // Step 7: No exit conditions met - HOLD
      reasoning.push('No exit conditions met - HOLD');
      return this.createHoldDecision(position, 'No exit conditions met', reasoning);

    } catch (error) {
      // Comprehensive error handling (Requirement 2.5)
      reasoning.push(`Critical error: ${(error as Error).message}`);
      return this.createHoldDecision(position, `Error: ${(error as Error).message}`, reasoning);
    }
  }

  /**
   * Create HOLD decision
   */
  private createHoldDecision(
    position: Position,
    reason: string,
    reasoning: string[]
  ): ExitDecision {
    const currentPrice = position.currentPrice || position.entryPrice;
    const unrealizedPnL = this.positionManager.calculateUnrealizedPnL(position, currentPrice);
    const pnlPercent = ((currentPrice - position.entryPrice) / position.entryPrice) * 100;

    return {
      decision: 'HOLD',
      position,
      reasoning: [...reasoning, `HOLD: ${reason}`],
      calculations: {
        profitTarget: false,
        stopLoss: false,
        gexFlip: false,
        timeExit: false,
        currentPnL: unrealizedPnL,
        currentPnLPercent: pnlPercent,
      },
    };
  }

  /**
   * Timeout helper
   */
  private timeout(ms: number, message: string): Promise<never> {
    return new Promise((_, reject) => {
      setTimeout(() => reject(new Error(message)), ms);
    });
  }

  private parseTime(time: string): [number, number] {
    const [hourStr, minuteStr] = time.split(':');
    const hour = Number(hourStr);
    const minute = Number(minuteStr);
    return [
      Number.isNaN(hour) ? 0 : hour,
      Number.isNaN(minute) ? 0 : minute,
    ];
  }

  private getTimeInTimezone(date: Date, timeZone: string): { hours: number; minutes: number } {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });

    const parts = formatter.formatToParts(date);
    const hourPart = parts.find(part => part.type === 'hour')?.value ?? '0';
    const minutePart = parts.find(part => part.type === 'minute')?.value ?? '0';

    return {
      hours: Number(hourPart),
      minutes: Number(minutePart),
    };
  }

  private evaluateIndicatorContext(signal: Signal): {
    confidenceDelta: number;
    sizeMultiplier: number;
    rejectionReason?: string;
    warnings: string[];
  } {
    const warnings: string[] = [];
    let confidenceDelta = 0;
    let sizeMultiplier = 1;

    const indicatorSource = (signal.metadata?.indicator_source || '').toString();
    const direction = signal.direction === 'CALL' ? 'BULLISH' : 'BEARISH';

    // Freshness rules
    const ageSeconds = (Date.now() - signal.timestamp.getTime()) / 1000;
    if (indicatorSource && indicatorSource !== 'mtf-trend-dots' && ageSeconds > 60) {
      return {
        confidenceDelta,
        sizeMultiplier,
        rejectionReason: `Trigger signal too old (${Math.round(ageSeconds)}s)`,
        warnings,
      };
    }

    if (indicatorSource === 'mtf-trend-dots') {
      return {
        confidenceDelta,
        sizeMultiplier,
        rejectionReason: 'Confirmation-only signal (MTF Trend Dots)',
        warnings,
      };
    }

    if (indicatorSource === 'ultimate-option') {
      const score = Number(signal.metadata?.original_score ?? signal.metadata?.score ?? 0);
      const components = Array.isArray(signal.metadata?.components)
        ? signal.metadata.components
        : [];
      const componentCount = components.length;
      const positionMultiplier = Number(signal.metadata?.position_multiplier ?? 1);

      if (score < 4) {
        return {
          confidenceDelta,
          sizeMultiplier,
          rejectionReason: `Ultimate Option score too low (${score})`,
          warnings,
        };
      }

      if (score >= 7 && componentCount >= 4) {
        confidenceDelta += 10;
        sizeMultiplier *= positionMultiplier > 0 ? positionMultiplier : 1.25;
      } else if (score >= 5.5 && components.includes('MTF_ALIGN')) {
        confidenceDelta += 5;
      } else if (score >= 4 && componentCount <= 2) {
        sizeMultiplier *= 0.5;
        warnings.push('Weak confluence components for Ultimate Option');
      }
    }

    if (indicatorSource === 'strat-engine' || indicatorSource === 'strat_engine_v6') {
      const confidence = Number(signal.metadata?.confidence ?? 0);
      const session = (signal.metadata?.session || '').toString().toUpperCase();

      if (confidence < 2) {
        return {
          confidenceDelta,
          sizeMultiplier,
          rejectionReason: `STRAT confidence too low (${confidence})`,
          warnings,
        };
      }

      if (confidence <= 3) {
        sizeMultiplier *= 0.5;
      } else if (confidence === 6 && session === 'ACTIVE') {
        sizeMultiplier *= 1.25;
      }

      if (session === 'NY_LUNCH') {
        sizeMultiplier *= 0.8;
        warnings.push('STRAT signal during NY lunch session');
      }
    }

    const alignmentScore = Number(signal.metadata?.alignment_score ?? signal.metadata?.alignmentScore ?? 0);
    const mtfBias = (signal.metadata?.bias ??
      signal.metadata?.mtf_bias ??
      signal.metadata?.mtf_bias_1h ??
      signal.metadata?.mtf_bias_4h ??
      signal.metadata?.mtf_bias_1H ??
      signal.metadata?.mtf_bias_4H) as string | undefined;

    if (alignmentScore > 0 && mtfBias) {
      const mtfDirection = mtfBias.toUpperCase().includes('BULL') ? 'BULLISH'
        : mtfBias.toUpperCase().includes('BEAR') ? 'BEARISH'
        : 'NEUTRAL';

      if (alignmentScore > 60 && mtfDirection === direction) {
        confidenceDelta += 20;
      } else if (alignmentScore > 70 && mtfDirection !== 'NEUTRAL' && mtfDirection !== direction) {
        sizeMultiplier *= 0.5;
        warnings.push('Counter-trend vs strong MTF alignment');
      } else if (alignmentScore < 40) {
        sizeMultiplier *= 0.5;
        warnings.push('Choppy MTF alignment');
      }
    }

    return {
      confidenceDelta,
      sizeMultiplier,
      warnings,
    };
  }
}
