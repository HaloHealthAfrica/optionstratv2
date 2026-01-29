/**
 * Refresh Positions Edge Function
 * Updates all open positions with current market data and Greeks
 * Can be called on-demand or scheduled via cron
 * Supports auto-close when exit rules trigger
 */

import { corsHeaders } from "../_shared/cors.ts";
import { createSupabaseClient } from "../_shared/supabase-client.ts";
import { 
  refreshPositions, 
  capturePortfolioSnapshot,
  updateHighWaterMarks,
  type ExitRuleConfig 
} from "../_shared/position-manager.ts";
import { autoClosePositions, type AutoCloseResult } from "../_shared/auto-close.ts";
import { requireAuth } from "../_shared/auth-middleware.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Require authentication
  const { user, response } = await requireAuth(req);
  if (response) return response;

  const startTime = Date.now();

  try {
    const supabase = createSupabaseClient();
    const url = new URL(req.url);
    
    // Options
    const evaluateExits = url.searchParams.get("evaluate_exits") === "true";
    const captureSnapshot = url.searchParams.get("snapshot") === "true";
    const mode = (url.searchParams.get("mode") || "PAPER") as "PAPER" | "LIVE";
    const forceAutoClose = url.searchParams.get("auto_close") === "true";

    // Get risk limits to check auto_close_enabled setting
    const { data: riskLimits } = await supabase
      .from("risk_limits")
      .select("*")
      .eq("mode", mode)
      .eq("is_active", true)
      .maybeSingle();

    // Get exit rule config from database
    let exitRuleConfig: ExitRuleConfig | undefined;
    
    if (evaluateExits) {
      // Fetch exit rules from dedicated table
      const { data: exitRules, error: exitRulesError } = await supabase
        .from("exit_rules")
        .select("*")
        .eq("mode", mode)
        .eq("is_active", true)
        .maybeSingle();
      
      if (exitRulesError) {
        console.warn(`[RefreshPositions] Failed to load exit rules: ${exitRulesError.message}, using defaults`);
      }
      
      if (exitRules) {
        exitRuleConfig = {
          profit_target_percent: exitRules.profit_target_percent ?? 50,
          stop_loss_percent: exitRules.stop_loss_percent ?? 75,
          trailing_stop_percent: exitRules.trailing_stop_percent ?? 25,
          min_days_to_expiration: exitRules.min_days_to_expiration ?? 5,
          max_days_in_trade: exitRules.max_days_in_trade ?? 14,
          delta_exit_threshold: exitRules.delta_exit_threshold ?? 0.82,
          theta_decay_threshold: exitRules.theta_decay_threshold ?? 0.04,
          iv_crush_threshold: exitRules.iv_crush_threshold ?? 0.20,
        };
        console.log(`[RefreshPositions] Loaded exit rules for ${mode} mode`);
      } else {
        // Fallback to defaults from exit-rules.ts
        console.log(`[RefreshPositions] No exit rules in DB for ${mode}, using defaults`);
      }
    }

    // Refresh all positions with market data
    const result = await refreshPositions(exitRuleConfig);

    // Update high water marks for trailing stop tracking
    const hwmResult = await updateHighWaterMarks();
    if (hwmResult.updated > 0) {
      console.log(`[RefreshPositions] Updated ${hwmResult.updated} high water marks`);
    }

    // Auto-close positions if enabled
    let autoCloseResults: AutoCloseResult[] = [];
    const autoCloseEnabled = forceAutoClose || (riskLimits?.auto_close_enabled === true);
    
    if (autoCloseEnabled && result.exit_signals.length > 0) {
      console.log(`[RefreshPositions] Auto-close enabled, processing ${result.exit_signals.length} exit signals`);
      
      // Map exit_signals to the format expected by autoClosePositions
      const exitSignalsWithPositions = result.exit_signals.map(signal => ({
        position: signal.position,
        evaluation: signal.evaluation,
      }));
      
      autoCloseResults = await autoClosePositions(exitSignalsWithPositions, {
        enabled: true,
        only_immediate: false, // Process all urgency levels
        dry_run: false,
      });
    }

    // Capture portfolio snapshot if requested
    if (captureSnapshot) {
      await capturePortfolioSnapshot(mode);
    }

    const duration = Date.now() - startTime;

    // Log the refresh operation
    await supabase.from("adapter_logs").insert({
      adapter_name: "position-manager",
      operation: "refresh_positions",
      status: result.success ? "success" : "partial",
      duration_ms: duration,
      response_payload: {
        positions_updated: result.positions_updated,
        positions_failed: result.positions_failed,
        exit_signals_count: result.exit_signals.length,
        auto_close_enabled: autoCloseEnabled,
        auto_close_results: autoCloseResults,
        portfolio_metrics: result.portfolio_metrics,
      },
      error_message: result.errors.length > 0 ? result.errors.join("; ") : null,
    });

    return new Response(
      JSON.stringify({
        success: result.success,
        duration_ms: duration,
        positions_updated: result.positions_updated,
        positions_failed: result.positions_failed,
        exit_signals: result.exit_signals,
        auto_close: {
          enabled: autoCloseEnabled,
          results: autoCloseResults,
          closed_count: autoCloseResults.filter(r => r.success).length,
        },
        portfolio_metrics: result.portfolio_metrics,
        errors: result.errors,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Refresh positions error:", error);
    
    return new Response(
      JSON.stringify({ 
        error: "Failed to refresh positions",
        details: error instanceof Error ? error.message : "Unknown error",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
