/**
 * Observability Types
 * Decision logging and rule performance tracking
 */

export type DecisionType = 'ENTRY' | 'HOLD' | 'EXIT';

export type DecisionAction = 
  | 'EXECUTE' 
  | 'REJECT' 
  | 'HOLD' 
  | 'CLOSE_PARTIAL' 
  | 'CLOSE_FULL';

export type TuneDirection = 'TIGHTEN' | 'LOOSEN' | 'KEEP';

/**
 * Rule trigger entry for tracking
 */
export interface RuleTrigger {
  ruleId: string;
  condition: string;
  impact: number;
}

/**
 * Decision log entry
 */
export interface DecisionLog {
  decisionType: DecisionType;
  ticker: string;
  action: DecisionAction;
  actionReason: string;
  
  // Full context snapshot
  contextSnapshot: Record<string, unknown>;
  
  // Individual inputs
  tvSignal?: Record<string, unknown>;
  gexSignals?: Record<string, unknown>;
  marketContext?: Record<string, unknown>;
  mtfTrend?: Record<string, unknown>;
  positioning?: Record<string, unknown>;
  
  // Calculated scores
  confluenceScore?: Record<string, unknown>;
  conflictResolution?: Record<string, unknown>;
  regimeStability?: Record<string, unknown>;
  positionSizing?: Record<string, unknown>;
  
  // Decision details
  confidence: number;
  quantity?: number;
  price?: number;
  
  // Rules that fired
  rulesTriggered: RuleTrigger[];
}

/**
 * Rule performance metrics
 */
export interface RulePerformance {
  ruleId: string;
  ruleCategory: string;
  
  // Hit stats
  timesTriggered: number;
  timesCorrect: number;
  accuracyRate: number;
  
  // Impact stats
  avgConfidenceImpact: number;
  avgPnlWhenTriggered: number;
  
  // Threshold management
  currentThreshold: number;
  suggestedThreshold: number;
  
  // Auto-tune recommendation
  tuneDirection: TuneDirection;
  tuneConfidence: number;
}

/**
 * Tuning recommendation
 */
export interface TuningRecommendation {
  ruleId: string;
  currentThreshold: number;
  accuracy: number;
  avgPnl: number;
  recommendation: string;
  suggestedThreshold: number;
}
