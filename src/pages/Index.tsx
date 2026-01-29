import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { CompactStatsGrid } from "@/components/dashboard/CompactStatsGrid";
import { PositionsTable } from "@/components/dashboard/PositionsTable";
import { SignalsTable } from "@/components/dashboard/SignalsTable";
import { RiskViolationsCard } from "@/components/dashboard/RiskViolationsCard";
import { ExitSignalsPanel } from "@/components/dashboard/ExitSignalsPanel";
import { PerformanceCharts } from "@/components/dashboard/PerformanceCharts";
import { MtfAlignmentPanel } from "@/components/dashboard/MtfAlignmentPanel";
import { HealthStatus } from "@/components/dashboard/HealthStatus";
import { SignalQueuePanel } from "@/components/dashboard/SignalQueuePanel";
import { SourcePerformancePanel } from "@/components/dashboard/SourcePerformancePanel";
import { toast } from "sonner";
import { useEffect } from "react";
import { useDashboardRealtime } from "@/hooks/useRealtimeSubscriptions";

const Index = () => {
  const { isConnected } = useDashboardRealtime();

  useEffect(() => {
    if (isConnected) {
      toast.success("Real-time updates connected", { duration: 2000 });
    }
  }, [isConnected]);

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        {/* Stats Overview */}
        <CompactStatsGrid />

        {/* Exit Signals - Priority Alert Panel */}
        <ExitSignalsPanel />

        {/* Signal Queue + Source Performance Row */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <SignalQueuePanel />
          <SourcePerformancePanel />
          <HealthStatus />
        </div>

        {/* Performance Charts */}
        <PerformanceCharts />

        {/* MTF Alignment Panel */}
        <MtfAlignmentPanel />

        {/* Risk Violations */}
        <RiskViolationsCard />

        {/* Positions */}
        <PositionsTable />

        {/* Signals */}
        <SignalsTable />
      </div>
    </DashboardLayout>
  );
};

export default Index;
