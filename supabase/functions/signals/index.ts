import { corsHeaders } from "../_shared/cors.ts";
import { createDbClient } from "../_shared/db-client.ts";
import { requireAuth } from "../_shared/auth-middleware.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Require authentication
  const { user, response } = await requireAuth(req);
  if (response) return response;

  try {
    const url = new URL(req.url);
    const limit = parseInt(url.searchParams.get("limit") || "50");
    const status = url.searchParams.get("status");

    const supabase = createDbClient();

    // Build query
    let query = supabase
      .from("refactored_signals")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);

    // Apply status filter if provided
    if (status) {
      query = query.eq("status", status);
    }

    const { data, error } = await query;

    if (error) {
      console.error("Signals query error:", error);
      return new Response(
        JSON.stringify({ error: "Failed to fetch signals", details: error.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Map refactored_signals to legacy signal format for frontend compatibility
    const signals = (data || []).map((signal: any) => ({
      id: signal.id,
      source: signal.source || "unknown",
      symbol: signal.symbol,
      direction: signal.direction,
      timeframe: signal.timeframe || "unknown",
      timestamp: signal.timestamp || signal.created_at,
      metadata: signal.metadata || {},
      validation_result: signal.validation_result || null,
      created_at: signal.created_at,
      // Legacy fields
      action: signal.metadata?.action || null,
      underlying: signal.symbol,
      strike: signal.metadata?.strike || null,
      expiration: signal.metadata?.expiration || null,
      option_type: signal.direction,
      quantity: signal.metadata?.quantity || null,
    }));

    return new Response(
      JSON.stringify({ signals }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Signals error:", error);
    return new Response(
      JSON.stringify({ error: "Failed to fetch signals" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
