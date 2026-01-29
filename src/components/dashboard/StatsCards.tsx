import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { 
  Radio, 
  FileText, 
  TrendingUp, 
  Briefcase,
  AlertTriangle 
} from "lucide-react";
import { useStats } from "@/hooks/useSystemData";

interface StatCardProps {
  title: string;
  value: number | string;
  subtitle?: string;
  icon: React.ReactNode;
  trend?: "up" | "down" | "neutral";
  trendValue?: string;
}

function StatCard({ title, value, subtitle, icon, trend, trendValue }: StatCardProps) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
        <div className="text-muted-foreground">{icon}</div>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold font-mono-trading">{value}</div>
        {subtitle && (
          <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>
        )}
        {trendValue && (
          <p className={`text-xs mt-1 ${
            trend === "up" ? "text-success" : 
            trend === "down" ? "text-destructive" : 
            "text-muted-foreground"
          }`}>
            {trendValue}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

export function StatsCards() {
  const { data: stats, isLoading } = useStats();

  if (isLoading || !stats) {
    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        {[...Array(5)].map((_, i) => (
          <Card key={i}>
            <CardHeader className="pb-2">
              <div className="h-4 w-20 bg-muted rounded animate-pulse" />
            </CardHeader>
            <CardContent>
              <div className="h-8 w-16 bg-muted rounded animate-pulse" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
      <StatCard
        title="Signals"
        value={stats.signals.total}
        subtitle={`${stats.signals.completed} completed, ${stats.signals.pending} pending`}
        icon={<Radio className="h-4 w-4" />}
      />
      <StatCard
        title="Orders"
        value={stats.orders.total}
        subtitle={`${stats.orders.filled} filled, ${stats.orders.pending} pending`}
        icon={<FileText className="h-4 w-4" />}
      />
      <StatCard
        title="Trades"
        value={stats.trades.total}
        subtitle={`${stats.orders.paper} paper, ${stats.orders.live} live`}
        icon={<TrendingUp className="h-4 w-4" />}
      />
      <StatCard
        title="Positions"
        value={stats.positions.open}
        subtitle={`${stats.positions.closed} closed`}
        icon={<Briefcase className="h-4 w-4" />}
      />
      <StatCard
        title="Risk Violations"
        value={stats.risk_violations.total}
        subtitle={`${stats.risk_violations.critical} critical`}
        icon={<AlertTriangle className="h-4 w-4" />}
        trend={stats.risk_violations.critical > 0 ? "down" : "neutral"}
      />
    </div>
  );
}
