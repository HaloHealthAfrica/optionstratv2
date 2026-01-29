import { corsHeaders } from "../_shared/cors.ts";
import { createSupabaseClient } from "../_shared/supabase-client.ts";
import { requireAuth } from "../_shared/auth-middleware.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Require authentication
  const { user, response } = await requireAuth(req);
  if (response) return response;

  try {
    const supabase = createSupabaseClient();

    // Get counts in parallel
    const [
      signalsResult,
      ordersResult,
      tradesResult,
      positionsResult,
      violationsResult,
    ] = await Promise.all([
      supabase.from("refactored_signals").select("id, validation_result", { count: "exact" }),
      supabase.from("orders").select("id, status, mode", { count: "exact" }),
      supabase.from("trades").select("id", { count: "exact" }),
      supabase.from("refactored_positions").select("id, status", { count: "exact" }),
      supabase.from("risk_violations").select("id, severity", { count: "exact" }),
    ]);

    // Calculate stats
    const signals = signalsResult.data || [];
    const orders = ordersResult.data || [];
    const positions = positionsResult.data || [];
    const violations = violationsResult.data || [];

    const acceptedSignals = signals.filter(s => s.validation_result?.valid === true).length;
    const rejectedSignals = signals.filter(s => s.validation_result?.valid === false).length;
    const pendingSignals = signals.filter(s => !s.validation_result).length;
    const failedSignals = signals.filter(
      s => s.validation_result?.valid === false && s.validation_result?.stage === "EXECUTION"
    ).length;

    const stats = {
      signals: {
        total: signalsResult.count || 0,
        pending: pendingSignals,
        completed: acceptedSignals,
        rejected: rejectedSignals,
        failed: failedSignals,
      },
      orders: {
        total: ordersResult.count || 0,
        paper: orders.filter(o => o.mode === "PAPER").length,
        live: orders.filter(o => o.mode === "LIVE").length,
        filled: orders.filter(o => o.status === "FILLED").length,
        pending: orders.filter(o => o.status === "PENDING" || o.status === "SUBMITTED").length,
      },
      trades: {
        total: tradesResult.count || 0,
      },
      positions: {
        total: positionsResult.count || 0,
        open: positions.filter(p => p.status === "OPEN").length,
        closed: positions.filter(p => p.status === "CLOSED").length,
      },
      risk_violations: {
        total: violationsResult.count || 0,
        critical: violations.filter(v => v.severity === "CRITICAL").length,
        warning: violations.filter(v => v.severity === "WARNING").length,
      },
      mode: Deno.env.get("APP_MODE") || "PAPER",
      timestamp: new Date().toISOString(),
    };

    return new Response(
      JSON.stringify(stats),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Stats error:", error);
    return new Response(
      JSON.stringify({ error: "Failed to fetch stats" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
