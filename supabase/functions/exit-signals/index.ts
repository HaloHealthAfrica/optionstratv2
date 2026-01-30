/**
 * Exit Signals Edge Function
 * 
 * Evaluates all open positions against exit rules and returns actionable alerts.
 * Can be called on-demand or via cron for proactive monitoring.
 */

import { corsHeaders } from "../_shared/cors.ts";
import { createDbClient } from "../_shared/db-client.ts";
import { evaluateExitRules, type ExitRuleConfig, type ExitEvaluation } from "../_shared/exit-rules.ts";
import { getMarketDataService } from "../_shared/market-data/index.ts";
import { requireAuth } from "../_shared/auth-middleware.ts";

interface PositionWithMetrics {
  id: string;
  symbol: string;
  underlying: string;
  strike: number;
  expiration: string;
  option_type: string;
  quantity: number;
  avg_open_price: number;
  total_cost: number;
  current_price: number | null;
  market_value: number | null;
  unrealized_pnl: number | null;
  unrealized_pnl_percent: number | null;
  delta: number | null;
  gamma: number | null;
  theta: number | null;
  vega: number | null;
  implied_volatility: number | null;
  opened_at: string;
}

interface ExitAlertResponse {
  position_id: string;
  symbol: string;
  underlying: string;
  strike: number;
  expiration: string;
  option_type: string;
  quantity: number;
  current_price: number;
  unrealized_pnl: number;
  unrealized_pnl_percent: number;
  days_to_expiration: number;
  exit_evaluation: ExitEvaluation;
  priority: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  recommended_action: string;
}

