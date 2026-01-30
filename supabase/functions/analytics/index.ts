/**
 * Analytics Edge Function
 * Provides P&L analytics, performance metrics, and portfolio history
 */

import { corsHeaders } from "../_shared/cors.ts";
import { createDbClient } from "../_shared/db-client.ts";
import { requireAuth } from "../_shared/auth-middleware.ts";

interface PnLSummary {
  realized_pnl: number;
  unrealized_pnl: number;
  total_pnl: number;
  day_pnl: number;
  week_pnl: number;
  month_pnl: number;
  total_commissions: number;
  total_fees: number;
  net_pnl: number;
}

interface PerformanceMetrics {
  total_trades: number;
  winning_trades: number;
  losing_trades: number;
  win_rate: number;
  avg_win: number;
  avg_loss: number;
  profit_factor: number;
  largest_win: number;
  largest_loss: number;
  avg_hold_time_days: number;
}

interface PnLByPeriod {
  date: string;
  realized_pnl: number;
  cumulative_pnl: number;
  trade_count: number;
}

interface PnLByUnderlying {
  underlying: string;
  realized_pnl: number;
  trade_count: number;
  win_rate: number;
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
    
    const period = url.searchParams.get("period") || "30d"; // 7d, 30d, 90d, all
    const mode = url.searchParams.get("mode") || "PAPER";

    // Calculate date range
    const now = new Date();
    let startDate: Date;
    
    switch (period) {
      case "7d":
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case "30d":
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      case "90d":
        startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
        break;
      default:
        startDate = new Date(0);
    }

    // Fetch closed positions for realized P&L
    const { data: closedPositions } = await supabase
      .from("positions")
      .select("*")
      .eq("is_closed", true)
      .gte("closed_at", startDate.toISOString());

    // Fetch open positions for unrealized P&L
    const { data: openPositions } = await supabase
      .from("positions")
      .select("*")
      .eq("is_closed", false);

    // Fetch trades for performance metrics
    const { data: trades } = await supabase
      .from("trades")
      .select("*, orders!inner(side, mode)")
      .gte("executed_at", startDate.toISOString());

    // Fetch portfolio snapshots for history
    const { data: snapshots } = await supabase
      .from("portfolio_snapshots")
      .select("*")
      .eq("mode", mode)
      .gte("snapshot_at", startDate.toISOString())
      .order("snapshot_at", { ascending: true });

    // Calculate P&L Summary
    const realizedPnl = (closedPositions || []).reduce((sum, p) => sum + (p.realized_pnl || 0), 0);
    const unrealizedPnl = (openPositions || []).reduce((sum, p) => sum + (p.unrealized_pnl || 0), 0);
    
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    
    const weekStart = new Date(now);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    weekStart.setHours(0, 0, 0, 0);
    
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const dayPnl = (closedPositions || [])
      .filter(p => new Date(p.closed_at) >= todayStart)
      .reduce((sum, p) => sum + (p.realized_pnl || 0), 0);

    const weekPnl = (closedPositions || [])
      .filter(p => new Date(p.closed_at) >= weekStart)
      .reduce((sum, p) => sum + (p.realized_pnl || 0), 0);

    const monthPnl = (closedPositions || [])
      .filter(p => new Date(p.closed_at) >= monthStart)
      .reduce((sum, p) => sum + (p.realized_pnl || 0), 0);

    const totalCommissions = (trades || []).reduce((sum, t) => sum + (t.commission || 0), 0);
    const totalFees = (trades || []).reduce((sum, t) => sum + (t.fees || 0), 0);

    const pnlSummary: PnLSummary = {
      realized_pnl: realizedPnl,
      unrealized_pnl: unrealizedPnl,
      total_pnl: realizedPnl + unrealizedPnl,
      day_pnl: dayPnl,
      week_pnl: weekPnl,
      month_pnl: monthPnl,
      total_commissions: totalCommissions,
      total_fees: totalFees,
      net_pnl: realizedPnl + unrealizedPnl - totalCommissions - totalFees,
    };

