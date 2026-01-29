/**
 * Time-of-Day Filters - Session-Based Signal Weighting
 * 
 * Applies different confidence weights and position sizing
 * based on market session (opening, power hour, etc.)
 * 
 * Uses TechnicalAnalysisService for real-time market schedules
 */

import { getCurrentMarketSession, type MarketSession, getCachedMarketSchedule } from "./market-filters.ts";

export interface TimeFilterConfig {
  // Session-specific position multipliers
  sessionMultipliers: Record<MarketSession, number>;
  
  // Session-specific score bonuses/penalties
  sessionScoreAdjustments: Record<MarketSession, number>;
  
  // Blocked sessions (no trading)
  blockedSessions: MarketSession[];
  
  // Preferred sessions (higher confidence)
  preferredSessions: MarketSession[];
  
  // Day-of-week adjustments (0=Sunday, 1=Monday, etc.)
  dayOfWeekMultipliers: Record<number, number>;
  
  // Special day rules
  avoidMondays: boolean;      // First day often has gaps
  avoidFridays: boolean;      // Weekly expiration risk
  reduceLunchHour: boolean;   // 12-1pm often low volume
}

export const DEFAULT_TIME_FILTER_CONFIG: TimeFilterConfig = {
  sessionMultipliers: {
    'PRE_MARKET': 0.0,    // No trading
    'OPENING': 0.5,       // Half size during volatile open
    'MORNING': 1.0,       // Normal size
    'MIDDAY': 0.75,       // Slightly reduced (low volume)
    'AFTERNOON': 1.0,     // Normal size
    'POWER_HOUR': 1.25,   // Slight increase for power hour
    'CLOSING': 0.5,       // Half size, risky
    'AFTER_HOURS': 0.0,   // No trading
  },
  sessionScoreAdjustments: {
    'PRE_MARKET': -100,   // Block
    'OPENING': -10,       // Slight penalty
    'MORNING': 0,         // No adjustment
    'MIDDAY': -5,         // Slight penalty
    'AFTERNOON': 0,       // No adjustment
    'POWER_HOUR': +10,    // Bonus
    'CLOSING': -15,       // Penalty
    'AFTER_HOURS': -100,  // Block
  },
  blockedSessions: ['PRE_MARKET', 'AFTER_HOURS'],
  preferredSessions: ['MORNING', 'POWER_HOUR'],
  dayOfWeekMultipliers: {
    0: 0.0,   // Sunday - no trading
    1: 0.8,   // Monday - often gaps
    2: 1.0,   // Tuesday
    3: 1.0,   // Wednesday
    4: 1.0,   // Thursday
    5: 0.7,   // Friday - expiration risk
    6: 0.0,   // Saturday - no trading
  },
  avoidMondays: false,
  avoidFridays: false,
  reduceLunchHour: true,
};

export interface TimeFilterResult {
  approved: boolean;
  reason: string;
  session: MarketSession;
  dayOfWeek: number;
  dayName: string;
  positionMultiplier: number;
  scoreAdjustment: number;
  isPreferredSession: boolean;
  isLunchHour: boolean;
  warnings: string[];
  recommendations: string[];
}

/**
 * Get the current day of week
 */
function getDayOfWeek(): number {
  return new Date().getDay();
}

/**
 * Get day name
 */
function getDayName(day: number): string {
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  return days[day] || 'Unknown';
}

/**
 * Check if we're in the lunch hour (12-1pm EST)
 * Uses cached market schedule when available
 */
function isLunchHour(): boolean {
  const cachedSchedule = getCachedMarketSchedule();
  if (cachedSchedule) {
    // Lunch hour is roughly 150-210 minutes into trading day
    const minutesSinceOpen = cachedSchedule.minutesToClose ? 390 - cachedSchedule.minutesToClose : 0;
    return minutesSinceOpen >= 150 && minutesSinceOpen < 210;
  }
  
  // Fallback to EST calculation
  const now = new Date();
  const estOffset = -5;
  const utcHour = now.getUTCHours();
  const estHour = (utcHour + estOffset + 24) % 24;
  return estHour === 12;
}

/**
 * Apply time-based filters to a potential trade
 */
