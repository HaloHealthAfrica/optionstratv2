import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Search, TrendingUp, TrendingDown, DollarSign, Target, Calendar } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import apiClient from "@/lib/api-client";
import { POLLING_INTERVALS } from "@/lib/polling";
import { format, differenceInDays } from "date-fns";

interface ClosedPosition {
  id: string;
  signal_id: string;
  symbol: string;
  direction: string;
  quantity: number;
  entry_price: number;
  entry_time: string;
  exit_time: string | null;
  realized_pnl: number | null;
}

export function ClosedPnLTab() {
  const [searchTerm, setSearchTerm] = useState('');
  const queryClient = useQueryClient();

  // Fetch closed positions from API
  const { data: closedPositions, isLoading } = useQuery({
    queryKey: ['closed-positions'],
    queryFn: async () => {
      const { data, error } = await apiClient.getPositions({ showClosed: true, limit: 100 });
      if (error || !data) throw error || new Error('Failed to fetch closed positions');
      const payload = (data as any).positions || data;
      const positions = payload.filter((p: ClosedPosition) => p.exit_time !== null);
      return positions as ClosedPosition[];
    },
    refetchInterval: POLLING_INTERVALS.closedPnL,
  });

  // Polling instead of realtime subscription
  useEffect(() => {
    const interval = setInterval(() => {
      queryClient.invalidateQueries({ queryKey: ['closed-positions'] });
    }, POLLING_INTERVALS.closedPnL);

    return () => clearInterval(interval);
  }, [queryClient]);

  // Filter positions by search term
  const filteredPositions = closedPositions?.filter(position => {
    if (!searchTerm) return true;
    const search = searchTerm.toLowerCase();
    return (
      position.symbol.toLowerCase().includes(search)
    );
  });

  // Calculate summary stats
  const stats = {
    totalTrades: filteredPositions?.length || 0,
    totalPnL: filteredPositions?.reduce((sum, p) => sum + (p.realized_pnl || 0), 0) || 0,
    winners: filteredPositions?.filter(p => (p.realized_pnl || 0) > 0).length || 0,
    losers: filteredPositions?.filter(p => (p.realized_pnl || 0) < 0).length || 0,
  };

  const winRate = stats.totalTrades > 0 ? (stats.winners / stats.totalTrades * 100).toFixed(1) : '0.0';

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '-';
    return format(new Date(dateStr), 'MMM d, yyyy');
  };

  const formatPnL = (pnl: number | null) => {
    if (pnl === null) return '-';
    const formatted = Math.abs(pnl).toFixed(2);
    return pnl >= 0 ? `+$${formatted}` : `-$${formatted}`;
  };

  const getHoldingDays = (opened: string, closed: string | null) => {
    if (!closed) return '-';
    return differenceInDays(new Date(closed), new Date(opened));
  };

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Total P&L</span>
            </div>
            <p className={`text-2xl font-bold ${stats.totalPnL >= 0 ? 'text-green-500' : 'text-red-500'}`}>
              {formatPnL(stats.totalPnL)}
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <Target className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Win Rate</span>
            </div>
            <p className="text-2xl font-bold">{winRate}%</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-green-500" />
              <span className="text-sm text-muted-foreground">Winners</span>
            </div>
            <p className="text-2xl font-bold text-green-500">{stats.winners}</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <TrendingDown className="h-4 w-4 text-red-500" />
              <span className="text-sm text-muted-foreground">Losers</span>
            </div>
            <p className="text-2xl font-bold text-red-500">{stats.losers}</p>
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      <Card>
        <CardContent className="pt-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by symbol..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
        </CardContent>
      </Card>

      {/* Closed Positions Table */}
      <Card>
        <CardHeader>
          <CardTitle>Closed Positions ({filteredPositions?.length || 0})</CardTitle>
          <CardDescription>
            Realized P&L from all closed trades
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">Loading closed positions...</div>
          ) : filteredPositions?.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No closed positions found. Closed trades will appear here.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Symbol</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Qty</TableHead>
                    <TableHead>Entry</TableHead>
                    <TableHead>P&L</TableHead>
                    <TableHead>Holding</TableHead>
                    <TableHead>Opened</TableHead>
                    <TableHead>Closed</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredPositions?.map((position) => {
                    const pnl = position.realized_pnl || 0;
                    const pnlPercent = position.entry_price !== 0
                      ? (pnl / Math.abs(position.entry_price * position.quantity * 100) * 100)
                      : 0;
                    
                    return (
                      <TableRow key={position.id}>
                        <TableCell>
                          <div>
                            <p className="font-medium">{position.symbol}</p>
                            <p className="text-xs text-muted-foreground">
                              {position.direction}
                            </p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">
                            {position.direction}
                          </Badge>
                        </TableCell>
                        <TableCell>{position.quantity}</TableCell>
                        <TableCell>${position.entry_price.toFixed(2)}</TableCell>
                        <TableCell>
                          <div className={pnl >= 0 ? 'text-green-500' : 'text-red-500'}>
                            <p className="font-medium">{formatPnL(pnl)}</p>
                            <p className="text-xs">
                              {pnlPercent >= 0 ? '+' : ''}{pnlPercent.toFixed(1)}%
                            </p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1 text-muted-foreground">
                            <Calendar className="h-3 w-3" />
                            <span>{getHoldingDays(position.entry_time, position.exit_time)}d</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {formatDate(position.entry_time)}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {formatDate(position.exit_time)}
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
