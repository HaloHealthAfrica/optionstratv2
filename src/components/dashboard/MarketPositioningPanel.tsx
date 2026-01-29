import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  TrendingUp, 
  TrendingDown, 
  Minus,
  Target,
  Activity,
  BarChart3,
  Zap,
  AlertTriangle
} from "lucide-react";
import { useMarketPositioning } from "@/hooks/useMarketPositioning";

interface MarketPositioningPanelProps {
  underlying: string;
  expiration: string;
}

export function MarketPositioningPanel({ underlying, expiration }: MarketPositioningPanelProps) {
  const { data, isLoading, error } = useMarketPositioning(underlying, expiration);

  if (isLoading) {
    return (
      <Card className="col-span-full">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Market Positioning
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-24" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error || !data) {
    return (
      <Card className="col-span-full">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Market Positioning
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-muted-foreground text-sm flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" />
            {error instanceof Error ? error.message : 'Unable to load positioning data'}
          </div>
        </CardContent>
      </Card>
    );
  }

  const getBiasIcon = (bias: string) => {
    if (bias.includes('BULLISH')) return <TrendingUp className="h-5 w-5 text-green-500" />;
    if (bias.includes('BEARISH')) return <TrendingDown className="h-5 w-5 text-red-500" />;
    return <Minus className="h-5 w-5 text-muted-foreground" />;
  };

  const getBiasColor = (bias: string) => {
    if (bias === 'STRONGLY_BULLISH') return 'bg-green-500/20 text-green-400 border-green-500/30';
    if (bias === 'BULLISH') return 'bg-green-500/10 text-green-400 border-green-500/20';
    if (bias === 'STRONGLY_BEARISH') return 'bg-red-500/20 text-red-400 border-red-500/30';
    if (bias === 'BEARISH') return 'bg-red-500/10 text-red-400 border-red-500/20';
    return 'bg-muted text-muted-foreground';
  };

  const formatNumber = (num: number) => {
    if (Math.abs(num) >= 1e9) return `${(num / 1e9).toFixed(1)}B`;
    if (Math.abs(num) >= 1e6) return `${(num / 1e6).toFixed(1)}M`;
    if (Math.abs(num) >= 1e3) return `${(num / 1e3).toFixed(1)}K`;
    return num.toFixed(2);
  };

  return (
    <Card className="col-span-full">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Market Positioning: {underlying}
          </CardTitle>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className={getBiasColor(data.positioning_bias)}>
              {getBiasIcon(data.positioning_bias)}
              <span className="ml-1">{data.positioning_bias.replace('_', ' ')}</span>
            </Badge>
            <span className="text-xs text-muted-foreground">
              {data.confidence}% confidence
            </span>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Put/Call Ratio */}
          <Card className="bg-muted/30">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <BarChart3 className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">Put/Call Ratio</span>
              </div>
              {data.put_call_ratio ? (
                <>
                  <div className="text-2xl font-bold">
                    {data.put_call_ratio.volume_ratio.toFixed(2)}
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <Badge variant="outline" className={
                      data.put_call_ratio.sentiment === 'BULLISH' ? 'text-green-400' :
                      data.put_call_ratio.sentiment === 'BEARISH' ? 'text-red-400' : ''
                    }>
                      {data.put_call_ratio.sentiment}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      OI: {data.put_call_ratio.oi_ratio.toFixed(2)}
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground mt-2">
                    Calls: {formatNumber(data.put_call_ratio.call_volume)} | 
                    Puts: {formatNumber(data.put_call_ratio.put_volume)}
                  </div>
                </>
              ) : (
                <div className="text-muted-foreground text-sm">No data</div>
              )}
            </CardContent>
          </Card>

          {/* Max Pain */}
          <Card className="bg-muted/30">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <Target className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">Max Pain</span>
              </div>
              {data.max_pain ? (
                <>
                  <div className="text-2xl font-bold">
                    ${data.max_pain.max_pain_strike.toFixed(0)}
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <span className={`text-sm ${
                      data.max_pain.distance_percent > 0 ? 'text-green-400' : 
                      data.max_pain.distance_percent < 0 ? 'text-red-400' : ''
                    }`}>
                      {data.max_pain.distance_percent > 0 ? '+' : ''}
                      {data.max_pain.distance_percent.toFixed(1)}%
                    </span>
                    <span className="text-xs text-muted-foreground">
                      from ${data.max_pain.underlying_price.toFixed(2)}
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground mt-2">
                    Magnet: {data.max_pain.magnet_strength}% strength
                  </div>
                </>
              ) : (
                <div className="text-muted-foreground text-sm">No data</div>
              )}
            </CardContent>
          </Card>

          {/* Gamma Exposure */}
          <Card className="bg-muted/30">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <Zap className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">Gamma Exposure</span>
              </div>
              {data.gamma_exposure ? (
                <>
                  <div className="text-2xl font-bold">
                    {formatNumber(data.gamma_exposure.net_gex)}
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <Badge variant="outline" className={
                      data.gamma_exposure.dealer_position === 'LONG_GAMMA' ? 'text-blue-400' :
                      data.gamma_exposure.dealer_position === 'SHORT_GAMMA' ? 'text-orange-400' : ''
                    }>
                      {data.gamma_exposure.dealer_position.replace('_', ' ')}
                    </Badge>
                  </div>
                  <div className="text-xs text-muted-foreground mt-2">
                    Vol: {data.gamma_exposure.volatility_expectation}
                    {data.gamma_exposure.zero_gamma_level && (
                      <> | Flip: ${data.gamma_exposure.zero_gamma_level.toFixed(0)}</>
                    )}
                  </div>
                </>
              ) : (
                <div className="text-muted-foreground text-sm">No data</div>
              )}
            </CardContent>
          </Card>

          {/* Options Flow */}
          <Card className="bg-muted/30">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <Activity className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">Recent Flow</span>
              </div>
              {data.recent_flow.length > 0 ? (
                <>
                  <div className="text-2xl font-bold">
                    {data.recent_flow.length} alerts
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs">
                      <span className="text-green-400">
                        {data.recent_flow.filter(f => f.sentiment === 'BULLISH').length} bullish
                      </span>
                      {' | '}
                      <span className="text-red-400">
                        {data.recent_flow.filter(f => f.sentiment === 'BEARISH').length} bearish
                      </span>
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground mt-2">
                    {data.recent_flow.filter(f => f.is_golden_sweep).length} golden sweeps
                  </div>
                </>
              ) : (
                <div className="text-muted-foreground text-sm">
                  No recent flow
                  {!data.available_sources.includes('unusual_whales') && (
                    <div className="text-xs mt-1">API key not configured</div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Insights */}
        {data.insights.length > 0 && (
          <div className="mt-4 pt-4 border-t border-border">
            <h4 className="text-sm font-medium mb-2">Key Insights</h4>
            <ul className="space-y-1">
              {data.insights.map((insight, i) => (
                <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                  <span className="text-primary">•</span>
                  {insight}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Warnings */}
        {data.warnings.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {data.warnings.map((warning, i) => (
              <Badge key={i} variant="outline" className="text-yellow-500 border-yellow-500/30">
                <AlertTriangle className="h-3 w-3 mr-1" />
                {warning}
              </Badge>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
