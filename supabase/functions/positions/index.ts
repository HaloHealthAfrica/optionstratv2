import { corsHeaders } from "../_shared/cors.ts";
import { createDbClient } from "../_shared/db-client.ts";
import { requireAuth } from "../_shared/auth-middleware.ts";

interface RefactoredPosition {
  id: string;
  signal_id: string;
  symbol: string;
  direction: string;
  quantity: number;
  entry_price: number;
  entry_time: string;
  current_price: number | null;
  unrealized_pnl: number | null;
  exit_price: number | null;
  exit_time: string | null;
  realized_pnl: number | null;
  status: string;
  created_at: string;
  updated_at: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Require authentication
  const { user, response } = await requireAuth(req);
  if (response) return response;

  try {
    const supabase = createDbClient();
    const url = new URL(req.url);
    const showClosed = url.searchParams.get("show_closed") === "true";

    let query = supabase
      .from("refactored_positions")
      .select("*")
      .order("entry_time", { ascending: false });

    if (!showClosed) {
      query = query.eq("status", "OPEN");
    }

    const { data: positions, error } = await query;

    if (error) {
      throw error;
    }

    const enhancedPositions: RefactoredPosition[] = (positions || []);

    // Calculate portfolio totals
    const openPositions = enhancedPositions.filter(p => p.status === "OPEN");
    
    // Get today's and this week's realized P&L
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    
    const weekStart = new Date();
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    weekStart.setHours(0, 0, 0, 0);

    const { data: closedToday } = await supabase
      .from("refactored_positions")
      .select("realized_pnl")
      .eq("status", "CLOSED")
      .gte("exit_time", todayStart.toISOString());

    const { data: closedThisWeek } = await supabase
      .from("refactored_positions")
      .select("realized_pnl")
      .eq("status", "CLOSED")
      .gte("exit_time", weekStart.toISOString());

    const dayRealizedPnl = (closedToday || []).reduce((sum, p) => sum + (p.realized_pnl || 0), 0);
    const weekRealizedPnl = (closedThisWeek || []).reduce((sum, p) => sum + (p.realized_pnl || 0), 0);
    const totalRealizedPnl = enhancedPositions
      .filter(p => p.status === "CLOSED")
      .reduce((sum, p) => sum + (p.realized_pnl || 0), 0);

    const totals = {
      total_positions: enhancedPositions.length,
      open_positions: openPositions.length,
      closed_positions: enhancedPositions.filter(p => p.status === "CLOSED").length,
      total_exposure: openPositions.reduce((sum, p) => sum + (p.entry_price * p.quantity * 100), 0),
      total_unrealized_pnl: openPositions.reduce((sum, p) => sum + (p.unrealized_pnl || 0), 0),
      total_realized_pnl: totalRealizedPnl,
      day_realized_pnl: dayRealizedPnl,
      week_realized_pnl: weekRealizedPnl,
    };

    return new Response(
      JSON.stringify({ positions: enhancedPositions, totals }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Positions error:", error);
    return new Response(
      JSON.stringify({ error: "Failed to fetch positions" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

