import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { POLLING_INTERVALS } from "@/lib/polling";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  TrendingUp,
  TrendingDown,
  Minus,
  RefreshCw,
  Layers,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Search,
} from "lucide-react";
import { fetchMtfComparison, MtfComparisonResult } from "@/lib/api/mtf";

interface BiasIndicatorProps {
  bias: "LONG" | "SHORT" | "NEUTRAL";
  label: string;
}

function BiasIndicator({ bias, label }: BiasIndicatorProps) {
  const config = {
    LONG: {
      icon: TrendingUp,
      color: "text-success",
      bg: "bg-success/10",
      border: "border-success/30",
    },
    SHORT: {
      icon: TrendingDown,
      color: "text-destructive",
      bg: "bg-destructive/10",
      border: "border-destructive/30",
    },
    NEUTRAL: {
      icon: Minus,
      color: "text-muted-foreground",
      bg: "bg-muted",
      border: "border-border",
    },
  };

  const { icon: Icon, color, bg, border } = config[bias];

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            className={`flex flex-col items-center gap-1 p-2 rounded-lg border ${bg} ${border}`}
          >
            <Icon className={`h-5 w-5 ${color}`} />
            <span className="text-xs font-medium text-muted-foreground">
              {label}
            </span>
            <span className={`text-xs font-mono-trading font-bold ${color}`}>
              {bias}
            </span>
          </div>
        </TooltipTrigger>
        <TooltipContent>
          <p>
            {label} timeframe bias: {bias}
          </p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

interface ModeResultCardProps {
  mode: "STRICT" | "WEIGHTED";
  result: {
    approved: boolean;
    reason: string;
    adjustedQuantity: number;
    positionMultiplier: number;
  };
}

function ModeResultCard({ mode, result }: ModeResultCardProps) {
  return (
    <div
      className={`p-3 rounded-lg border ${
        result.approved
          ? "bg-success/5 border-success/30"
          : "bg-destructive/5 border-destructive/30"
      }`}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Badge variant={mode === "STRICT" ? "destructive" : "secondary"}>
            {mode}
          </Badge>
          {result.approved ? (
            <CheckCircle2 className="h-4 w-4 text-success" />
          ) : (
            <XCircle className="h-4 w-4 text-destructive" />
          )}
        </div>
        <span
          className={`text-sm font-bold ${
            result.approved ? "text-success" : "text-destructive"
          }`}
        >
          {result.approved ? "APPROVED" : "REJECTED"}
        </span>
      </div>
      <div className="space-y-1 text-xs">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Position Multiplier:</span>
          <span className="font-mono-trading font-medium">
            {result.positionMultiplier.toFixed(2)}x
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Adjusted Qty:</span>
          <span className="font-mono-trading font-medium">
            {result.adjustedQuantity}
          </span>
        </div>
        <p className="text-muted-foreground mt-1 break-words">{result.reason}</p>
      </div>
    </div>
  );
}

function RecommendationBadge({ recommendation }: { recommendation: string }) {
  const config: Record<
    string,
    { variant: "default" | "secondary" | "destructive" | "outline"; className?: string }
  > = {
    STRONG_LONG: { variant: "default", className: "bg-success hover:bg-success/90" },
    LONG: { variant: "default", className: "bg-success/80 hover:bg-success/70" },
    WEAK_LONG: { variant: "secondary", className: "text-success" },
    NO_TRADE: { variant: "outline" },
    WEAK_SHORT: { variant: "secondary", className: "text-destructive" },
    SHORT: { variant: "destructive", className: "bg-destructive/80" },
    STRONG_SHORT: { variant: "destructive" },
  };

  const { variant, className } = config[recommendation] || { variant: "outline" };

  return (
    <Badge variant={variant} className={className}>
      {recommendation}
    </Badge>
  );
}

export function MtfAlignmentPanel() {
  const [ticker, setTicker] = useState("SPY");
  const [searchTicker, setSearchTicker] = useState("SPY");

  const {
    data,
    isLoading,
    error,
    refetch,
    isFetching,
  } = useQuery<MtfComparisonResult>({
    queryKey: ["mtf-comparison", ticker],
    queryFn: () => fetchMtfComparison(ticker),
    refetchInterval: POLLING_INTERVALS.mtfAlignment,
  });

  const handleSearch = () => {
    setTicker(searchTicker.toUpperCase());
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleSearch();
    }
  };

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Layers className="h-5 w-5" />
            MTF Alignment Status
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-4 w-4" />
            <span>Failed to load MTF analysis</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Layers className="h-5 w-5" />
            MTF Alignment Status
          </CardTitle>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1">
              <Input
                value={searchTicker}
                onChange={(e) => setSearchTicker(e.target.value.toUpperCase())}
                onKeyDown={handleKeyPress}
                placeholder="Ticker"
                className="w-20 h-8 text-xs font-mono-trading"
              />
              <Button
                variant="outline"
                size="sm"
                onClick={handleSearch}
                className="h-8"
              >
                <Search className="h-3 w-3" />
              </Button>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => refetch()}
              disabled={isFetching}
            >
              <RefreshCw
                className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`}
              />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <div className="space-y-4">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : data ? (
          <>
            {/* Header with ticker and recommendation */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="text-2xl font-bold font-mono-trading">
                  {data.ticker}
                </span>
                <RecommendationBadge
                  recommendation={data.analysis.recommendation}
                />
              </div>
              <div className="text-right">
                <div className="text-sm text-muted-foreground">
                  Alignment Score
                </div>
                <div
                  className={`text-2xl font-bold font-mono-trading ${
                    data.analysis.alignment.score >= 70
                      ? "text-success"
                      : data.analysis.alignment.score >= 50
                      ? "text-warning"
                      : "text-destructive"
                  }`}
                >
                  {data.analysis.alignment.score.toFixed(1)}%
                </div>
              </div>
            </div>

            {/* Timeframe Bias Indicators */}
            <div className="grid grid-cols-4 gap-2">
              <BiasIndicator
                bias={data.analysis.timeframeBias.weekly}
                label="Weekly"
              />
              <BiasIndicator
                bias={data.analysis.timeframeBias.daily}
                label="Daily"
              />
              <BiasIndicator
                bias={data.analysis.timeframeBias.fourHour}
                label="4H"
              />
              <BiasIndicator
                bias={data.analysis.timeframeBias.entry}
                label="Entry"
              />
            </div>

            {/* Alignment info */}
            <div className="flex items-center gap-4 text-sm">
              <div className="flex items-center gap-1">
                {data.analysis.alignment.isAligned ? (
                  <CheckCircle2 className="h-4 w-4 text-success" />
                ) : (
                  <XCircle className="h-4 w-4 text-destructive" />
                )}
                <span>
                  {data.analysis.alignment.isAligned
                    ? "Aligned"
                    : "Not Aligned"}
                </span>
              </div>
              <div className="text-muted-foreground">
                Confluence: {data.analysis.alignment.confluenceCount} TF
              </div>
              <div className="text-muted-foreground">
                Signals: {data.analysis.signals.total}
              </div>
              <Badge variant="outline" className="text-xs">
                {data.analysis.riskLevel} RISK
              </Badge>
            </div>

            {/* Mode Comparison */}
            <div className="grid grid-cols-2 gap-3">
              <ModeResultCard mode="STRICT" result={data.strictResult} />
              <ModeResultCard mode="WEIGHTED" result={data.weightedResult} />
            </div>

            {/* Entry Signals Table */}
            {data.analysis.signals.entryDetails.length > 0 && (
              <div>
                <h4 className="text-sm font-medium mb-2">Recent Entry Signals</h4>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Source</TableHead>
                      <TableHead className="text-xs">TF</TableHead>
                      <TableHead className="text-xs">Direction</TableHead>
                      <TableHead className="text-xs">Confidence</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.analysis.signals.entryDetails.slice(0, 5).map((signal, i) => (
                      <TableRow key={i}>
                        <TableCell className="text-xs font-mono-trading">
                          {signal.source}
                        </TableCell>
                        <TableCell className="text-xs">{signal.timeframe}</TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              signal.direction === "LONG"
                                ? "default"
                                : signal.direction === "SHORT"
                                ? "destructive"
                                : "outline"
                            }
                            className={
                              signal.direction === "LONG"
                                ? "bg-success/80 text-xs"
                                : "text-xs"
                            }
                          >
                            {signal.direction}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs font-mono-trading">
                          {(signal.confidence * 100).toFixed(0)}%
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}

            {/* Reasons if not aligned */}
            {!data.analysis.alignment.isAligned &&
              data.analysis.alignment.reasons.length > 0 && (
                <div className="text-xs text-muted-foreground">
                  <span className="font-medium">Reasons: </span>
                  {data.analysis.alignment.reasons.join(" • ")}
                </div>
              )}
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}
