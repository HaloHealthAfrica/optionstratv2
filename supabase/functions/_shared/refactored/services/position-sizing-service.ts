/**
 * Position Sizing Service with ordered calculations
 * Implements Requirements 7.2, 7.4, 7.5
 */

import { Signal, ContextData, Config } from '../core/types.ts';

export interface SizingCalculation {
  baseSize: number;
  kellyMultiplier: number;
  regimeMultiplier: number;
  confluenceMultiplier: number;
  afterBase: number;
  afterKelly: number;
  afterRegime: number;
  afterConfluence: number;
  finalSize: number;
}

export class PositionSizingService {
  constructor(private config: Config) {}

  /**
   * Calculate position size with ordered multipliers
   * Order: base → Kelly → regime → confluence
   * Implements Requirements 7.2, 7.4, 7.5
   * 
   * @param signal - The trading signal
   * @param confidence - Confidence score (0-100)
   * @param context - Market context data
   * @param confluenceScore - Confluence score (0-1)
   * @returns Position size (whole number of contracts)
   */
  calculateSize(
    signal: Signal,
    confidence: number,
    context: ContextData,
    confluenceScore: number = 0.5
  ): { size: number; calculation: SizingCalculation } {
    const calculation: SizingCalculation = {
      baseSize: 0,
      kellyMultiplier: 0,
      regimeMultiplier: 0,
      confluenceMultiplier: 0,
      afterBase: 0,
      afterKelly: 0,
      afterRegime: 0,
      afterConfluence: 0,
      finalSize: 0,
    };

    // Step 1: Base sizing
    calculation.baseSize = this.config.sizing.baseSize;
    calculation.afterBase = calculation.baseSize;

    // Step 2: Apply Kelly criterion
    calculation.kellyMultiplier = this.calculateKellyMultiplier(confidence);
    calculation.afterKelly = calculation.afterBase * calculation.kellyMultiplier;

    // Step 3: Apply regime adjustments
    calculation.regimeMultiplier = this.calculateRegimeMultiplier(context.regime);
    calculation.afterRegime = calculation.afterKelly * calculation.regimeMultiplier;

    // Step 4: Apply confluence adjustments
    calculation.confluenceMultiplier = this.calculateConfluenceMultiplier(confluenceScore);
    calculation.afterConfluence = calculation.afterRegime * calculation.confluenceMultiplier;

    // Step 5: Enforce maximum position size limit
    let finalSize = Math.min(calculation.afterConfluence, this.config.sizing.maxSize);

    // Step 6: Ensure minimum size
    if (finalSize < this.config.sizing.minSize) {
      finalSize = 0; // Below minimum, don't trade
    }

    // Step 7: Return whole number of contracts (floor)
    calculation.finalSize = Math.floor(finalSize);

    return {
      size: calculation.finalSize,
      calculation,
    };
  }

  /**
   * Calculate Kelly criterion multiplier based on confidence
   * Kelly fraction scales with confidence
   */
  private calculateKellyMultiplier(confidence: number): number {
    // Normalize confidence to 0-1 range
    const normalizedConfidence = confidence / 100;
    
    // Apply Kelly fraction
    // Higher confidence = higher multiplier (up to kellyFraction)
    return 1 + (normalizedConfidence * this.config.sizing.kellyFraction);
  }

  /**
   * Calculate regime multiplier based on market regime
   * LOW_VOL: increase size, HIGH_VOL: decrease size
   */
  private calculateRegimeMultiplier(regime: string): number {
    switch (regime) {
      case 'LOW_VOL':
        return 1.2; // Increase size in low volatility
      case 'HIGH_VOL':
        return 0.7; // Decrease size in high volatility
      case 'NORMAL':
      default:
        return 1.0; // No adjustment
    }
  }

  /**
   * Calculate confluence multiplier based on signal agreement
   * Higher confluence = higher multiplier
   */
  private calculateConfluenceMultiplier(confluenceScore: number): number {
    // Scale from 0.8 to 1.2 based on confluence
    // Low confluence (0): 0.8x
    // Medium confluence (0.5): 1.0x
    // High confluence (1.0): 1.2x
    return 0.8 + (confluenceScore * 0.4);
  }

  /**
   * Get sizing recommendation category
   */
  getSizingCategory(size: number): 'NONE' | 'SMALL' | 'MEDIUM' | 'LARGE' {
    if (size === 0) return 'NONE';
    if (size <= 2) return 'SMALL';
    if (size <= 5) return 'MEDIUM';
    return 'LARGE';
  }

  /**
   * Validate sizing parameters
   */
  validateSizingParams(confidence: number, confluenceScore: number): {
    valid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];

    if (confidence < 0 || confidence > 100) {
      errors.push('Confidence must be between 0 and 100');
    }

    if (confluenceScore < 0 || confluenceScore > 1) {
      errors.push('Confluence score must be between 0 and 1');
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Calculate size with detailed logging (for debugging)
   */
  calculateSizeWithLogging(
    signal: Signal,
    confidence: number,
    context: ContextData,
    confluenceScore: number = 0.5
  ): { size: number; calculation: SizingCalculation; log: string[] } {
    const log: string[] = [];
    const result = this.calculateSize(signal, confidence, context, confluenceScore);

    log.push(`Base size: ${result.calculation.baseSize}`);
    log.push(`After base: ${result.calculation.afterBase}`);
    log.push(`Kelly multiplier (confidence ${confidence}): ${result.calculation.kellyMultiplier.toFixed(2)}`);
    log.push(`After Kelly: ${result.calculation.afterKelly.toFixed(2)}`);
    log.push(`Regime multiplier (${context.regime}): ${result.calculation.regimeMultiplier.toFixed(2)}`);
    log.push(`After regime: ${result.calculation.afterRegime.toFixed(2)}`);
    log.push(`Confluence multiplier (${confluenceScore.toFixed(2)}): ${result.calculation.confluenceMultiplier.toFixed(2)}`);
    log.push(`After confluence: ${result.calculation.afterConfluence.toFixed(2)}`);
    log.push(`Final size (floored): ${result.calculation.finalSize}`);

    return {
      ...result,
      log,
    };
  }
}
