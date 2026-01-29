/**
 * Signal Validator with clear rejection reasons
 * Implements Requirements 4.1, 4.3, 4.4, 13.2
 */

import { Signal, ValidationResult, Config } from '../core/types.ts';

export class SignalValidator {
  private cooldownTracker: Map<string, number> = new Map();

  constructor(private config: Config) {}

  /**
   * Validate signal through ordered pipeline
   * Implements Requirements 4.1, 4.3, 4.4
   * 
   * Validation order: cooldown → marketHours → mtf → confluence → timeFilters
   * Short-circuits on first failure
   */
  async validate(signal: Signal): Promise<ValidationResult> {
    const checks = {
      cooldown: false,
      marketHours: false,
      mtf: false,
      confluence: false,
      timeFilters: false,
    };

    const details: Record<string, any> = {};

    // 1. Check cooldown
    const cooldownResult = this.checkCooldown(signal);
    checks.cooldown = cooldownResult.passed;
    details.cooldown = cooldownResult.details;
    
    if (!checks.cooldown) {
      return {
        valid: false,
        checks,
        rejectionReason: 'Cooldown active',
        details,
      };
    }

    // 2. Check market hours
    const marketHoursResult = this.checkMarketHours(signal);
    checks.marketHours = marketHoursResult.passed;
    details.marketHours = marketHoursResult.details;
    
    if (!checks.marketHours) {
      return {
        valid: false,
        checks,
        rejectionReason: 'Outside market hours',
        details,
      };
    }

    // 3. Check MTF alignment
    const mtfResult = this.checkMTF(signal);
    checks.mtf = mtfResult.passed;
    details.mtf = mtfResult.details;
    
    if (!checks.mtf) {
      return {
        valid: false,
        checks,
        rejectionReason: 'MTF alignment failed',
        details,
      };
    }

    // 4. Check confluence
    const confluenceResult = this.checkConfluence(signal);
    checks.confluence = confluenceResult.passed;
    details.confluence = confluenceResult.details;
    
    if (!checks.confluence) {
      return {
        valid: false,
        checks,
        rejectionReason: 'Insufficient confluence',
        details,
      };
    }

    // 5. Check time filters
    const timeFiltersResult = this.checkTimeFilters(signal);
    checks.timeFilters = timeFiltersResult.passed;
    details.timeFilters = timeFiltersResult.details;
    
    if (!checks.timeFilters) {
      return {
        valid: false,
        checks,
        rejectionReason: 'Signal too old',
        details,
      };
    }

    // All checks passed
    return {
      valid: true,
      checks,
      details,
    };
  }

  /**
   * Check if signal is within cooldown period
   * Implements Requirement 4.3
   */
  private checkCooldown(signal: Signal): { passed: boolean; details: any } {
    const key = `${signal.symbol}_${signal.direction}`;
    const lastSignalTime = this.cooldownTracker.get(key);
    const now = Date.now();

    if (!lastSignalTime) {
      // No previous signal - update tracker
      this.cooldownTracker.set(key, now);
      return {
        passed: true,
        details: { message: 'No previous signal' },
      };
    }

    const timeSinceLastSignal = now - lastSignalTime;
    const cooldownMs = this.config.validation.cooldownSeconds * 1000;

    if (timeSinceLastSignal < cooldownMs) {
      return {
        passed: false,
        details: {
          timeSinceLastSignal: timeSinceLastSignal / 1000,
          cooldownSeconds: this.config.validation.cooldownSeconds,
          remainingSeconds: (cooldownMs - timeSinceLastSignal) / 1000,
        },
      };
    }

    // Cooldown expired - update tracker
    this.cooldownTracker.set(key, now);
    return {
      passed: true,
      details: {
        timeSinceLastSignal: timeSinceLastSignal / 1000,
        cooldownSeconds: this.config.validation.cooldownSeconds,
      },
    };
  }

  /**
   * Check if signal is within market hours (9:30 AM - 3:30 PM ET)
   * Implements Requirement 13.2
   */
  private checkMarketHours(signal: Signal): { passed: boolean; details: any } {
    const signalTime = signal.timestamp;
    const timezone = 'America/New_York';

    const { hours, minutes } = this.getTimeInTimezone(signalTime, timezone);
    const signalMinutes = hours * 60 + minutes;

    const [startHour, startMinute] = this.parseTime(this.config.validation.marketHoursStart);
    const [endHour, endMinute] = this.parseTime(this.config.validation.marketHoursEnd);
    const startMinutes = startHour * 60 + startMinute;
    const endMinutes = endHour * 60 + endMinute;

    const withinHours = signalMinutes >= startMinutes && signalMinutes <= endMinutes;

    return {
      passed: withinHours,
      details: {
        signalTime: signalTime.toISOString(),
        signalHour: hours,
        signalMinute: minutes,
        marketStart: `${this.config.validation.marketHoursStart} ${timezone}`,
        marketEnd: `${this.config.validation.marketHoursEnd} ${timezone}`,
      },
    };
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

  /**
   * Check multi-timeframe alignment
   * Implements Requirement 4.3
   */
  private checkMTF(signal: Signal): { passed: boolean; details: any } {
    // Placeholder implementation - would integrate with MTF analyzer
    // For now, assume MTF check passes if metadata contains mtf_aligned flag
    const mtfAligned = signal.metadata?.mtf_aligned ?? true;

    return {
      passed: mtfAligned,
      details: {
        mtfAligned,
        timeframe: signal.timeframe,
      },
    };
  }

  /**
   * Check confluence threshold
   * Implements Requirement 4.3
   */
  private checkConfluence(signal: Signal): { passed: boolean; details: any } {
    // Placeholder implementation - would integrate with confluence calculator
    // For now, assume confluence check passes if metadata contains confluence score >= 0.5
    const confluenceScore = signal.metadata?.confluence ?? 1.0;
    const minConfluence = 0.5;

    return {
      passed: confluenceScore >= minConfluence,
      details: {
        confluenceScore,
        minConfluence,
      },
    };
  }

  /**
   * Check if signal is not too old
   * Implements Requirement 4.3
   */
  private checkTimeFilters(signal: Signal): { passed: boolean; details: any } {
    const now = Date.now();
    const signalTime = signal.timestamp.getTime();
    const ageMs = now - signalTime;
    const maxAgeMs = this.config.validation.maxSignalAgeMinutes * 60 * 1000;

    return {
      passed: ageMs <= maxAgeMs,
      details: {
        ageMinutes: ageMs / (60 * 1000),
        maxAgeMinutes: this.config.validation.maxSignalAgeMinutes,
      },
    };
  }

  /**
   * Clear cooldown tracker (for testing)
   */
  clearCooldowns(): void {
    this.cooldownTracker.clear();
  }
}