    // Calculate Performance Metrics
    const closedWithPnl = (closedPositions || []).filter(p => p.realized_pnl !== null);
    const winningTrades = closedWithPnl.filter(p => p.realized_pnl > 0);
    const losingTrades = closedWithPnl.filter(p => p.realized_pnl < 0);

    const totalWins = winningTrades.reduce((sum, p) => sum + p.realized_pnl, 0);
    const totalLosses = Math.abs(losingTrades.reduce((sum, p) => sum + p.realized_pnl, 0));

    // Calculate average hold time
    const holdTimes = closedWithPnl.map(p => {
      const opened = new Date(p.opened_at);
      const closed = new Date(p.closed_at);
      return (closed.getTime() - opened.getTime()) / (1000 * 60 * 60 * 24);
    });
    const avgHoldTime = holdTimes.length > 0 
      ? holdTimes.reduce((a, b) => a + b, 0) / holdTimes.length 
      : 0;

    const performanceMetrics: PerformanceMetrics = {
      total_trades: closedWithPnl.length,
      winning_trades: winningTrades.length,
      losing_trades: losingTrades.length,
      win_rate: closedWithPnl.length > 0 
        ? (winningTrades.length / closedWithPnl.length) * 100 
        : 0,
      avg_win: winningTrades.length > 0 
        ? totalWins / winningTrades.length 
        : 0,
      avg_loss: losingTrades.length > 0 
        ? totalLosses / losingTrades.length 
        : 0,
      profit_factor: totalLosses > 0 
        ? totalWins / totalLosses 
        : totalWins > 0 ? Infinity : 0,
      largest_win: winningTrades.length > 0 
        ? Math.max(...winningTrades.map(p => p.realized_pnl)) 
        : 0,
      largest_loss: losingTrades.length > 0 
        ? Math.min(...losingTrades.map(p => p.realized_pnl)) 
        : 0,
      avg_hold_time_days: avgHoldTime,
    };

    // P&L by period (daily)
    const pnlByDayMap: Record<string, { pnl: number; count: number }> = {};
    (closedPositions || []).forEach(p => {
      const day = p.closed_at?.split("T")[0];
      if (day) {
        if (!pnlByDayMap[day]) {
          pnlByDayMap[day] = { pnl: 0, count: 0 };
        }
        pnlByDayMap[day].pnl += p.realized_pnl || 0;
        pnlByDayMap[day].count++;
      }
    });

    let cumulativePnl = 0;
    const pnlByPeriod: PnLByPeriod[] = Object.entries(pnlByDayMap)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, data]) => {
        cumulativePnl += data.pnl;
        return {
          date,
          realized_pnl: data.pnl,
          cumulative_pnl: cumulativePnl,
          trade_count: data.count,
        };
      });

    // P&L by underlying
    const pnlByUnderlyingMap: Record<string, { pnl: number; wins: number; total: number }> = {};
    (closedPositions || []).forEach(p => {
      if (!pnlByUnderlyingMap[p.underlying]) {
        pnlByUnderlyingMap[p.underlying] = { pnl: 0, wins: 0, total: 0 };
      }
      pnlByUnderlyingMap[p.underlying].pnl += p.realized_pnl || 0;
      pnlByUnderlyingMap[p.underlying].total++;
      if (p.realized_pnl > 0) {
        pnlByUnderlyingMap[p.underlying].wins++;
      }
    });

    const pnlByUnderlying: PnLByUnderlying[] = Object.entries(pnlByUnderlyingMap)
      .map(([underlying, data]) => ({
        underlying,
        realized_pnl: data.pnl,
        trade_count: data.total,
        win_rate: data.total > 0 ? (data.wins / data.total) * 100 : 0,
      }))
      .sort((a, b) => b.realized_pnl - a.realized_pnl);

    return new Response(
      JSON.stringify({
        pnl_summary: pnlSummary,
        performance_metrics: performanceMetrics,
        pnl_by_period: pnlByPeriod,
        pnl_by_underlying: pnlByUnderlying,
        portfolio_history: snapshots || [],
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Analytics error:", error);
    return new Response(
      JSON.stringify({ error: "Failed to fetch analytics" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

