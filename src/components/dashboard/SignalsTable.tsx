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
import { Radio, CheckCircle, XCircle, Clock } from "lucide-react";
import { useSignals } from "@/hooks/useSystemData";
import { formatDistanceToNow } from "date-fns";
import type { Signal } from "@/lib/api";

const statusConfig = {
  PENDING: { icon: Clock, color: "bg-muted text-muted-foreground" },
  ACCEPTED: { icon: CheckCircle, color: "bg-success/20 text-success" },
  REJECTED: { icon: XCircle, color: "bg-destructive/20 text-destructive" },
};

export function SignalsTable() {
  const { data: signals, isLoading } = useSignals();

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Radio className="h-5 w-5" />
            Recent Signals
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="animate-pulse space-y-2">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-12 bg-muted rounded" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!signals || signals.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Radio className="h-5 w-5" />
            Recent Signals
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground text-center py-8">
            No signals received yet. Send a webhook to get started.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Radio className="h-5 w-5" />
          Recent Signals
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Source</TableHead>
              <TableHead>Direction</TableHead>
              <TableHead>Symbol</TableHead>
              <TableHead>Timeframe</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Time</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {signals.slice(0, 10).map((signal) => {
              const statusKey = signal.validation_result?.valid === true
                ? "ACCEPTED"
                : signal.validation_result?.valid === false
                  ? "REJECTED"
                  : "PENDING";

              const StatusIcon = statusConfig[statusKey]?.icon || Clock;
              const statusColor = statusConfig[statusKey]?.color || "bg-muted";

              return (
                <TableRow key={signal.id}>
                  <TableCell className="font-medium text-xs">{signal.source}</TableCell>
                  <TableCell>
                    <Badge variant={
                      signal.direction === "CALL" ? "default" : "secondary"
                    }>
                      {signal.direction || "-"}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-mono-trading">
                    {signal.symbol || "-"}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-xs">
                      {signal.timeframe}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge className={statusColor}>
                      <StatusIcon className="h-3 w-3 mr-1" />
                      {statusKey}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {formatDistanceToNow(new Date(signal.created_at), { addSuffix: true })}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}