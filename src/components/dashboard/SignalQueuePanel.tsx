import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Clock, Zap } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { POLLING_INTERVALS } from "@/lib/polling";
import apiClient from "@/lib/api-client";
import { formatDistanceToNow } from "date-fns";

interface QueuedSignal {
  id: string;
  source: string;
  symbol: string;
  direction: string;
  timeframe: string;
  created_at: string;
  validation_result?: {
    valid?: boolean;
    rejection_reason?: string;
    stage?: string;
  } | null;
}

async function fetchQueuedSignals(): Promise<QueuedSignal[]> {
  const { data, error } = await apiClient.getSignals({ limit: 10 });
  if (error || !data) throw error || new Error('Failed to fetch signals');
  return ((data as any).signals || data || []) as QueuedSignal[];
}

export function SignalQueuePanel() {
  const { data: queuedSignals, isLoading } = useQuery({
    queryKey: ["queued-signals"],
    queryFn: fetchQueuedSignals,
    refetchInterval: POLLING_INTERVALS.signalQueue,
  });

  const signalCount = queuedSignals?.length || 0;

  return (
    <Card className="h-full">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-primary" />
            Signal Queue
          </span>
          {signalCount > 0 && (
            <Badge variant="secondary" className="text-xs">
              {signalCount} pending
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {isLoading ? (
          <div className="space-y-2">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-12 bg-muted rounded animate-pulse" />
            ))}
          </div>
        ) : signalCount === 0 ? (
          <div className="text-center py-6 text-sm text-muted-foreground">
            <Zap className="h-8 w-8 mx-auto mb-2 opacity-20" />
            No signals queued
          </div>
        ) : (
          queuedSignals?.slice(0, 5).map((signal) => {
            return (
              <div
                key={signal.id}
                className="flex items-center justify-between p-2 rounded-lg bg-muted/50 border border-border"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <Badge 
                    variant={signal.direction === "CALL" ? "default" : "secondary"}
                    className="text-xs shrink-0"
                  >
                    {signal.direction}
                  </Badge>
                  <span className="font-mono-trading text-sm truncate">
                    {signal.symbol} · {signal.timeframe}
                  </span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {signal.validation_result?.valid === false && (
                    <Badge variant="destructive" className="text-[10px]">
                      Rejected
                    </Badge>
                  )}
                  <span className="text-xs text-muted-foreground">
                    {formatDistanceToNow(new Date(signal.created_at), { addSuffix: true })}
                  </span>
                </div>
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}
