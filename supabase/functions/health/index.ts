/**
 * Health Check Endpoint
 * 
 * Exposes system health status for monitoring
 * Requirements: 17.4
 */

import { corsHeaders } from "../_shared/cors.ts";
import { createDbClient } from "../_shared/db-client.ts";
import { HealthCheckService } from "../_shared/refactored/monitoring/health-check-service.ts";
import { ContextCache } from "../_shared/refactored/cache/context-cache.ts";
import { DegradedModeTracker } from "../_shared/refactored/monitoring/degraded-mode-tracker.ts";
import { defaultConfig } from "../_shared/refactored/core/config.ts";

// Initialize services
const supabase = createDbClient();
const degradedModeTracker = new DegradedModeTracker();
const startTime = Date.now();

// Create context fetcher
const fetchContext = async () => {
  const { data, error } = await supabase
    .from('refactored_context_snapshots')
    .select('*')
    .order('timestamp', { ascending: false })
    .limit(1)
    .single();
  
  if (error || !data) {
    throw new Error('Context fetch failed');
  }
  
  return {
    vix: data.vix,
    trend: data.trend as 'BULLISH' | 'BEARISH' | 'NEUTRAL',
    bias: data.bias,
    regime: data.regime as 'LOW_VOL' | 'HIGH_VOL' | 'NORMAL',
    timestamp: new Date(data.timestamp),
  };
};

const contextCache = new ContextCache(defaultConfig, fetchContext);

// Database connection checker
const checkDatabaseConnection = async (): Promise<boolean> => {
  try {
    const { error } = await supabase
      .from('refactored_signals')
      .select('id')
      .limit(1);
    
    return !error;
  } catch {
    return false;
  }
};

const healthCheckService = new HealthCheckService(
  contextCache,
  degradedModeTracker,
  checkDatabaseConnection
);

/**
 * Main health check handler
 */
Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const url = new URL(req.url);
  const path = url.pathname;

  try {
    // Route to specific health check
    if (path.endsWith('/health/context')) {
      const result = await healthCheckService.checkContextHealth();
      return new Response(
        JSON.stringify(result, null, 2),
        { 
          status: result.healthy ? 200 : 503,
          headers: { ...corsHeaders, "Content-Type": "application/json" } 
        }
      );
    }

    if (path.endsWith('/health/gex')) {
      const result = await healthCheckService.checkGexHealth();
      return new Response(
        JSON.stringify(result, null, 2),
        { 
          status: result.healthy ? 200 : 503,
          headers: { ...corsHeaders, "Content-Type": "application/json" } 
        }
      );
    }

    if (path.endsWith('/health/database')) {
      const result = await healthCheckService.checkDatabaseHealth();
      return new Response(
        JSON.stringify(result, null, 2),
        { 
          status: result.healthy ? 200 : 503,
          headers: { ...corsHeaders, "Content-Type": "application/json" } 
        }
      );
    }

    // Default: overall system health (compat with frontend)
    const result = await healthCheckService.checkSystemHealth();
    const degradedStatus = degradedModeTracker.getStatus();

    const { data: lastSignal } = await supabase
      .from('refactored_signals')
      .select('created_at')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const { data: lastOrder } = await supabase
      .from('orders')
      .select('created_at')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const responsePayload = {
      status: result.status,
      version: Deno.env.get("APP_VERSION") || "refactored",
      mode: Deno.env.get("APP_MODE") || "PAPER",
      live_trading_enabled: Deno.env.get("LIVE_TRADING_ENABLED") === "true",
      uptime_ms: Date.now() - startTime,
      database: {
        connected: result.components.database.details?.connected ?? false,
        error: result.components.database.healthy ? null : result.components.database.message,
      },
      last_activity: {
        signal: lastSignal?.created_at || null,
        order: lastOrder?.created_at || null,
      },
      adapter: {
        name: Deno.env.get("PREFERRED_BROKER") || "paper",
        configured_brokers: (Deno.env.get("CONFIGURED_BROKERS") || "")
          .split(",")
          .map((entry) => entry.trim())
          .filter(Boolean),
      },
      components: result.components,
      degraded_mode: degradedStatus,
      timestamp: new Date().toISOString(),
    };

    return new Response(
      JSON.stringify(responsePayload, null, 2),
      {
        status: result.healthy ? 200 : 503,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      }
    );

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[HEALTH] Health check error:', errorMessage);
    
    return new Response(
      JSON.stringify({
        healthy: false,
        status: 'unhealthy',
        message: 'Health check failed',
        error: errorMessage,
        timestamp: new Date(),
      }, null, 2),
      { 
        status: 500, 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      }
    );
  }
});

