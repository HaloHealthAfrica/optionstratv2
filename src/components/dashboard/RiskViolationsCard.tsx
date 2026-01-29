import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, ShieldAlert } from "lucide-react";
import { useRiskViolations } from "@/hooks/useSystemData";
import { formatDistanceToNow } from "date-fns";

export function RiskViolationsCard() {
  const { data: violations, isLoading } = useRiskViolations();

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldAlert className="h-5 w-5" />
            Risk Violations
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="animate-pulse space-y-2">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-12 bg-muted rounded" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!violations || violations.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldAlert className="h-5 w-5" />
            Risk Violations
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-6">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-success/10 mb-3">
              <ShieldAlert className="h-6 w-6 text-success" />
            </div>
            <p className="text-sm text-muted-foreground">
              No risk violations. All systems operating within limits.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-warning/30">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldAlert className="h-5 w-5 text-warning" />
          Risk Violations ({violations.length})
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {violations.slice(0, 5).map((violation) => (
            <div
              key={violation.id}
              className={`p-3 rounded-lg border ${
                violation.severity === "CRITICAL"
                  ? "border-destructive/50 bg-destructive/5"
                  : "border-warning/50 bg-warning/5"
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <AlertTriangle
                    className={`h-4 w-4 ${
                      violation.severity === "CRITICAL"
                        ? "text-destructive"
                        : "text-warning"
                    }`}
                  />
                  <span className="font-medium text-sm">
                    {violation.violation_type.replace(/_/g, " ")}
                  </span>
                </div>
                <Badge
                  variant={violation.severity === "CRITICAL" ? "destructive" : "secondary"}
                  className="text-xs"
                >
                  {violation.severity}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                {violation.rule_violated}: {violation.current_value?.toFixed(2)} / {violation.limit_value?.toFixed(2)}
              </p>
              <div className="flex items-center justify-between mt-2">
                <span className="text-xs text-muted-foreground">
                  {formatDistanceToNow(new Date(violation.created_at), { addSuffix: true })}
                </span>
                {violation.action_taken && (
                  <Badge variant="outline" className="text-xs">
                    {violation.action_taken}
                  </Badge>
                )}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
