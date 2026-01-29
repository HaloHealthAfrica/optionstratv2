import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  AlertTriangle, 
  TrendingUp, 
  TrendingDown, 
  Clock, 
  RefreshCw,
  X,
  Zap,
  Target,
  ShieldAlert
} from "lucide-react";
import { useExitSignals, type ExitAlert } from "@/hooks/useExitSignals";
import { toast } from "sonner";

function getPriorityIcon(priority: ExitAlert['priority']) {
  switch (priority) {
    case 'CRITICAL':
      return <ShieldAlert className="h-4 w-4" />;
    case 'HIGH':
      return <AlertTriangle className="h-4 w-4" />;
    case 'MEDIUM':
      return <Target className="h-4 w-4" />;
    default:
      return <Clock className="h-4 w-4" />;
  }
}

function getPriorityColor(priority: ExitAlert['priority']) {
  switch (priority) {
    case 'CRITICAL':
      return 'bg-red-500/10 text-red-600 border-red-500/20';
    case 'HIGH':
      return 'bg-orange-500/10 text-orange-600 border-orange-500/20';
    case 'MEDIUM':
      return 'bg-yellow-500/10 text-yellow-600 border-yellow-500/20';
    default:
      return 'bg-muted text-muted-foreground';
  }
}

function getReasonIcon(reason: string | null) {
  switch (reason) {
    case 'PROFIT_TARGET':
      return <TrendingUp className="h-3 w-3" />;
    case 'STOP_LOSS':
    case 'TRAILING_STOP':
      return <TrendingDown className="h-3 w-3" />;
    case 'EXPIRATION_APPROACHING':
    case 'TIME_DECAY':
      return <Clock className="h-3 w-3" />;
    default:
      return <Zap className="h-3 w-3" />;
  }
}

function formatExpiration(expiration: string): string {
  return new Date(expiration).toLocaleDateString('en-US', { 
    month: 'short', 
    day: 'numeric' 
  });
}

export function ExitSignalsPanel() {
  const { data, isLoading, refetch, isFetching } = useExitSignals();
  const [dismissedAlerts, setDismissedAlerts] = useState<Set<string>>(new Set());
  
  const handleDismiss = (positionId: string) => {
    setDismissedAlerts(prev => new Set([...prev, positionId]));
    toast.info("Alert dismissed for this session");
  };
  
  const handleClosePosition = async (alert: ExitAlert) => {
    // This would trigger a close signal - for now just show toast
    toast.info(`Close order would be placed for ${alert.symbol}`, {
      description: `${alert.quantity} contracts at ${alert.exit_evaluation.suggested_order_type} price`,
    });
  };
  
  const handleRefresh = async () => {
    await refetch();
    toast.success("Exit signals refreshed");
  };
  
  const alerts = data?.alerts.filter(a => !dismissedAlerts.has(a.position_id)) || [];
  const summary = data?.summary;
  
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5" />
            Exit Signals
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="animate-pulse space-y-3">
            {[...Array(2)].map((_, i) => (
              <div key={i} className="h-20 bg-muted rounded-lg" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }
  
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5" />
            Exit Signals
            {summary && summary.positions_with_alerts > 0 && (
              <Badge variant="destructive" className="ml-2">
                {summary.positions_with_alerts} alerts
              </Badge>
            )}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={isFetching}
          >
            <RefreshCw className={`h-4 w-4 mr-1 ${isFetching ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Summary Stats */}
        {summary && summary.positions_with_alerts > 0 && (
          <div className="flex gap-2 flex-wrap">
            {summary.critical_alerts > 0 && (
              <Badge className="bg-red-500/10 text-red-600 border border-red-500/20">
                {summary.critical_alerts} Critical
              </Badge>
            )}
            {summary.high_alerts > 0 && (
              <Badge className="bg-orange-500/10 text-orange-600 border border-orange-500/20">
                {summary.high_alerts} High
              </Badge>
            )}
            {summary.medium_alerts > 0 && (
              <Badge className="bg-yellow-500/10 text-yellow-600 border border-yellow-500/20">
                {summary.medium_alerts} Medium
              </Badge>
            )}
          </div>
        )}
        
        {/* Alert Cards */}
        {alerts.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Target className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No exit signals detected</p>
            <p className="text-xs">All positions are within normal parameters</p>
          </div>
        ) : (
          <div className="space-y-3">
            {alerts.map((alert) => (
              <div 
                key={alert.position_id}
                className={`p-4 rounded-lg border ${getPriorityColor(alert.priority)}`}
              >
                <div className="flex items-start justify-between gap-4">
                  {/* Left: Alert Info */}
                  <div className="flex-1 space-y-2">
                    <div className="flex items-center gap-2">
                      {getPriorityIcon(alert.priority)}
                      <span className="font-semibold">{alert.underlying}</span>
                      <Badge variant="outline" className="text-xs">
                        ${alert.strike} {alert.option_type}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {formatExpiration(alert.expiration)}
                      </span>
                      <Badge variant="secondary" className="text-xs">
                        {alert.days_to_expiration} DTE
                      </Badge>
                    </div>
                    
                    <div className="flex items-center gap-2 text-sm">
                      {getReasonIcon(alert.exit_evaluation.reason)}
                      <span>{alert.exit_evaluation.details}</span>
                    </div>
                    
                    <div className="flex items-center gap-4 text-xs">
                      <span className={alert.unrealized_pnl >= 0 ? 'text-green-600' : 'text-red-600'}>
                        P&L: ${alert.unrealized_pnl.toFixed(2)} ({alert.unrealized_pnl_percent.toFixed(1)}%)
                      </span>
                      <span className="text-muted-foreground">
                        Qty: {alert.quantity}
                      </span>
                      <span className="text-muted-foreground">
                        Price: ${alert.current_price.toFixed(2)}
                      </span>
                    </div>
                  </div>
                  
                  {/* Right: Actions */}
                  <div className="flex items-center gap-2">
                    <Button 
                      size="sm" 
                      variant={alert.priority === 'CRITICAL' ? 'destructive' : 'default'}
                      onClick={() => handleClosePosition(alert)}
                    >
                      Close
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleDismiss(alert.position_id)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                
                {/* Recommended Action */}
                <div className="mt-2 pt-2 border-t border-current/10">
                  <span className="text-xs font-medium">
                    Recommended: {alert.recommended_action}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
