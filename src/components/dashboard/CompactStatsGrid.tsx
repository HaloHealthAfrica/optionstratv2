import { useStats } from "@/hooks/useSystemData";
import { Radio, FileText, TrendingUp, Briefcase, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

interface StatItemProps {
  label: string;
  value: number | string;
  subValue?: string;
  icon: React.ReactNode;
  variant?: "default" | "success" | "warning" | "danger";
}

function StatItem({ label, value, subValue, icon, variant = "default" }: StatItemProps) {
  return (
    <div className="flex items-center gap-3 p-3 rounded-lg bg-card border border-border">
      <div className={cn(
        "flex items-center justify-center w-9 h-9 rounded-lg",
        variant === "success" && "bg-success/10 text-success",
        variant === "warning" && "bg-warning/10 text-warning",
        variant === "danger" && "bg-destructive/10 text-destructive",
        variant === "default" && "bg-muted text-muted-foreground"
      )}>
        {icon}
      </div>
      <div className="min-w-0">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="text-lg font-bold font-mono-trading leading-tight">{value}</div>
        {subValue && (
          <div className="text-xs text-muted-foreground truncate">{subValue}</div>
        )}
      </div>
    </div>
  );
}

export function CompactStatsGrid() {
  const { data: stats, isLoading } = useStats();

  if (isLoading || !stats) {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="h-20 bg-card border border-border rounded-lg animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
      <StatItem
        label="Signals"
        value={stats.signals.total}
        subValue={`${stats.signals.completed} completed`}
        icon={<Radio className="h-4 w-4" />}
        variant="default"
      />
      <StatItem
        label="Orders"
        value={stats.orders.total}
        subValue={`${stats.orders.filled} filled`}
        icon={<FileText className="h-4 w-4" />}
        variant="default"
      />
      <StatItem
        label="Trades"
        value={stats.trades.total}
        subValue={`${stats.orders.paper} paper`}
        icon={<TrendingUp className="h-4 w-4" />}
        variant="success"
      />
      <StatItem
        label="Positions"
        value={stats.positions.open}
        subValue={`${stats.positions.closed} closed`}
        icon={<Briefcase className="h-4 w-4" />}
        variant="default"
      />
      <StatItem
        label="Violations"
        value={stats.risk_violations.total}
        subValue={`${stats.risk_violations.critical} critical`}
        icon={<AlertTriangle className="h-4 w-4" />}
        variant={stats.risk_violations.critical > 0 ? "danger" : "warning"}
      />
    </div>
  );
}
