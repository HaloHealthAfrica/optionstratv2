import { useAllMarketContexts, getContextFreshness } from "@/hooks/useMarketContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  TrendingUp, 
  TrendingDown, 
  Activity, 
  Clock, 
  Target,
  ArrowUp,
  ArrowDown,
  Minus,
  AlertTriangle,
  RefreshCw
} from "lucide-react";
import { cn } from "@/lib/utils";

export function MarketContextPanel() {
  const { data: contexts, isLoading, error } = useAllMarketContexts();

  if (isLoading) {
    return (
      <Card className="border-border/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Activity className="h-4 w-4" />
            Market Context
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error || !contexts || contexts.length === 0) {
    return (
      <Card className="border-border/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Activity className="h-4 w-4" />
            Market Context
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            No market context data available. Context webhooks will populate this panel.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-border/50">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Activity className="h-4 w-4" />
          Market Context
          <Badge variant="outline" className="ml-auto text-xs">
            {contexts.length} ticker{contexts.length !== 1 ? 's' : ''}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {contexts.map((ctx) => (
          <ContextCard key={ctx.ticker} context={ctx} />
        ))}
      </CardContent>
    </Card>
  );
}

interface ContextCardProps {
  context: {
    ticker: string;
    price: number;
    updated_at: string;
    vix: number | null;
    vix_regime: string | null;
    market_bias: string | null;
    or_breakout: string | null;
    is_market_open: boolean;
    spy_trend: string | null;
    moving_with_market: boolean | null;
    candle_pattern: string | null;
  };
}

function ContextCard({ context }: ContextCardProps) {
  const freshness = getContextFreshness(context as any);
  
  const getBiasColor = (bias: string | null) => {
    if (bias === "BULLISH") return "text-emerald-500";
    if (bias === "BEARISH") return "text-red-500";
    return "text-muted-foreground";
  };

  const getBiasIcon = (bias: string | null) => {
    if (bias === "BULLISH") return <TrendingUp className="h-3 w-3" />;
    if (bias === "BEARISH") return <TrendingDown className="h-3 w-3" />;
    return <Minus className="h-3 w-3" />;
  };

  const getVixBadge = (regime: string | null) => {
    if (regime === "HIGH_VOL") return <Badge variant="destructive" className="text-xs">High VIX</Badge>;
    if (regime === "LOW_VOL") return <Badge variant="secondary" className="text-xs">Low VIX</Badge>;
    return <Badge variant="outline" className="text-xs">Normal VIX</Badge>;
  };

  const getOrBreakout = (breakout: string | null) => {
    if (breakout === "ABOVE") return <Badge className="bg-emerald-500/10 text-emerald-500 text-xs">OR Above</Badge>;
    if (breakout === "BELOW") return <Badge className="bg-red-500/10 text-red-500 text-xs">OR Below</Badge>;
    if (breakout === "INSIDE") return <Badge variant="outline" className="text-xs">OR Inside</Badge>;
    return null;
  };

  return (
    <div className={cn(
      "p-3 rounded-lg border",
      freshness === "stale" ? "border-yellow-500/30 bg-yellow-500/5" : "border-border/50 bg-muted/30"
    )}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="font-mono font-medium">{context.ticker}</span>
          <span className="text-sm text-muted-foreground">${context.price?.toFixed(2)}</span>
        </div>
        <div className="flex items-center gap-1">
          {freshness === "stale" && (
            <AlertTriangle className="h-3 w-3 text-yellow-500" />
          )}
          {freshness === "fresh" && (
            <RefreshCw className="h-3 w-3 text-emerald-500" />
          )}
          <span className="text-xs text-muted-foreground">
            {new Date(context.updated_at).toLocaleTimeString()}
          </span>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5 mb-2">
        {getVixBadge(context.vix_regime)}
        {getOrBreakout(context.or_breakout)}
        {!context.is_market_open && (
          <Badge variant="outline" className="text-xs border-yellow-500/50 text-yellow-500">
            <Clock className="h-3 w-3 mr-1" />
            Closed
          </Badge>
        )}
      </div>

      <div className="grid grid-cols-3 gap-2 text-xs">
        <div className="flex items-center gap-1">
          <span className="text-muted-foreground">Bias:</span>
          <span className={cn("flex items-center gap-0.5", getBiasColor(context.market_bias))}>
            {getBiasIcon(context.market_bias)}
            {context.market_bias || "N/A"}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-muted-foreground">SPY:</span>
          <span className={getBiasColor(context.spy_trend)}>
            {context.spy_trend || "N/A"}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-muted-foreground">Aligned:</span>
          <span className={context.moving_with_market ? "text-emerald-500" : "text-red-500"}>
            {context.moving_with_market ? "Yes" : "No"}
          </span>
        </div>
      </div>

      {context.candle_pattern && context.candle_pattern !== "NONE" && (
        <div className="mt-2 text-xs">
          <span className="text-muted-foreground">Pattern: </span>
          <span className="font-medium">{context.candle_pattern}</span>
        </div>
      )}
    </div>
  );
}
