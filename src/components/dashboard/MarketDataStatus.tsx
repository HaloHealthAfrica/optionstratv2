import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { TrendingUp, AlertTriangle } from "lucide-react";

// This status reflects the known 401 issue with price data connectivity
// In a real implementation, this would come from a health check endpoint
export function MarketDataStatus() {
  // Currently hardcoded based on known connectivity issue
  // TODO: Fetch actual connectivity status from health endpoint
  const isConnected = false;
  const lastError = "401 Unauthorized - Proxy authentication failed";

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge 
          variant="outline" 
          className={isConnected 
            ? "text-success border-success/30 bg-success/5 cursor-help" 
            : "text-warning border-warning/30 bg-warning/5 cursor-help"
          }
        >
          {isConnected ? (
            <TrendingUp className="h-3 w-3 mr-1" />
          ) : (
            <AlertTriangle className="h-3 w-3 mr-1" />
          )}
          Prices
        </Badge>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="max-w-[250px]">
        {isConnected ? (
          <p className="text-sm">Market data feed connected</p>
        ) : (
          <div className="space-y-1">
            <p className="text-sm font-medium">Price feed disconnected</p>
            <p className="text-xs text-muted-foreground">{lastError}</p>
            <p className="text-xs text-warning">P&L-based exits disabled until resolved</p>
          </div>
        )}
      </TooltipContent>
    </Tooltip>
  );
}
