import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BarChart3 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { POLLING_INTERVALS } from "@/lib/polling";
import apiClient from "@/lib/api-client";
import { Progress } from "@/components/ui/progress";

// Source weights from confluence-engine.ts (for display)
const SOURCE_WEIGHTS: Record<string, number> = {
  strat_engine_v6: 1.4,
  orb_bhch_stretch: 1.3,
  mtf_trend_dots: 1.2,
  orb_bhch_orb: 1.0,
  saty_phase: 0.8,
  orb_bhch_bhch: 0.4,
};

interface SourceStats {
  source: string;
  total: number;
  completed: number;
  rejected: number;
  acceptanceRate: number;
  weight: number;
}

async function fetchSourceStats(): Promise<SourceStats[]> {
  const { data: result, error } = await apiClient.getSignals({ limit: 1000 });
  if (error || !result) throw error || new Error('Failed to fetch signals');
  const data = (result as any).signals || result || [];

  // Group by source
  const sourceMap = new Map<string, { total: number; completed: number; rejected: number }>();
  
  data.forEach((signal: any) => {
    const stats = sourceMap.get(signal.source) || { total: 0, completed: 0, rejected: 0 };
    stats.total++;
    if (signal.validation_result?.valid === true) stats.completed++;
    if (signal.validation_result?.valid === false) stats.rejected++;
    sourceMap.set(signal.source, stats);
  });

  // Convert to array with acceptance rates
  return Array.from(sourceMap.entries())
    .map(([source, stats]) => ({
      source,
      ...stats,
      acceptanceRate: stats.total > 0 ? (stats.completed / stats.total) * 100 : 0,
      weight: SOURCE_WEIGHTS[source] || 1.0,
    }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 6);
}

export function SourcePerformancePanel() {
  const { data: sources, isLoading } = useQuery({
    queryKey: ["source-performance"],
    queryFn: fetchSourceStats,
    refetchInterval: POLLING_INTERVALS.sourcePerformance,
  });

  return (
    <Card className="h-full">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-primary" />
          Source Performance
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading ? (
          <div className="space-y-3">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-10 bg-muted rounded animate-pulse" />
            ))}
          </div>
        ) : (
          sources?.map((source) => {
            // Shorten source names for display
            const displayName = source.source
              .replace("strat_engine_", "")
              .replace("orb_bhch_", "")
              .replace("_", " ");
            
            return (
              <div key={source.source} className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium capitalize truncate">
                    {displayName}
                  </span>
                  <div className="flex items-center gap-2">
                    <Badge 
                      variant="outline" 
                      className={
                        source.weight >= 1.2 
                          ? "text-success border-success/30 text-xs" 
                          : source.weight <= 0.6 
                          ? "text-destructive border-destructive/30 text-xs"
                          : "text-xs"
                      }
                    >
                      {source.weight}x
                    </Badge>
                    <span className="text-muted-foreground w-12 text-right">
                      {source.acceptanceRate.toFixed(0)}%
                    </span>
                  </div>
                </div>
                <Progress 
                  value={source.acceptanceRate} 
                  className="h-1.5"
                />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>{source.total} signals</span>
                  <span>{source.completed} accepted</span>
                </div>
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}
