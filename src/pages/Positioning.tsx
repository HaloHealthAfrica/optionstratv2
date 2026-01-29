import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  Activity, 
  BarChart3, 
  TrendingUp, 
  TrendingDown,
  Minus,
  Target,
  Zap,
  Search,
  RefreshCw,
  AlertTriangle,
} from "lucide-react";
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  ReferenceLine,
  Cell,
  LineChart,
  Line,
  Legend,
  ComposedChart,
  Area
} from "recharts";
import { useMarketPositioning, type MarketPositioning } from "@/hooks/useMarketPositioning";
import { useSignals, usePositions } from "@/hooks/useSystemData";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { MarketContextPanel } from "@/components/dashboard/MarketContextPanel";
import { format, addDays } from "date-fns";

const Positioning = () => {
  const [ticker, setTicker] = useState("SPY");
  const [searchInput, setSearchInput] = useState("SPY");
  
  // Get next Friday for default expiration
  const getNextFriday = () => {
    const today = new Date();
    const daysUntilFriday = (5 - today.getDay() + 7) % 7 || 7;
    return format(addDays(today, daysUntilFriday), 'yyyy-MM-dd');
  };
  
  const [expiration, setExpiration] = useState(getNextFriday());
  
  const { data: positioning, isLoading, error, refetch } = useMarketPositioning(ticker, expiration);
  const { data: signals } = useSignals();
  const { data: positions } = usePositions();

  const handleSearch = () => {
    if (searchInput.trim()) {
      setTicker(searchInput.trim().toUpperCase());
    }
  };

  // Filter signals for the current ticker
  const tickerSignals = signals?.filter(s => s.underlying === ticker) || [];
  const tickerPositions = positions?.positions?.filter(p => p.underlying === ticker && !p.is_closed) || [];

  const getBiasColor = (bias: string) => {
    if (bias === 'STRONGLY_BULLISH') return 'bg-success/20 text-success border-success/30';
    if (bias === 'BULLISH') return 'bg-success/10 text-success border-success/20';
    if (bias === 'STRONGLY_BEARISH') return 'bg-destructive/20 text-destructive border-destructive/30';
    if (bias === 'BEARISH') return 'bg-destructive/10 text-destructive border-destructive/20';
    return 'bg-muted text-muted-foreground';
  };

  const getBiasIcon = (bias: string) => {
    if (bias.includes('BULLISH')) return <TrendingUp className="h-5 w-5" />;
    if (bias.includes('BEARISH')) return <TrendingDown className="h-5 w-5" />;
    return <Minus className="h-5 w-5" />;
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Page Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-primary/10">
              <Zap className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-xl font-bold">Market Positioning</h1>
              <p className="text-xs text-muted-foreground">
                GEX, Max Pain, Context & Options Flow Analysis
              </p>
            </div>
          </div>
        </div>

        {/* Market Context Panel - Always visible */}
        <MarketContextPanel />

        {/* Search & Controls */}
        <Card>
          <CardContent className="py-4">
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-2">
                <Input
                  placeholder="Ticker symbol..."
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value.toUpperCase())}
                  onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                  className="w-32"
                />
                <Input
                  type="date"
                  value={expiration}
                  onChange={(e) => setExpiration(e.target.value)}
                  className="w-40"
                />
                <Button onClick={handleSearch} size="sm">
                  <Search className="h-4 w-4 mr-2" />
                  Analyze
                </Button>
                <Button onClick={() => refetch()} variant="outline" size="sm">
                  <RefreshCw className="h-4 w-4" />
                </Button>
              </div>
              
              {positioning && (
                <div className="flex items-center gap-3 ml-auto">
                  <Badge variant="outline" className={getBiasColor(positioning.positioning_bias)}>
                    {getBiasIcon(positioning.positioning_bias)}
                    <span className="ml-1">{positioning.positioning_bias.replace('_', ' ')}</span>
                  </Badge>
                  <span className="text-sm text-muted-foreground">
                    {positioning.confidence}% confidence
                  </span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {isLoading && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-32" />
            ))}
          </div>
        )}

        {error && (
          <Card className="border-destructive">
            <CardContent className="py-6 text-center">
              <AlertTriangle className="h-8 w-8 text-destructive mx-auto mb-2" />
              <p className="text-destructive">{error instanceof Error ? error.message : 'Failed to load positioning data'}</p>
            </CardContent>
          </Card>
        )}

        {positioning && (
          <>
            {/* Warning banner for data issues */}
            {positioning.warnings?.length > 0 && (
              <Card className="border-warning/50 bg-warning/5">
                <CardContent className="py-3">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="h-5 w-5 text-warning shrink-0 mt-0.5" />
                    <div className="space-y-1">
                      <p className="text-sm font-medium text-warning">Data Provider Issue</p>
                      {positioning.warnings.map((warning, i) => (
                        <p key={i} className="text-xs text-muted-foreground">{warning}</p>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
            
            <Tabs defaultValue="overview" className="space-y-4">
              <TabsList>
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="gex">GEX Analysis</TabsTrigger>
                <TabsTrigger value="maxpain">Max Pain</TabsTrigger>
                <TabsTrigger value="flow">Options Flow</TabsTrigger>
                <TabsTrigger value="signals">Signal Correlation</TabsTrigger>
              </TabsList>

            {/* Overview Tab */}
            <TabsContent value="overview" className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <OverviewCard
                  title="Put/Call Ratio"
                  icon={<BarChart3 className="h-4 w-4" />}
                  data={positioning.put_call_ratio}
                  renderContent={(data) => (
                    <>
                      <div className="text-3xl font-bold">{data.volume_ratio.toFixed(2)}</div>
                      <Badge variant="outline" className={
                        data.sentiment === 'BULLISH' ? 'text-success border-success/30' :
                        data.sentiment === 'BEARISH' ? 'text-destructive border-destructive/30' : ''
                      }>
                        {data.sentiment}
                      </Badge>
                      <div className="text-xs text-muted-foreground mt-2">
                        OI Ratio: {data.oi_ratio.toFixed(2)} | Strength: {data.signal_strength}%
                      </div>
                    </>
                  )}
                />
                
                <OverviewCard
                  title="Max Pain"
                  icon={<Target className="h-4 w-4" />}
                  data={positioning.max_pain}
                  renderContent={(data) => (
                    <>
                      <div className="text-3xl font-bold">${data.max_pain_strike}</div>
                      <div className={`text-sm ${data.distance_percent > 0 ? 'text-success' : data.distance_percent < 0 ? 'text-destructive' : ''}`}>
                        {data.distance_percent > 0 ? '+' : ''}{data.distance_percent.toFixed(1)}% from ${data.underlying_price?.toFixed(2)}
                      </div>
                      <div className="text-xs text-muted-foreground mt-2">
                        Magnet Strength: {data.magnet_strength}%
                      </div>
                    </>
                  )}
                />
                
                <OverviewCard
                  title="Gamma Exposure"
                  icon={<Zap className="h-4 w-4" />}
                  data={positioning.gamma_exposure}
                  renderContent={(data) => (
                    <>
                      <div className="text-3xl font-bold">{formatLargeNumber(data.net_gex)}</div>
                      <Badge variant="outline" className={
                        data.dealer_position === 'LONG_GAMMA' ? 'text-info border-info/30' :
                        data.dealer_position === 'SHORT_GAMMA' ? 'text-warning border-warning/30' : ''
                      }>
                        {data.dealer_position.replace('_', ' ')}
                      </Badge>
                      <div className="text-xs text-muted-foreground mt-2">
                        Volatility: {data.volatility_expectation}
                      </div>
                    </>
                  )}
                />
                
                <Card className="bg-muted/30">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <Activity className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm font-medium">Options Flow</span>
                    </div>
                    {positioning.recent_flow.length > 0 ? (
                      <>
                        <div className="text-3xl font-bold">{positioning.recent_flow.length}</div>
                        <div className="text-sm">
                          <span className="text-success">
                            {positioning.recent_flow.filter(f => f.sentiment === 'BULLISH').length} bullish
                          </span>
                          {' / '}
                          <span className="text-destructive">
                            {positioning.recent_flow.filter(f => f.sentiment === 'BEARISH').length} bearish
                          </span>
                        </div>
                      </>
                    ) : (
                      <div className="text-muted-foreground text-sm">
                        No flow data available
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* Insights */}
              {positioning.insights.length > 0 && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">Key Insights</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-2">
                      {positioning.insights.map((insight, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm">
                          <span className="text-primary mt-1">•</span>
                          <span>{insight}</span>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            {/* GEX Analysis Tab */}
            <TabsContent value="gex" className="space-y-4">
              <GexChart positioning={positioning} />
            </TabsContent>

            {/* Max Pain Tab */}
            <TabsContent value="maxpain" className="space-y-4">
              <MaxPainChart positioning={positioning} />
            </TabsContent>

            {/* Options Flow Tab */}
            <TabsContent value="flow" className="space-y-4">
              <FlowTable positioning={positioning} />
            </TabsContent>

            {/* Signal Correlation Tab */}
            <TabsContent value="signals" className="space-y-4">
              <SignalCorrelation 
                positioning={positioning} 
                signals={tickerSignals}
                positions={tickerPositions}
              />
            </TabsContent>
          </Tabs>
          </>
        )}
      </div>
    </DashboardLayout>
  );
};

// Helper Components

// Helper Components

function OverviewCard<T>({ 
  title, 
  icon, 
  data, 
  renderContent 
}: { 
  title: string; 
  icon: React.ReactNode; 
  data: T | null;
  renderContent: (data: NonNullable<T>) => React.ReactNode;
}) {
  return (
    <Card className="bg-muted/30">
      <CardContent className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-muted-foreground">{icon}</span>
          <span className="text-sm font-medium">{title}</span>
        </div>
        {data ? renderContent(data as NonNullable<T>) : (
          <div className="text-muted-foreground text-sm">No data available</div>
        )}
      </CardContent>
    </Card>
  );
}

function GexChart({ positioning }: { positioning: MarketPositioning }) {
  const gex = positioning.gamma_exposure;
  
  if (!gex) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <AlertTriangle className="h-8 w-8 text-warning mx-auto mb-3" />
          <p className="text-muted-foreground font-medium">GEX data not available</p>
          <p className="text-xs text-muted-foreground mt-2 max-w-md mx-auto">
            {positioning.warnings?.length > 0 
              ? positioning.warnings[0] 
              : 'Unable to fetch gamma exposure data from market data providers'}
          </p>
        </CardContent>
      </Card>
    );
  }
  
  // Check if we have the detailed data needed for charts
  if (!gex.strikes?.length || !gex.gex_by_strike?.length) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardContent className="p-4 text-center">
              <div className="text-sm text-muted-foreground">Net GEX</div>
              <div className={`text-2xl font-bold ${gex.net_gex > 0 ? 'text-info' : 'text-warning'}`}>
                {formatLargeNumber(gex.net_gex)}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <div className="text-sm text-muted-foreground">Zero Gamma Level</div>
              <div className="text-2xl font-bold">
                {gex.zero_gamma_level ? `$${gex.zero_gamma_level.toFixed(0)}` : 'N/A'}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <div className="text-sm text-muted-foreground">Dealer Position</div>
              <Badge variant="outline" className={`text-lg ${
                gex.dealer_position === 'LONG_GAMMA' ? 'text-info border-info/30' :
                gex.dealer_position === 'SHORT_GAMMA' ? 'text-warning border-warning/30' : ''
              }`}>
                {gex.dealer_position.replace('_', ' ')}
              </Badge>
            </CardContent>
          </Card>
        </div>
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            <BarChart3 className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p>Strike-level GEX chart data not available</p>
            <p className="text-xs mt-1">Summary metrics shown above</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Build chart data from GEX by strike
  const chartData = gex.strikes?.map((strike, i) => ({
    strike,
    gex: gex.gex_by_strike?.[i] || 0,
    isSupport: gex.support_levels?.includes(strike),
    isResistance: gex.resistance_levels?.includes(strike),
  })) || [];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-sm text-muted-foreground">Net GEX</div>
            <div className={`text-2xl font-bold ${gex.net_gex > 0 ? 'text-blue-400' : 'text-orange-400'}`}>
              {formatLargeNumber(gex.net_gex)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-sm text-muted-foreground">Zero Gamma Level</div>
            <div className="text-2xl font-bold">
              {gex.zero_gamma_level ? `$${gex.zero_gamma_level.toFixed(0)}` : 'N/A'}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-sm text-muted-foreground">Dealer Position</div>
            <Badge variant="outline" className={`text-lg ${
              gex.dealer_position === 'LONG_GAMMA' ? 'text-blue-400 border-blue-500/30' :
              gex.dealer_position === 'SHORT_GAMMA' ? 'text-orange-400 border-orange-500/30' : ''
            }`}>
              {gex.dealer_position.replace('_', ' ')}
            </Badge>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">GEX by Strike</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis 
                  dataKey="strike" 
                  tick={{ fontSize: 10 }}
                  tickFormatter={(v) => `$${v}`}
                />
                <YAxis 
                  tick={{ fontSize: 10 }}
                  tickFormatter={(v) => formatLargeNumber(v)}
                />
                <Tooltip 
                  formatter={(value: number) => [formatLargeNumber(value), 'GEX']}
                  labelFormatter={(label) => `Strike: $${label}`}
                  contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }}
                />
                {gex.zero_gamma_level && (
                  <ReferenceLine 
                    x={gex.zero_gamma_level} 
                    stroke="hsl(var(--primary))" 
                    strokeDasharray="5 5"
                    label={{ value: 'Zero GEX', position: 'top', fontSize: 10 }}
                  />
                )}
                <ReferenceLine y={0} stroke="hsl(var(--muted-foreground))" />
                <Bar dataKey="gex">
                  {chartData.map((entry, index) => (
                    <Cell 
                      key={`cell-${index}`}
                      fill={entry.gex > 0 ? 'hsl(var(--chart-1))' : 'hsl(var(--chart-2))'}
                      opacity={entry.isSupport || entry.isResistance ? 1 : 0.7}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="flex justify-center gap-6 mt-4 text-sm">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded bg-[hsl(var(--chart-1))]" />
              <span className="text-muted-foreground">Positive GEX (vol suppression)</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded bg-[hsl(var(--chart-2))]" />
              <span className="text-muted-foreground">Negative GEX (vol amplification)</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Support/Resistance Levels */}
      <div className="grid grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-green-400">Support Levels (Dealers Buy Dips)</CardTitle>
          </CardHeader>
          <CardContent>
            {gex.support_levels?.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {gex.support_levels.map((level) => (
                  <Badge key={level} variant="outline" className="text-green-400 border-green-500/30">
                    ${level}
                  </Badge>
                ))}
              </div>
            ) : (
              <span className="text-muted-foreground text-sm">No significant support levels</span>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-red-400">Resistance Levels (Dealers Sell Rips)</CardTitle>
          </CardHeader>
          <CardContent>
            {gex.resistance_levels?.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {gex.resistance_levels.map((level) => (
                  <Badge key={level} variant="outline" className="text-red-400 border-red-500/30">
                    ${level}
                  </Badge>
                ))}
              </div>
            ) : (
              <span className="text-muted-foreground text-sm">No significant resistance levels</span>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function MaxPainChart({ positioning }: { positioning: MarketPositioning }) {
  const maxPain = positioning.max_pain;
  
  if (!maxPain) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <AlertTriangle className="h-8 w-8 text-warning mx-auto mb-3" />
          <p className="text-muted-foreground font-medium">Max Pain data not available</p>
          <p className="text-xs text-muted-foreground mt-2 max-w-md mx-auto">
            {positioning.warnings?.length > 0 
              ? positioning.warnings[0] 
              : 'Unable to fetch max pain data from market data providers'}
          </p>
        </CardContent>
      </Card>
    );
  }

  const chartData = maxPain.strikes?.map((strike, i) => ({
    strike,
    pain: maxPain.pain_values?.[i] || 0,
    isMaxPain: strike === maxPain.max_pain_strike,
  })) || [];
  
  // Check if we have chart data
  const hasChartData = chartData.length > 0;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-sm text-muted-foreground">Max Pain Strike</div>
            <div className="text-2xl font-bold text-primary">${maxPain.max_pain_strike}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-sm text-muted-foreground">Current Price</div>
            <div className="text-2xl font-bold">${maxPain.underlying_price?.toFixed(2)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-sm text-muted-foreground">Distance</div>
            <div className={`text-2xl font-bold ${maxPain.distance_percent > 0 ? 'text-green-400' : 'text-red-400'}`}>
              {maxPain.distance_percent > 0 ? '+' : ''}{maxPain.distance_percent.toFixed(1)}%
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-sm text-muted-foreground">Magnet Strength</div>
            <div className="text-2xl font-bold">{maxPain.magnet_strength}%</div>
          </CardContent>
        </Card>
      </div>

      {hasChartData ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Pain Distribution by Strike</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis 
                    dataKey="strike" 
                    tick={{ fontSize: 10 }}
                    tickFormatter={(v) => `$${v}`}
                  />
                  <YAxis 
                    tick={{ fontSize: 10 }}
                    tickFormatter={(v) => formatLargeNumber(v)}
                  />
                  <Tooltip 
                    formatter={(value: number) => [`$${formatLargeNumber(value)}`, 'Total Pain']}
                    labelFormatter={(label) => `Strike: $${label}`}
                    contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }}
                  />
                  <ReferenceLine 
                    x={maxPain.max_pain_strike} 
                    stroke="hsl(var(--primary))" 
                    strokeWidth={2}
                    label={{ value: 'MAX PAIN', position: 'top', fontSize: 10, fill: 'hsl(var(--primary))' }}
                  />
                  {maxPain.underlying_price && (
                    <ReferenceLine 
                      x={maxPain.underlying_price} 
                      stroke="hsl(var(--muted-foreground))" 
                      strokeDasharray="5 5"
                      label={{ value: 'Current', position: 'bottom', fontSize: 10 }}
                    />
                  )}
                  <Area 
                    type="monotone" 
                    dataKey="pain" 
                    fill="hsl(var(--primary))" 
                    fillOpacity={0.2}
                    stroke="hsl(var(--primary))"
                    strokeWidth={2}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            <Target className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p>Strike-level pain chart data not available</p>
            <p className="text-xs mt-1">Summary metrics shown above</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function FlowTable({ positioning }: { positioning: MarketPositioning }) {
  const flow = positioning.recent_flow;

  if (!flow.length) {
    const hasUnusualWhales = positioning.available_sources?.includes('unusual_whales');
    
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <Activity className="h-8 w-8 mx-auto mb-3 text-muted-foreground opacity-50" />
          <p className="text-muted-foreground font-medium">No options flow data available</p>
          {!hasUnusualWhales ? (
            <div className="mt-3 space-y-2">
              <p className="text-xs text-muted-foreground">Flow data requires Unusual Whales API</p>
              <Badge variant="outline" className="text-xs">
                Configure UNUSUAL_WHALES_API_KEY in secrets
              </Badge>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground mt-2">
              No significant flow alerts in the lookback window
            </p>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center justify-between">
          <span>Recent Options Flow</span>
          <Badge variant="outline">{flow.length} alerts</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="text-left py-2 px-2">Time</th>
                <th className="text-left py-2 px-2">Strike</th>
                <th className="text-left py-2 px-2">Type</th>
                <th className="text-left py-2 px-2">Side</th>
                <th className="text-right py-2 px-2">Size</th>
                <th className="text-right py-2 px-2">Premium</th>
                <th className="text-left py-2 px-2">Execution</th>
                <th className="text-left py-2 px-2">Sentiment</th>
              </tr>
            </thead>
            <tbody>
              {flow.map((item) => (
                <tr key={item.id} className="border-b border-muted/50 hover:bg-muted/20">
                  <td className="py-2 px-2 text-muted-foreground">
                    {format(new Date(item.executed_at), 'HH:mm:ss')}
                  </td>
                  <td className="py-2 px-2 font-mono">${item.strike}</td>
                  <td className="py-2 px-2">
                    <Badge variant="outline" className={
                      item.option_type === 'CALL' ? 'text-green-400 border-green-500/30' : 'text-red-400 border-red-500/30'
                    }>
                      {item.option_type}
                    </Badge>
                  </td>
                  <td className="py-2 px-2">{item.side}</td>
                  <td className="py-2 px-2 text-right font-mono">{item.size.toLocaleString()}</td>
                  <td className="py-2 px-2 text-right font-mono">${formatLargeNumber(item.premium)}</td>
                  <td className="py-2 px-2">
                    <Badge variant="outline" className={item.is_golden_sweep ? 'text-yellow-400 border-yellow-500/30' : ''}>
                      {item.is_golden_sweep && '🌟 '}
                      {item.execution_type}
                    </Badge>
                  </td>
                  <td className="py-2 px-2">
                    <Badge variant="outline" className={
                      item.sentiment === 'BULLISH' ? 'text-green-400 border-green-500/30' :
                      item.sentiment === 'BEARISH' ? 'text-red-400 border-red-500/30' : ''
                    }>
                      {item.sentiment}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

function SignalCorrelation({ 
  positioning, 
  signals, 
  positions 
}: { 
  positioning: MarketPositioning;
  signals: any[];
  positions: any[];
}) {
  const getSignalAlignment = (signal: any) => {
    const bias = positioning.positioning_bias;
    const signalDirection = signal.option_type === 'CALL' 
      ? (signal.action === 'BUY' ? 'BULLISH' : 'BEARISH')
      : (signal.action === 'BUY' ? 'BEARISH' : 'BULLISH');
    
    if (bias.includes('BULLISH') && signalDirection === 'BULLISH') return 'ALIGNED';
    if (bias.includes('BEARISH') && signalDirection === 'BEARISH') return 'ALIGNED';
    if (bias === 'NEUTRAL') return 'NEUTRAL';
    return 'CONFLICTING';
  };

  return (
    <div className="space-y-4">
      {/* Current Positions vs Positioning */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Open Positions vs Market Positioning</CardTitle>
        </CardHeader>
        <CardContent>
          {positions.length > 0 ? (
            <div className="space-y-3">
              {positions.map((pos: any) => {
                const posDirection = pos.option_type === 'CALL' ? 'BULLISH' : 'BEARISH';
                const aligned = positioning.positioning_bias.includes(posDirection.slice(0, 4).toUpperCase());
                
                return (
                  <div key={pos.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/30">
                    <div className="flex items-center gap-3">
                      <Badge variant="outline" className={
                        pos.option_type === 'CALL' ? 'text-green-400' : 'text-red-400'
                      }>
                        {pos.option_type}
                      </Badge>
                      <span className="font-mono">${pos.strike}</span>
                      <span className="text-muted-foreground">{pos.quantity} contracts</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className={
                        aligned ? 'text-green-400 border-green-500/30' : 'text-yellow-400 border-yellow-500/30'
                      }>
                        {aligned ? '✓ ALIGNED' : '⚠ CONFLICTING'}
                      </Badge>
                      {positioning.max_pain && (
                        <span className="text-xs text-muted-foreground">
                          {pos.strike > positioning.max_pain.max_pain_strike ? 'Above' : 'Below'} Max Pain
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center text-muted-foreground py-6">
              No open positions for {positioning.underlying}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Recent Signals Analysis */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent Signals Analysis</CardTitle>
        </CardHeader>
        <CardContent>
          {signals.length > 0 ? (
            <div className="space-y-2">
              {signals.slice(0, 10).map((signal: any) => {
                const alignment = getSignalAlignment(signal);
                
                return (
                  <div key={signal.id} className="flex items-center justify-between p-2 rounded bg-muted/20">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">
                        {format(new Date(signal.created_at), 'MM/dd HH:mm')}
                      </span>
                      <Badge variant="outline">{signal.action}</Badge>
                      <Badge variant="outline" className={
                        signal.option_type === 'CALL' ? 'text-green-400' : 'text-red-400'
                      }>
                        {signal.option_type}
                      </Badge>
                      <span className="font-mono text-sm">${signal.strike}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className={
                        signal.status === 'COMPLETED' ? 'text-green-400' :
                        signal.status === 'REJECTED' ? 'text-red-400' : 'text-yellow-400'
                      }>
                        {signal.status}
                      </Badge>
                      <Badge variant="outline" className={
                        alignment === 'ALIGNED' ? 'text-green-400 border-green-500/30' :
                        alignment === 'CONFLICTING' ? 'text-red-400 border-red-500/30' : ''
                      }>
                        {alignment}
                      </Badge>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center text-muted-foreground py-6">
              No recent signals for {positioning.underlying}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Positioning Summary */}
      <Card className="bg-muted/20">
        <CardContent className="p-4">
          <h4 className="font-medium mb-3">Positioning Summary for {positioning.underlying}</h4>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <span className="text-muted-foreground">P/C Ratio:</span>
              <span className="ml-2 font-medium">
                {positioning.put_call_ratio?.volume_ratio.toFixed(2) || 'N/A'}
              </span>
            </div>
            <div>
              <span className="text-muted-foreground">Max Pain:</span>
              <span className="ml-2 font-medium">
                ${positioning.max_pain?.max_pain_strike || 'N/A'}
              </span>
            </div>
            <div>
              <span className="text-muted-foreground">GEX Direction:</span>
              <span className="ml-2 font-medium">
                {positioning.gamma_exposure?.dealer_position.replace('_', ' ') || 'N/A'}
              </span>
            </div>
            <div>
              <span className="text-muted-foreground">Net Bias:</span>
              <Badge variant="outline" className={getBiasColorClass(positioning.positioning_bias)}>
                {positioning.positioning_bias.replace('_', ' ')}
              </Badge>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// Utility functions
function formatLargeNumber(num: number): string {
  if (Math.abs(num) >= 1e9) return `${(num / 1e9).toFixed(1)}B`;
  if (Math.abs(num) >= 1e6) return `${(num / 1e6).toFixed(1)}M`;
  if (Math.abs(num) >= 1e3) return `${(num / 1e3).toFixed(1)}K`;
  return num.toFixed(0);
}

function getBiasColorClass(bias: string): string {
  if (bias.includes('BULLISH')) return 'text-green-400 border-green-500/30';
  if (bias.includes('BEARISH')) return 'text-red-400 border-red-500/30';
  return '';
}

export default Positioning;
