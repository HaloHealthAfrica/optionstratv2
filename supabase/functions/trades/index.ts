/**
 * Trades Edge Function
 * Fetches trade history with filtering, aggregation, and analytics
 */

import { corsHeaders } from "../_shared/cors.ts";
import { createSupabaseClient } from "../_shared/supabase-client.ts";
import { requireAuth } from "../_shared/auth-middleware.ts";

interface TradeWithOrder {
  id: string;
  order_id: string;
  broker_trade_id: string | null;
  execution_price: number;
  quantity: number;
  commission: number;
  fees: number;
  total_cost: number;
  underlying: string;
  symbol: string;
  strike: number;
  expiration: string;
  option_type: string;
  executed_at: string;
  created_at: string;
  // Joined from orders
  side?: string;
  mode?: string;
  order_type?: string;
  signal_id?: string;
}

interface TradeAnalytics {
  total_trades: number;
  total_volume: number;
  total_commission: number;
  total_fees: number;
  total_premium_traded: number;
  avg_execution_price: number;
  trades_by_underlying: Record<string, number>;
  trades_by_side: Record<string, number>;
  trades_by_day: { date: string; count: number; volume: number }[];
  win_rate?: number;
  avg_trade_size: number;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Require authentication
  const { user, response } = await requireAuth(req);
  if (response) return response;

  try {
    const supabase = createSupabaseClient();
    const url = new URL(req.url);
    
    // Filters
    const underlying = url.searchParams.get("underlying");
    const side = url.searchParams.get("side");
    const startDate = url.searchParams.get("start_date");
    const endDate = url.searchParams.get("end_date");
    const limit = parseInt(url.searchParams.get("limit") || "100");
    const offset = parseInt(url.searchParams.get("offset") || "0");
    const includeAnalytics = url.searchParams.get("analytics") === "true";

    // Build query with order join
    let query = supabase
      .from("trades")
      .select(`
        *,
        orders!inner (
          side,
          mode,
          order_type,
          signal_id
        )
      `)
      .order("executed_at", { ascending: false })
      .range(offset, offset + limit - 1);

    // Apply filters
    if (underlying) {
      query = query.eq("underlying", underlying.toUpperCase());
    }
    if (startDate) {
      query = query.gte("executed_at", startDate);
    }
    if (endDate) {
      query = query.lte("executed_at", endDate);
    }

    const { data: trades, error, count } = await query;

    if (error) {
      throw error;
    }

    // Flatten the joined data
    const flattenedTrades: TradeWithOrder[] = (trades || []).map(t => ({
      ...t,
      side: t.orders?.side,
      mode: t.orders?.mode,
      order_type: t.orders?.order_type,
      signal_id: t.orders?.signal_id,
      orders: undefined, // Remove nested object
    }));

    // Filter by side if specified (after join)
    const filteredTrades = side 
      ? flattenedTrades.filter(t => t.side?.includes(side.toUpperCase()))
      : flattenedTrades;

    // Calculate analytics if requested
    let analytics: TradeAnalytics | null = null;
    
    if (includeAnalytics) {
      // Get all trades for analytics (ignore pagination)
      let analyticsQuery = supabase
        .from("trades")
        .select("*, orders!inner(side)")
        .order("executed_at", { ascending: false });

      if (underlying) {
        analyticsQuery = analyticsQuery.eq("underlying", underlying.toUpperCase());
      }
      if (startDate) {
        analyticsQuery = analyticsQuery.gte("executed_at", startDate);
      }
      if (endDate) {
        analyticsQuery = analyticsQuery.lte("executed_at", endDate);
      }

      const { data: allTrades } = await analyticsQuery;
      const analyticsTrades = allTrades || [];

      // Trades by underlying
      const tradesByUnderlying: Record<string, number> = {};
      analyticsTrades.forEach(t => {
        tradesByUnderlying[t.underlying] = (tradesByUnderlying[t.underlying] || 0) + 1;
      });

      // Trades by side
      const tradesBySide: Record<string, number> = {};
      analyticsTrades.forEach(t => {
        const tradeSide = t.orders?.side || "UNKNOWN";
        tradesBySide[tradeSide] = (tradesBySide[tradeSide] || 0) + 1;
      });

      // Trades by day (last 30 days)
      const tradesByDayMap: Record<string, { count: number; volume: number }> = {};
      analyticsTrades.forEach(t => {
        const day = t.executed_at.split("T")[0];
        if (!tradesByDayMap[day]) {
          tradesByDayMap[day] = { count: 0, volume: 0 };
        }
        tradesByDayMap[day].count++;
        tradesByDayMap[day].volume += t.quantity;
      });

      const tradesByDay = Object.entries(tradesByDayMap)
        .map(([date, data]) => ({ date, ...data }))
        .sort((a, b) => a.date.localeCompare(b.date))
        .slice(-30);

      const totalVolume = analyticsTrades.reduce((sum, t) => sum + t.quantity, 0);
      const totalCommission = analyticsTrades.reduce((sum, t) => sum + (t.commission || 0), 0);
      const totalFees = analyticsTrades.reduce((sum, t) => sum + (t.fees || 0), 0);
      const totalPremium = analyticsTrades.reduce((sum, t) => sum + Math.abs(t.total_cost), 0);
      const avgPrice = analyticsTrades.length > 0
        ? analyticsTrades.reduce((sum, t) => sum + t.execution_price, 0) / analyticsTrades.length
        : 0;

      analytics = {
        total_trades: analyticsTrades.length,
        total_volume: totalVolume,
        total_commission: totalCommission,
        total_fees: totalFees,
        total_premium_traded: totalPremium,
        avg_execution_price: avgPrice,
        trades_by_underlying: tradesByUnderlying,
        trades_by_side: tradesBySide,
        trades_by_day: tradesByDay,
        avg_trade_size: totalVolume / (analyticsTrades.length || 1),
      };
    }

    // Get unique underlyings for filter dropdown
    const { data: underlyings } = await supabase
      .from("trades")
      .select("underlying")
      .limit(100);
    
    const uniqueUnderlyings = [...new Set((underlyings || []).map(u => u.underlying))].sort();

    return new Response(
      JSON.stringify({
        trades: filteredTrades,
        total_count: count,
        analytics,
        filters: {
          underlyings: uniqueUnderlyings,
        },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Trades error:", error);
    return new Response(
      JSON.stringify({ error: "Failed to fetch trades" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