export function applyTimeFilters(
  config: Partial<TimeFilterConfig> = {}
): TimeFilterResult {
  const cfg = { ...DEFAULT_TIME_FILTER_CONFIG, ...config };
  const warnings: string[] = [];
  const recommendations: string[] = [];
  
  const session = getCurrentMarketSession();
  const dayOfWeek = getDayOfWeek();
  const dayName = getDayName(dayOfWeek);
  const lunchHour = isLunchHour();
  
  // Start with session multiplier
  let positionMultiplier = cfg.sessionMultipliers[session] || 1.0;
  let scoreAdjustment = cfg.sessionScoreAdjustments[session] || 0;
  
  // Check if session is blocked
  if (cfg.blockedSessions.includes(session)) {
    return {
      approved: false,
      reason: `Trading blocked during ${session}`,
      session,
      dayOfWeek,
      dayName,
      positionMultiplier: 0,
      scoreAdjustment: -100,
      isPreferredSession: false,
      isLunchHour: lunchHour,
      warnings: [`${session} is a blocked trading session`],
      recommendations: ['Wait for regular trading hours'],
    };
  }
  
  // Apply day-of-week multiplier
  const dayMultiplier = cfg.dayOfWeekMultipliers[dayOfWeek] ?? 1.0;
  positionMultiplier *= dayMultiplier;
  
  if (dayMultiplier === 0) {
    return {
      approved: false,
      reason: `No trading on ${dayName}`,
      session,
      dayOfWeek,
      dayName,
      positionMultiplier: 0,
      scoreAdjustment: -100,
      isPreferredSession: false,
      isLunchHour: lunchHour,
      warnings: [`${dayName} is not a trading day`],
      recommendations: ['Wait for next trading day'],
    };
  }
  
  // Monday/Friday avoidance
  if (dayOfWeek === 1 && cfg.avoidMondays) {
    warnings.push('Monday trading - higher gap risk');
    positionMultiplier *= 0.5;
    scoreAdjustment -= 10;
  }
  
  if (dayOfWeek === 5 && cfg.avoidFridays) {
    warnings.push('Friday trading - weekly expiration risk');
    positionMultiplier *= 0.5;
    scoreAdjustment -= 10;
  }
  
  // Lunch hour reduction
  if (lunchHour && cfg.reduceLunchHour) {
    warnings.push('Lunch hour - typically low volume');
    positionMultiplier *= 0.75;
    scoreAdjustment -= 5;
  }
  
  // Check if preferred session
  const isPreferredSession = cfg.preferredSessions.includes(session);
  if (isPreferredSession) {
    recommendations.push(`${session} is a preferred trading session`);
  }
  
  // Session-specific recommendations
  switch (session) {
    case 'OPENING':
      recommendations.push('Use limit orders during volatile open');
      recommendations.push('Wait for first 15 minutes if possible');
      break;
    case 'MORNING':
      recommendations.push('Good liquidity window');
      break;
    case 'MIDDAY':
      recommendations.push('Consider tighter stops during low volume');
      break;
    case 'POWER_HOUR':
      recommendations.push('High-probability session for momentum trades');
      recommendations.push('Watch for EOD institutional flows');
      break;
    case 'CLOSING':
      recommendations.push('Avoid opening new positions');
      recommendations.push('Consider closing existing positions');
      break;
  }
  
  // Day-specific warnings
  if (dayOfWeek === 5) {
    warnings.push('Check for weekly options expiration');
  }
  
  return {
    approved: true,
    reason: `${session} on ${dayName}`,
    session,
    dayOfWeek,
    dayName,
    positionMultiplier: Math.max(0, positionMultiplier),
    scoreAdjustment,
    isPreferredSession,
    isLunchHour: lunchHour,
    warnings,
    recommendations,
  };
}

/**
 * Get optimal trading windows for the current day
 */
export function getOptimalTradingWindows(): Array<{
  session: MarketSession;
  startTime: string;
  endTime: string;
  multiplier: number;
  notes: string;
}> {
  return [
    {
      session: 'MORNING',
      startTime: '9:45 AM',
      endTime: '11:30 AM',
      multiplier: 1.0,
      notes: 'Best liquidity after opening volatility settles',
    },
    {
      session: 'POWER_HOUR',
      startTime: '3:00 PM',
      endTime: '3:50 PM',
      multiplier: 1.25,
      notes: 'Institutional buying pressure, momentum trades',
    },
  ];
}

/**
 * Calculate time until next preferred session
 */
export function getTimeUntilNextPreferredSession(
  preferredSessions: MarketSession[] = ['MORNING', 'POWER_HOUR']
): { session: MarketSession; minutesUntil: number } | null {
  const now = new Date();
  const estOffset = -5;
  const utcHour = now.getUTCHours();
  const estHour = (utcHour + estOffset + 24) % 24;
  const estMinutes = now.getUTCMinutes();
  const currentMinutes = estHour * 60 + estMinutes;
  
  // Session start times in minutes since midnight
  const sessionStarts: Record<MarketSession, number> = {
    'PRE_MARKET': 4 * 60,
    'OPENING': 9 * 60 + 30,
    'MORNING': 9 * 60 + 45,
    'MIDDAY': 11 * 60 + 30,
    'AFTERNOON': 13 * 60,
    'POWER_HOUR': 15 * 60,
    'CLOSING': 15 * 60 + 50,
    'AFTER_HOURS': 16 * 60,
  };
  
  for (const session of preferredSessions) {
    const sessionStart = sessionStarts[session];
    if (sessionStart > currentMinutes) {
      return {
        session,
        minutesUntil: sessionStart - currentMinutes,
      };
    }
  }
  
  return null;
}

/**
 * Format time filter result for display
 */
export function formatTimeFilterResult(result: TimeFilterResult): string {
  const lines = [
    `Session: ${result.session} (${result.dayName})`,
    `Position Multiplier: ${(result.positionMultiplier * 100).toFixed(0)}%`,
    `Score Adjustment: ${result.scoreAdjustment > 0 ? '+' : ''}${result.scoreAdjustment}`,
    result.isPreferredSession ? '✓ Preferred session' : '',
    result.isLunchHour ? '⚠ Lunch hour' : '',
    result.warnings.length ? `Warnings: ${result.warnings.join('; ')}` : '',
  ].filter(Boolean);
  
  return lines.join('\n');
}
