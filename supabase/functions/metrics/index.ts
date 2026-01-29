/**
 * Metrics Endpoint
 * 
 * Exposes system metrics for monitoring
 * Requirements: 17.1, 17.2, 17.3
 */

import { corsHeaders } from "../_shared/cors.ts";
import { createSupabaseClient } from "../_shared/supabase-client.ts";
import { MetricsService } from "../_shared/refactored/monitoring/metrics-service.ts";

// Initialize metrics service (shared with webhook handler)
const metricsService = new MetricsService();

/**
 * Main metrics handler
 */
Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const url = new URL(req.url);
  const path = url.pathname;

  try {
    const supabase = createSupabaseClient();

    // Get current position metrics from database
    const { data: positions } = await supabase
      .from('refactored_positions')
      .select('*')
      .eq('status', 'OPEN');

    const openPositions = positions?.length || 0;
    const totalExposure = positions?.reduce((sum, p) => sum + (p.quantity * p.entry_price * 100), 0) || 0;
    const unrealizedPnL = positions?.reduce((sum, p) => sum + (p.unrealized_pnl || 0), 0) || 0;

    // Get realized P&L
    const { data: closedPositions } = await supabase
      .from('refactored_positions')
      .select('realized_pnl')
      .eq('status', 'CLOSED');

    const realizedPnL = closedPositions?.reduce((sum, p) => sum + (p.realized_pnl || 0), 0) || 0;

    // Update position metrics
    metricsService.updatePositionMetrics({
      openPositions,
      totalExposure,
      unrealizedPnL,
      realizedPnL,
    });

    // Route to specific metrics
    if (path.endsWith('/metrics/signals')) {
      const signalMetrics = metricsService.getSignalMetrics();
      return new Response(
        JSON.stringify({
          ...signalMetrics,
          rejectionReasons: Object.fromEntries(signalMetrics.rejectionReasons),
        }, null, 2),
        { 
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" } 
        }
      );
    }

    if (path.endsWith('/metrics/positions')) {
      const positionMetrics = metricsService.getPositionMetrics();
      return new Response(
        JSON.stringify(positionMetrics, null, 2),
        { 
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" } 
        }
      );
    }

    if (path.endsWith('/metrics/latency')) {
      const latencyStats = {
        signalProcessing: metricsService.getLatencyStats('signal_processing'),
        decision: metricsService.getLatencyStats('decision'),
        execution: metricsService.getLatencyStats('execution'),
      };
      return new Response(
        JSON.stringify(latencyStats, null, 2),
        { 
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" } 
        }
      );
    }

    // Default: full metrics snapshot
    const snapshot = metricsService.getMetricsSnapshot();
    return new Response(
      JSON.stringify({
        ...snapshot,
        signals: {
          ...snapshot.signals,
          rejectionReasons: Object.fromEntries(snapshot.signals.rejectionReasons),
        },
      }, null, 2),
      { 
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      }
    );

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[METRICS] Metrics endpoint error:', errorMessage);
    
    return new Response(
      JSON.stringify({
        error: 'Failed to retrieve metrics',
        details: errorMessage,
        timestamp: new Date(),
      }, null, 2),
      { 
        status: 500, 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      }
    );
  }
});
