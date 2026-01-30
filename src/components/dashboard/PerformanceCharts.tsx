import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useQuery } from "@tanstack/react-query";
import { POLLING_INTERVALS } from "@/lib/polling";
import apiClient from "@/lib/api-client";
import { TrendingUp, TrendingDown, Activity, DollarSign } from "lucide-react";
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  ReferenceLine,
} from "recharts";

interface PortfolioSnapshot {
  id: string;
  snapshot_at: string;
  total_value: number;
  total_pnl: number | null;
  total_delta: number | null;
  total_gamma: number | null;
  total_theta: number | null;
  total_vega: number | null;
  day_pnl: number | null;
}

interface AnalyticsData {
  pnl_summary: {
    realized_pnl: number;
    unrealized_pnl: number;
    total_pnl: number;
    day_pnl: number;
    week_pnl: number;
    month_pnl: number;
  };
  pnl_by_period: Array<{
    date: string;
    realized_pnl: number;
    cumulative_pnl: number;
    trade_count: number;
  }>;
  portfolio_history: PortfolioSnapshot[];
}

async function fetchAnalytics(period: string): Promise<AnalyticsData> {
  const { data, error } = await apiClient.getAnalytics(period);
  if (error || !data) throw error || new Error("Failed to fetch analytics");
  return data as AnalyticsData;
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

export function PerformanceCharts() {
  const [period, setPeriod] = useState<string>("30d");

  const { data, isLoading } = useQuery({
    queryKey: ["analytics", period],
    queryFn: () => fetchAnalytics(period),
    refetchInterval: POLLING_INTERVALS.performanceCharts,
  });

  // Prepare equity curve data
  const equityCurveData = data?.portfolio_history?.map((snapshot) => ({
    date: formatDate(snapshot.snapshot_at),
    value: snapshot.total_value,
    pnl: snapshot.total_pnl || 0,
  })) || [];

  // Prepare daily P&L bar data
  const dailyPnlData = data?.pnl_by_period?.map((item) => ({
    date: formatDate(item.date),
    pnl: item.realized_pnl,
    cumulative: item.cumulative_pnl,
    trades: item.trade_count,
  })) || [];

  // Prepare Greeks exposure data
  const greeksData = data?.portfolio_history?.slice(-30).map((snapshot) => ({
    date: formatDate(snapshot.snapshot_at),
    delta: snapshot.total_delta || 0,
    gamma: (snapshot.total_gamma || 0) * 100, // Scale for visibility
    theta: snapshot.total_theta || 0,
    vega: snapshot.total_vega || 0,
  })) || [];

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Performance Charts</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[300px] flex items-center justify-center text-muted-foreground">
            Loading charts...
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Performance Analytics
          </CardTitle>
          <CardDescription>Equity curve, P&L, and Greeks exposure</CardDescription>
        </div>
        <Select value={period} onValueChange={setPeriod}>
          <SelectTrigger className="w-[120px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7d">7 Days</SelectItem>
            <SelectItem value="30d">30 Days</SelectItem>
            <SelectItem value="90d">90 Days</SelectItem>
            <SelectItem value="all">All Time</SelectItem>
          </SelectContent>
        </Select>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="equity" className="space-y-4">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="equity" className="flex items-center gap-1.5">
              <TrendingUp className="h-3.5 w-3.5" />
              Equity Curve
            </TabsTrigger>
            <TabsTrigger value="pnl" className="flex items-center gap-1.5">
              <DollarSign className="h-3.5 w-3.5" />
              Daily P&L
            </TabsTrigger>
            <TabsTrigger value="greeks" className="flex items-center gap-1.5">
              <Activity className="h-3.5 w-3.5" />
              Greeks
            </TabsTrigger>
          </TabsList>

          {/* Equity Curve */}
          <TabsContent value="equity" className="space-y-4">
            <div className="h-[300px]">
              {equityCurveData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={equityCurveData}>
                    <defs>
                      <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="date" className="text-xs" tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                    <YAxis 
                      tickFormatter={(value) => formatCurrency(value)} 
                      className="text-xs"
                      tick={{ fill: 'hsl(var(--muted-foreground))' }}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'hsl(var(--popover))',
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '8px',
                      }}
                      formatter={(value: number) => [formatCurrency(value), "Portfolio Value"]}
                    />
                    <Area
                      type="monotone"
                      dataKey="value"
                      stroke="hsl(var(--primary))"
                      strokeWidth={2}
                      fillOpacity={1}
                      fill="url(#colorValue)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-muted-foreground">
                  No portfolio history data available
                </div>
              )}
            </div>
          </TabsContent>

          {/* Daily P&L Bars */}
          <TabsContent value="pnl" className="space-y-4">
            <div className="h-[300px]">
              {dailyPnlData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={dailyPnlData}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="date" className="text-xs" tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                    <YAxis 
                      tickFormatter={(value) => formatCurrency(value)} 
                      className="text-xs"
                      tick={{ fill: 'hsl(var(--muted-foreground))' }}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'hsl(var(--popover))',
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '8px',
                      }}
                      formatter={(value: number, name: string) => [
                        formatCurrency(value),
                        name === 'pnl' ? 'Daily P&L' : 'Cumulative',
                      ]}
                    />
                    <ReferenceLine y={0} stroke="hsl(var(--muted-foreground))" />
                    <Bar 
                      dataKey="pnl" 
                      fill="hsl(var(--primary))"
                      radius={[4, 4, 0, 0]}
                    />
                    <Line
                      type="monotone"
                      dataKey="cumulative"
                      stroke="hsl(var(--accent-foreground))"
                      strokeWidth={2}
                      dot={false}
                    />
                    <Legend />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-muted-foreground">
                  No P&L data available
                </div>
              )}
            </div>
          </TabsContent>

          {/* Greeks Exposure */}
          <TabsContent value="greeks" className="space-y-4">
            <div className="h-[300px]">
              {greeksData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={greeksData}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="date" className="text-xs" tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                    <YAxis className="text-xs" tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'hsl(var(--popover))',
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '8px',
                      }}
                    />
                    <Legend />
                    <ReferenceLine y={0} stroke="hsl(var(--muted-foreground))" />
                    <Line
                      type="monotone"
                      dataKey="delta"
                      name="Delta"
                      stroke="#22c55e"
                      strokeWidth={2}
                      dot={false}
                    />
                    <Line
                      type="monotone"
                      dataKey="gamma"
                      name="Gamma (×100)"
                      stroke="#3b82f6"
                      strokeWidth={2}
                      dot={false}
                    />
                    <Line
                      type="monotone"
                      dataKey="theta"
                      name="Theta"
                      stroke="#ef4444"
                      strokeWidth={2}
                      dot={false}
                    />
                    <Line
                      type="monotone"
                      dataKey="vega"
                      name="Vega"
                      stroke="#a855f7"
                      strokeWidth={2}
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-muted-foreground">
                  No Greeks history data available
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>

        {/* Summary Stats */}
        {data?.pnl_summary && (
          <div className="grid grid-cols-3 gap-4 mt-4 pt-4 border-t">
            <div className="text-center">
              <p className="text-sm text-muted-foreground">Today</p>
              <p className={`text-lg font-semibold ${data.pnl_summary.day_pnl >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                {data.pnl_summary.day_pnl >= 0 ? '+' : ''}{formatCurrency(data.pnl_summary.day_pnl)}
              </p>
            </div>
            <div className="text-center">
              <p className="text-sm text-muted-foreground">Week</p>
              <p className={`text-lg font-semibold ${data.pnl_summary.week_pnl >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                {data.pnl_summary.week_pnl >= 0 ? '+' : ''}{formatCurrency(data.pnl_summary.week_pnl)}
              </p>
            </div>
            <div className="text-center">
              <p className="text-sm text-muted-foreground">Month</p>
              <p className={`text-lg font-semibold ${data.pnl_summary.month_pnl >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                {data.pnl_summary.month_pnl >= 0 ? '+' : ''}{formatCurrency(data.pnl_summary.month_pnl)}
              </p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
