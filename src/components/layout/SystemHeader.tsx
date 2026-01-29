import { useHealth } from "@/hooks/useSystemData";
import { useDashboardRealtime } from "@/hooks/useRealtimeSubscriptions";
import { Badge } from "@/components/ui/badge";
import { Wifi, WifiOff, AlertTriangle, CheckCircle } from "lucide-react";
import { ModeIndicator } from "@/components/dashboard/ModeIndicator";
import { MarketDataStatus } from "@/components/dashboard/MarketDataStatus";

export function SystemHeader() {
  const { data: health } = useHealth();
  const { isConnected } = useDashboardRealtime();
  
  const mode = health?.mode || "PAPER";
  const liveTradingEnabled = health?.live_trading_enabled || false;
  const dbConnected = health?.database?.connected ?? false;

  return (
    <header className="h-14 border-b border-border bg-card/50 backdrop-blur-sm px-4 flex items-center justify-between gap-4">
      <div className="flex items-center gap-3">
        <h1 className="text-lg font-semibold hidden sm:block">Options Trading System</h1>
        <Badge 
          variant="outline" 
          className={isConnected 
            ? "text-success border-success/30 bg-success/5" 
            : "text-muted-foreground"
          }
        >
          {isConnected ? (
            <Wifi className="h-3 w-3 mr-1" />
          ) : (
            <WifiOff className="h-3 w-3 mr-1" />
          )}
          {isConnected ? "Live" : "Connecting..."}
        </Badge>
      </div>
      
      <div className="flex items-center gap-3">
        <MarketDataStatus />
        
        <Badge 
          variant="outline" 
          className={dbConnected 
            ? "text-success border-success/30 bg-success/5" 
            : "text-destructive border-destructive/30 bg-destructive/5"
          }
        >
          {dbConnected ? (
            <CheckCircle className="h-3 w-3 mr-1" />
          ) : (
            <AlertTriangle className="h-3 w-3 mr-1" />
          )}
          DB
        </Badge>
        
        <ModeIndicator mode={mode as "PAPER" | "LIVE"} liveTradingEnabled={liveTradingEnabled} />
      </div>
    </header>
  );
}
