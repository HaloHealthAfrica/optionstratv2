import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { 
  TrendingUp, 
  TrendingDown,
  DollarSign,
  BarChart3,
  Calendar,
  Filter,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import apiClient from "@/lib/api-client";
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { DashboardLayout } from "@/components/layout/DashboardLayout";

interface Trade {
  id: string;
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
  side?: string;
  mode?: string;
}

interface Analytics {
  pnl_summary: {
    realized_pnl: number;
    unrealized_pnl: number;
    total_pnl: number;
    day_pnl: number;
    week_pnl: number;
    month_pnl: number;
    total_commissions: number;
    total_fees: number;
    net_pnl: number;
  };
  performance_metrics: {
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
  };
  pnl_by_period: Array<{
    date: string;
    realized_pnl: number;
    cumulative_pnl: number;
    trade_count: number;
  }>;
  pnl_by_underlying: Array<{
    underlying: string;
    realized_pnl: number;
    trade_count: number;
    win_rate: number;
  }>;
}

async function fetchTrades(underlying?: string, limit = 50) {
  const { data, error } = await apiClient.getTrades({
    limit,
    includeAnalytics: true,
    underlying: underlying && underlying !== "all" ? underlying : undefined,
  });
  if (error || !data) throw error || new Error("Failed to fetch trades");
  return data;
}

async function fetchAnalytics(period = "30d") {
  const { data, error } = await apiClient.getAnalytics(period);
  if (error || !data) throw error || new Error("Failed to fetch analytics");
  return data as Analytics;
}

const COLORS = ['hsl(var(--primary))', 'hsl(var(--secondary))', 'hsl(var(--accent))', '#8884d8', '#82ca9d'];

function PnLCard({ label, value, subLabel }: { label: string; value: number; subLabel?: string }) {
  const isPositive = value >= 0;
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className={`text-2xl font-bold font-mono-trading ${isPositive ? 'text-success' : 'text-destructive'}`}>
              {isPositive ? '+' : ''}{value.toFixed(2)}
            </p>
            {subLabel && <p className="text-xs text-muted-foreground">{subLabel}</p>}
          </div>
          {isPositive ? (
            <TrendingUp className="h-8 w-8 text-success/20" />
          ) : (
            <TrendingDown className="h-8 w-8 text-destructive/20" />
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default function History() {
  const [period, setPeriod] = useState("30d");
  const [underlying, setUnderlying] = useState("all");

  const { data: tradesData, isLoading: tradesLoading } = useQuery({
    queryKey: ["trades", underlying],
    queryFn: () => fetchTrades(underlying),
  });

  const { data: analytics } = useQuery({
    queryKey: ["analytics", period],
    queryFn: () => fetchAnalytics(period),
  });

  const trades: Trade[] = tradesData?.trades || [];
  const availableUnderlyings: string[] = tradesData?.filters?.underlyings || [];

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Page Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-primary/10">
              <BarChart3 className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-xl font-bold">Trade History & Analytics</h1>
              <p className="text-xs text-muted-foreground">
                Performance metrics and historical trades
              </p>
            </div>
          </div>
          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger className="w-32">
              <Calendar className="h-4 w-4 mr-2" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7d">7 Days</SelectItem>
              <SelectItem value="30d">30 Days</SelectItem>
              <SelectItem value="90d">90 Days</SelectItem>
              <SelectItem value="all">All Time</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Tabs defaultValue="overview" className="space-y-6">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="trades">Trade History</TabsTrigger>
            <TabsTrigger value="performance">Performance</TabsTrigger>
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview" className="space-y-6">
            {/* P&L Summary Cards */}
            <div className="grid gap-4 md:grid-cols-4">
              <PnLCard 
                label="Total P&L" 
                value={analytics?.pnl_summary.total_pnl || 0} 
                subLabel="Realized + Unrealized"
              />
              <PnLCard 
                label="Today" 
                value={analytics?.pnl_summary.day_pnl || 0} 
              />
              <PnLCard 
                label="This Week" 
                value={analytics?.pnl_summary.week_pnl || 0} 
              />
              <PnLCard 
                label="This Month" 
                value={analytics?.pnl_summary.month_pnl || 0} 
              />
            </div>

            {/* Charts Row */}
            <div className="grid gap-6 md:grid-cols-2">
              {/* Cumulative P&L Chart */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Cumulative P&L</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={analytics?.pnl_by_period || []}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                        <XAxis 
                          dataKey="date" 
                          tick={{ fontSize: 10 }}
                          tickFormatter={(v) => format(new Date(v), 'MM/dd')}
                        />
                        <YAxis tick={{ fontSize: 10 }} />
                        <Tooltip 
                          formatter={(value: number) => [`$${value.toFixed(2)}`, 'P&L']}
                          labelFormatter={(label) => format(new Date(label), 'MMM dd, yyyy')}
                        />
                        <Line 
                          type="monotone" 
                          dataKey="cumulative_pnl" 
                          stroke="hsl(var(--primary))" 
                          strokeWidth={2}
                          dot={false}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>

              {/* Daily P&L Bar Chart */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Daily P&L</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={analytics?.pnl_by_period || []}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                        <XAxis 
                          dataKey="date" 
                          tick={{ fontSize: 10 }}
                          tickFormatter={(v) => format(new Date(v), 'MM/dd')}
                        />
                        <YAxis tick={{ fontSize: 10 }} />
                        <Tooltip 
                          formatter={(value: number) => [`$${value.toFixed(2)}`, 'P&L']}
                          labelFormatter={(label) => format(new Date(label), 'MMM dd, yyyy')}
                        />
                        <Bar 
                          dataKey="realized_pnl" 
                          fill="hsl(var(--primary))"
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* P&L by Underlying */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">P&L by Underlying</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={analytics?.pnl_by_underlying?.filter(u => u.realized_pnl > 0) || []}
                          dataKey="realized_pnl"
                          nameKey="underlying"
                          cx="50%"
                          cy="50%"
                          outerRadius={80}
                          label={({ underlying }) => underlying}
                        >
                          {(analytics?.pnl_by_underlying || []).map((_, index) => (
                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(value: number) => `$${value.toFixed(2)}`} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="space-y-2">
                    {analytics?.pnl_by_underlying?.slice(0, 8).map((item) => (
                      <div key={item.underlying} className="flex items-center justify-between py-2 border-b last:border-0">
                        <div className="flex items-center gap-2">
                          <span className="font-mono-trading font-medium">{item.underlying}</span>
                          <Badge variant="outline" className="text-xs">
                            {item.trade_count} trades
                          </Badge>
                        </div>
                        <div className="text-right">
                          <span className={`font-mono-trading ${item.realized_pnl >= 0 ? 'text-success' : 'text-destructive'}`}>
                            ${item.realized_pnl.toFixed(2)}
                          </span>
                          <span className="text-xs text-muted-foreground ml-2">
                            {item.win_rate.toFixed(0)}% win
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Trade History Tab */}
          <TabsContent value="trades" className="space-y-4">
            {/* Filters */}
            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center gap-4">
                  <Filter className="h-4 w-4 text-muted-foreground" />
                  <Select value={underlying} onValueChange={setUnderlying}>
                    <SelectTrigger className="w-40">
                      <SelectValue placeholder="All Underlyings" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Underlyings</SelectItem>
                      {availableUnderlyings.map((u) => (
                        <SelectItem key={u} value={u}>{u}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>

            {/* Trades Table */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <DollarSign className="h-5 w-5" />
                  Recent Trades ({trades.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                {tradesLoading ? (
                  <div className="animate-pulse space-y-2">
                    {[...Array(5)].map((_, i) => (
                      <div key={i} className="h-12 bg-muted rounded" />
                    ))}
                  </div>
                ) : trades.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">
                    No trades found. Execute signals to see trade history.
                  </p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Time</TableHead>
                        <TableHead>Symbol</TableHead>
                        <TableHead>Side</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead className="text-right">Qty</TableHead>
                        <TableHead className="text-right">Price</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                        <TableHead className="text-right">Fees</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {trades.map((trade) => (
                        <TableRow key={trade.id}>
                          <TableCell className="text-xs text-muted-foreground">
                            {format(new Date(trade.executed_at), 'MM/dd HH:mm')}
                          </TableCell>
                          <TableCell className="font-mono-trading font-medium">
                            {trade.underlying}
                            <span className="text-muted-foreground text-xs ml-1">
                              ${trade.strike}
                            </span>
                          </TableCell>
                          <TableCell>
                            <Badge variant={trade.side?.includes('BUY') ? 'default' : 'secondary'}>
                              {trade.side || '-'}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">{trade.option_type}</Badge>
                          </TableCell>
                          <TableCell className="text-right font-mono-trading">
                            {trade.quantity}
                          </TableCell>
                          <TableCell className="text-right font-mono-trading">
                            ${trade.execution_price.toFixed(2)}
                          </TableCell>
                          <TableCell className="text-right font-mono-trading">
                            ${Math.abs(trade.total_cost).toFixed(2)}
                          </TableCell>
                          <TableCell className="text-right font-mono-trading text-muted-foreground">
                            ${(trade.commission + trade.fees).toFixed(2)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Performance Tab */}
          <TabsContent value="performance" className="space-y-6">
            <div className="grid gap-4 md:grid-cols-4">
              <Card>
                <CardContent className="pt-6 text-center">
                  <p className="text-sm text-muted-foreground">Win Rate</p>
                  <p className="text-3xl font-bold font-mono-trading">
                    {(analytics?.performance_metrics.win_rate ?? 0).toFixed(1)}%
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6 text-center">
                  <p className="text-sm text-muted-foreground">Profit Factor</p>
                  <p className="text-3xl font-bold font-mono-trading">
                    {(analytics?.performance_metrics.profit_factor ?? 0).toFixed(2)}
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6 text-center">
                  <p className="text-sm text-muted-foreground">Avg Win</p>
                  <p className="text-3xl font-bold font-mono-trading text-success">
                    +${(analytics?.performance_metrics.avg_win ?? 0).toFixed(0)}
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6 text-center">
                  <p className="text-sm text-muted-foreground">Avg Loss</p>
                  <p className="text-3xl font-bold font-mono-trading text-destructive">
                    -${Math.abs(analytics?.performance_metrics.avg_loss ?? 0).toFixed(0)}
                  </p>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
