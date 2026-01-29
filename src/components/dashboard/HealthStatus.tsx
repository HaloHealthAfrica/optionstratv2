import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Activity, Database, Clock, Zap } from "lucide-react";
import { useHealth } from "@/hooks/useSystemData";
import { formatDistanceToNow } from "date-fns";

export function HealthStatus() {
  const { data: health, isLoading, error } = useHealth();

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Activity className="h-4 w-4" />
            System Health
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="animate-pulse space-y-2">
            <div className="h-8 bg-muted rounded" />
            <div className="h-4 bg-muted rounded w-3/4" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error || !health) {
    return (
      <Card className="border-destructive/50">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Activity className="h-4 w-4 text-destructive" />
            System Health
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Badge variant="destructive">Unable to fetch health</Badge>
        </CardContent>
      </Card>
    );
  }

  const statusColors = {
    healthy: "bg-success text-success-foreground",
    degraded: "bg-warning text-warning-foreground",
    unhealthy: "bg-destructive text-destructive-foreground",
  };

  const uptimeHours = Math.floor(health.uptime_ms / (1000 * 60 * 60));
  const uptimeMinutes = Math.floor((health.uptime_ms % (1000 * 60 * 60)) / (1000 * 60));

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Activity className="h-4 w-4" />
          System Health
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center justify-between">
          <Badge className={statusColors[health.status]}>
            {health.status.toUpperCase()}
          </Badge>
          <span className="text-xs text-muted-foreground font-mono-trading">
            v{health.version}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-2 text-sm">
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Database className="h-3.5 w-3.5" />
            <span>Database:</span>
            <span className={health.database.connected ? "text-success" : "text-destructive"}>
              {health.database.connected ? "Connected" : "Disconnected"}
            </span>
          </div>

          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Clock className="h-3.5 w-3.5" />
            <span>Uptime:</span>
            <span className="text-foreground font-mono-trading">
              {uptimeHours}h {uptimeMinutes}m
            </span>
          </div>
        </div>

        {health.last_activity.signal && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Zap className="h-3 w-3" />
            <span>Last signal:</span>
            <span className="text-foreground">
              {formatDistanceToNow(new Date(health.last_activity.signal), { addSuffix: true })}
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
