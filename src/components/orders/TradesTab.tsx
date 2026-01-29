import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { 
  Search, 
  TrendingUp, 
  TrendingDown, 
  DollarSign, 
  Activity,
  BarChart3,
  Receipt
} from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";

interface Trade {
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
  side?: string;
  mode?: string;
  order_type?: string;
  signal_id?: string;
}

export function TradesTab() {
  const [searchTerm, setSearchTerm] = useState("");
  const [sideFilter, setSideFilter] = useState<string>("all");
  const queryClient = useQueryClient();
  
  // Direct database query for trade data
  const { data: trades, isLoading, error } = useQuery({
    queryKey: ["trades", sideFilter],
    queryFn: async (): Promise<Trade[]> => {
      const { data, error } = await supabase
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
        .limit(200);
      
      if (error) throw error;
      
      // Flatten the joined data
      return (data || []).map(t => ({
        ...t,
        side: t.orders?.side,
        mode: t.orders?.mode,
        order_type: t.orders?.order_type,
        signal_id: t.orders?.signal_id,
      })) as Trade[];
    },
    refetchInterval: 10000,
  });

  // Real-time subscription for trades
  useEffect(() => {
    const channel = supabase
      .channel('trades-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'trades' },
        () => {
          queryClient.invalidateQueries({ queryKey: ['trades'] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  // Apply side filter
  const sideFilteredTrades = sideFilter === "all" 
    ? trades 
    : trades?.filter(t => t.side?.includes(sideFilter));

  // Filter by search term
  const filteredTrades = sideFilteredTrades?.filter(trade => {
    if (!searchTerm) return true;
    const search = searchTerm.toLowerCase();
    return (
      trade.symbol.toLowerCase().includes(search) ||
      trade.underlying.toLowerCase().includes(search)
    );
  });

  // Calculate analytics from data
  const analytics = filteredTrades && filteredTrades.length > 0 ? {
    total_trades: filteredTrades.length,
    total_volume: filteredTrades.reduce((sum, t) => sum + t.quantity, 0),
    total_commission: filteredTrades.reduce((sum, t) => sum + (t.commission || 0), 0),
    total_fees: filteredTrades.reduce((sum, t) => sum + (t.fees || 0), 0),
    total_premium_traded: filteredTrades.reduce((sum, t) => sum + Math.abs(t.total_cost), 0),
    trades_by_side: filteredTrades.reduce((acc, t) => {
      const side = t.side || "UNKNOWN";
      acc[side] = (acc[side] || 0) + 1;
      return acc;
    }, {} as Record<string, number>),
    trades_by_underlying: filteredTrades.reduce((acc, t) => {
      acc[t.underlying] = (acc[t.underlying] || 0) + 1;
      return acc;
    }, {} as Record<string, number>),
  } : null;

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "-";
    return format(new Date(dateStr), "MMM d, HH:mm:ss");
  };

  const formatCurrency = (value: number | null) => {
    if (value === null || value === undefined) return "-";
    const formatted = Math.abs(value).toFixed(2);
    return value >= 0 ? `$${formatted}` : `-$${formatted}`;
  };

  return (
    <div className="space-y-6">
      {/* Analytics Summary Cards */}
      {analytics && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-2">
                <Activity className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Total Trades</span>
              </div>
              <p className="text-2xl font-bold">{analytics.total_trades}</p>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Total Volume</span>
              </div>
              <p className="text-2xl font-bold">{analytics.total_volume}</p>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-2">
                <DollarSign className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Premium Traded</span>
              </div>
              <p className="text-2xl font-bold">{formatCurrency(analytics.total_premium_traded)}</p>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-2">
                <Receipt className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Commissions</span>
              </div>
              <p className="text-2xl font-bold text-warning">{formatCurrency(analytics.total_commission + analytics.total_fees)}</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Trade Breakdown */}
      {analytics && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">By Side</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {Object.entries(analytics.trades_by_side || {}).map(([side, count]) => (
                  <Badge 
                    key={side} 
                    variant={side.includes("BUY") ? "default" : "secondary"}
                    className="text-xs"
                  >
                    {side}: {count}
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">By Underlying</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {Object.entries(analytics.trades_by_underlying || {}).map(([underlying, count]) => (
                  <Badge key={underlying} variant="outline" className="text-xs">
                    {underlying}: {count}
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by symbol or underlying..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={sideFilter} onValueChange={setSideFilter}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Filter by side" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Sides</SelectItem>
                <SelectItem value="BUY">Buy</SelectItem>
                <SelectItem value="SELL">Sell</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Trades Table */}
      <Card>
        <CardHeader>
          <CardTitle>Trade Executions ({filteredTrades?.length || 0})</CardTitle>
          <CardDescription>
            Actual executed trades with fills, commissions, and costs
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">Loading trades...</div>
          ) : error ? (
            <div className="text-center py-8 text-destructive">
              Failed to load trades. Please try again.
            </div>
          ) : filteredTrades?.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No trades found. Executed trades will appear here.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Symbol</TableHead>
                    <TableHead>Side</TableHead>
                    <TableHead>Qty</TableHead>
                    <TableHead>Price</TableHead>
                    <TableHead>Total Cost</TableHead>
                    <TableHead>Fees</TableHead>
                    <TableHead>Mode</TableHead>
                    <TableHead>Executed</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredTrades?.map((trade) => {
                    const isBuy = trade.side?.includes("BUY");
                    
                    return (
                      <TableRow key={trade.id}>
                        <TableCell>
                          <div>
                            <p className="font-medium">{trade.underlying}</p>
                            <p className="text-xs text-muted-foreground">
                              ${trade.strike} {trade.option_type} {trade.expiration}
                            </p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant={isBuy ? "default" : "secondary"}>
                            {isBuy ? (
                              <TrendingUp className="h-3 w-3 mr-1" />
                            ) : (
                              <TrendingDown className="h-3 w-3 mr-1" />
                            )}
                            {trade.side || "N/A"}
                          </Badge>
                        </TableCell>
                        <TableCell>{trade.quantity}</TableCell>
                        <TableCell>${trade.execution_price.toFixed(2)}</TableCell>
                        <TableCell>
                          <span className={trade.total_cost < 0 ? "text-success" : ""}>
                            {formatCurrency(trade.total_cost)}
                          </span>
                        </TableCell>
                        <TableCell className="text-muted-foreground text-xs">
                          ${((trade.commission || 0) + (trade.fees || 0)).toFixed(2)}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs">
                            {trade.mode || "PAPER"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {formatDate(trade.executed_at)}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
