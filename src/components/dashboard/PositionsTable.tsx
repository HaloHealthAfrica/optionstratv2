import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Briefcase, RefreshCw } from "lucide-react";
import { usePositions } from "@/hooks/useSystemData";
import { formatDistanceToNow } from "date-fns";
import { useState } from "react";

export function PositionsTable() {
  const { data, isLoading, refetch } = usePositions();
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await refetch();
    setIsRefreshing(false);
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Briefcase className="h-5 w-5" />
            Open Positions
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="animate-pulse space-y-2">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-12 bg-muted rounded" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  const positions = data?.positions || [];
  const totals = data?.totals;

  if (positions.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Briefcase className="h-5 w-5" />
            Open Positions
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground text-center py-8">
            No open positions. Signals will create positions when executed.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Briefcase className="h-5 w-5" />
            Open Positions ({positions.length})
          </span>
          <div className="flex items-center gap-4">
            {totals && (
              <span className={`text-sm font-mono-trading ${
                (totals.total_unrealized_pnl || 0) >= 0 ? "text-success" : "text-destructive"
              }`}>
                P&L: ${totals.total_unrealized_pnl?.toFixed(2) || "0.00"}
              </span>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              disabled={isRefreshing}
            >
              <RefreshCw className={`h-4 w-4 mr-1 ${isRefreshing ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Symbol</TableHead>
              <TableHead>Direction</TableHead>
              <TableHead className="text-right">Qty</TableHead>
              <TableHead className="text-right">Entry</TableHead>
              <TableHead className="text-right">Current</TableHead>
              <TableHead className="text-right">Unrealized</TableHead>
              <TableHead className="text-right">Realized</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Opened</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {positions.map((position) => (
              <TableRow key={position.id}>
                <TableCell className="font-mono-trading font-medium">
                  {position.symbol}
                </TableCell>
                <TableCell>
                  <Badge variant={position.direction === "CALL" ? "default" : "secondary"}>
                    {position.direction}
                  </Badge>
                </TableCell>
                <TableCell className="text-right font-mono-trading">
                  {position.quantity}
                </TableCell>
                <TableCell className="text-right font-mono-trading">
                  ${position.entry_price.toFixed(2)}
                </TableCell>
                <TableCell className="text-right font-mono-trading">
                  {position.current_price ? `$${position.current_price.toFixed(2)}` : "-"}
                </TableCell>
                <TableCell className={`text-right font-mono-trading ${
                  (position.unrealized_pnl || 0) >= 0 ? "text-success" : "text-destructive"
                }`}>
                  {position.unrealized_pnl != null
                    ? `$${position.unrealized_pnl.toFixed(2)}`
                    : "-"}
                </TableCell>
                <TableCell className={`text-right font-mono-trading ${
                  (position.realized_pnl || 0) >= 0 ? "text-success" : "text-destructive"
                }`}>
                  {position.realized_pnl != null
                    ? `$${position.realized_pnl.toFixed(2)}`
                    : "-"}
                </TableCell>
                <TableCell>
                  <Badge variant={position.status === "OPEN" ? "outline" : "secondary"}>
                    {position.status}
                  </Badge>
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {formatDistanceToNow(new Date(position.entry_time), { addSuffix: true })}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        {totals && (
          <div className="mt-4 pt-4 border-t">
            {/* P&L Summary */}
            <div className="grid grid-cols-3 gap-4 mb-4 text-sm">
              <div>
                <span className="text-muted-foreground">Unrealized P&L:</span>
                <span className={`ml-2 font-mono-trading font-medium ${
                  (totals.total_unrealized_pnl || 0) >= 0 ? "text-success" : "text-destructive"
                }`}>
                  ${totals.total_unrealized_pnl?.toFixed(2) || 0}
                </span>
              </div>
              <div>
                <span className="text-muted-foreground">Exposure:</span>
                <span className="ml-2 font-mono-trading font-medium">
                  ${totals.total_exposure?.toFixed(2) || 0}
                </span>
              </div>
              <div>
                <span className="text-muted-foreground">Day Realized:</span>
                <span className={`ml-2 font-mono-trading font-medium ${
                  (totals.day_realized_pnl || 0) >= 0 ? "text-success" : "text-destructive"
                }`}>
                  ${totals.day_realized_pnl?.toFixed(2) || 0}
                </span>
              </div>
              <div>
                <span className="text-muted-foreground">Week Realized:</span>
                <span className={`ml-2 font-mono-trading font-medium ${
                  (totals.week_realized_pnl || 0) >= 0 ? "text-success" : "text-destructive"
                }`}>
                  ${totals.week_realized_pnl?.toFixed(2) || 0}
                </span>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