function calculateDTE(expiration: string): number {
  const expDate = new Date(expiration);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  expDate.setHours(0, 0, 0, 0);
  return Math.ceil((expDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

function getPriority(evaluation: ExitEvaluation): 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' {
  if (!evaluation.should_exit) return 'LOW';
  
  if (evaluation.urgency === 'IMMEDIATE') return 'CRITICAL';
  if (evaluation.urgency === 'END_OF_DAY') return 'HIGH';
  return 'MEDIUM';
}

function getRecommendedAction(evaluation: ExitEvaluation): string {
  if (!evaluation.should_exit) return 'HOLD';
  
  switch (evaluation.reason) {
    case 'STOP_LOSS':
      return 'CLOSE IMMEDIATELY - Stop loss triggered';
    case 'EXPIRATION_APPROACHING':
      return 'CLOSE TODAY - Expiration risk';
    case 'PROFIT_TARGET':
      return 'TAKE PROFITS - Target reached';
    case 'DELTA_THRESHOLD':
      return 'CLOSE - High delta risk';
    case 'TIME_DECAY':
      return 'CONSIDER CLOSING - Theta decay accelerating';
    case 'IV_CRUSH':
      return 'CONSIDER CLOSING - IV collapsed';
    case 'TRAILING_STOP':
      return 'CLOSE - Trailing stop hit';
    default:
      return 'REVIEW';
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Require authentication
  const { user, response } = await requireAuth(req);
  if (response) return response;

  const startTime = Date.now();

  try {
    const supabase = createDbClient();
    const marketDataService = getMarketDataService();
    const url = new URL(req.url);
    
    // Options
    const refreshData = url.searchParams.get("refresh") === "true";
    
    // Get exit rule config
    const exitRuleConfig: ExitRuleConfig = {
      profit_target_percent: 50,
      stop_loss_percent: 100,
      min_days_to_expiration: 5,
      delta_exit_threshold: 0.85,
      theta_decay_threshold: 0.05,
      iv_crush_threshold: 0.25,
    };

    // Fetch all open positions with valid data (must have current_price or be recently opened)
    const { data: positions, error: fetchError } = await supabase
      .from("positions")
      .select("*")
      .eq("is_closed", false)
      .not("avg_open_price", "is", null)
      .gt("quantity", 0)
      .order("opened_at", { ascending: false });

    if (fetchError) {
      throw new Error(`Failed to fetch positions: ${fetchError.message}`);
    }

    if (!positions || positions.length === 0) {
      return new Response(
        JSON.stringify({
          alerts: [],
          summary: {
            total_positions: 0,
            positions_with_alerts: 0,
            critical_alerts: 0,
            high_alerts: 0,
            medium_alerts: 0,
          },
          timestamp: new Date().toISOString(),
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const alerts: ExitAlertResponse[] = [];

    // Evaluate each position
    for (const position of positions as PositionWithMetrics[]) {
      let currentPrice = position.current_price;
      let delta = position.delta;
      let theta = position.theta;
      let iv = position.implied_volatility;
      
      // Optionally refresh market data
      if (refreshData) {
        try {
          const quoteResult = await marketDataService.getOptionQuote(
            position.underlying,
            position.expiration,
            position.strike,
            position.option_type as 'CALL' | 'PUT'
          );
          
          if (quoteResult.success && quoteResult.data) {
            currentPrice = quoteResult.data.mid;
            delta = quoteResult.data.delta;
            theta = quoteResult.data.theta;
            iv = quoteResult.data.implied_volatility;
          }
        } catch (e) {
          console.warn(`Failed to refresh data for ${position.symbol}:`, e);
        }
      }
      
      // Calculate metrics
      const dte = calculateDTE(position.expiration);
      const pnlPercent = position.avg_open_price > 0 
        ? ((currentPrice || 0) - position.avg_open_price) / position.avg_open_price * 100
        : 0;
      const unrealizedPnl = ((currentPrice || 0) - position.avg_open_price) * position.quantity * 100;
      
      // Build position data for exit rule evaluation
      const positionData = {
        id: position.id,
        symbol: position.symbol,
        underlying: position.underlying,
        strike: position.strike,
        expiration: position.expiration,
        option_type: position.option_type as 'CALL' | 'PUT',
        quantity: position.quantity,
        avg_open_price: position.avg_open_price,
        total_cost: position.total_cost,
        current_price: currentPrice || 0,
        market_value: (currentPrice || 0) * position.quantity * 100,
        unrealized_pnl: unrealizedPnl,
        unrealized_pnl_percent: pnlPercent,
        realized_pnl: 0,
        delta: delta || 0,
        gamma: position.gamma || 0,
        theta: theta || 0,
        vega: position.vega || 0,
        implied_volatility: iv || 0,
        is_closed: false,
        closed_at: null,
        opened_at: position.opened_at,
        last_updated: new Date().toISOString(),
        created_at: position.opened_at,
      };
      
      // Evaluate exit rules
      const exitEvaluation = evaluateExitRules(positionData, exitRuleConfig);
      
      // Only include positions with exit signals
      if (exitEvaluation.should_exit) {
        alerts.push({
          position_id: position.id,
          symbol: position.symbol,
          underlying: position.underlying,
          strike: position.strike,
          expiration: position.expiration,
          option_type: position.option_type,
          quantity: position.quantity,
          current_price: currentPrice || 0,
          unrealized_pnl: unrealizedPnl,
          unrealized_pnl_percent: pnlPercent,
          days_to_expiration: dte,
          exit_evaluation: exitEvaluation,
          priority: getPriority(exitEvaluation),
          recommended_action: getRecommendedAction(exitEvaluation),
        });
      }
    }

    // Sort by priority (CRITICAL first)
    const priorityOrder = { 'CRITICAL': 0, 'HIGH': 1, 'MEDIUM': 2, 'LOW': 3 };
    alerts.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

    const summary = {
      total_positions: positions.length,
      positions_with_alerts: alerts.length,
      critical_alerts: alerts.filter(a => a.priority === 'CRITICAL').length,
      high_alerts: alerts.filter(a => a.priority === 'HIGH').length,
      medium_alerts: alerts.filter(a => a.priority === 'MEDIUM').length,
    };

    const duration = Date.now() - startTime;

    return new Response(
      JSON.stringify({
        alerts,
        summary,
        duration_ms: duration,
        timestamp: new Date().toISOString(),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Exit signals error:", error);
    
    return new Response(
      JSON.stringify({ 
        error: "Failed to evaluate exit signals",
        details: error instanceof Error ? error.message : "Unknown error",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

