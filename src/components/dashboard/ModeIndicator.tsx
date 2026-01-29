import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Shield } from "lucide-react";

interface ModeIndicatorProps {
  mode: "PAPER" | "LIVE";
  liveTradingEnabled?: boolean;
}

export function ModeIndicator({ mode, liveTradingEnabled = false }: ModeIndicatorProps) {
  const isPaper = mode === "PAPER";

  return (
    <Badge
      variant="outline"
      className={`
        flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold
        ${isPaper 
          ? "border-purple-500/50 bg-purple-500/10 text-purple-400" 
          : "border-red-500/50 bg-red-500/10 text-red-400 animate-pulse"
        }
      `}
    >
      {isPaper ? (
        <>
          <Shield className="h-3.5 w-3.5" />
          PAPER MODE
        </>
      ) : (
        <>
          <AlertTriangle className="h-3.5 w-3.5" />
          LIVE MODE {liveTradingEnabled && "- ACTIVE"}
        </>
      )}
    </Badge>
  );
}
