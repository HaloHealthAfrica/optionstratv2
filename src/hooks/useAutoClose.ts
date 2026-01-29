import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface RiskLimits {
  id: string;
  mode: string;
  auto_close_enabled: boolean | null;
  is_active: boolean | null;
}

async function fetchAutoCloseStatus(mode: string = "PAPER"): Promise<boolean> {
  const { data, error } = await supabase
    .from("risk_limits")
    .select("auto_close_enabled")
    .eq("mode", mode)
    .eq("is_active", true)
    .maybeSingle();

  if (error) {
    console.error("Failed to fetch auto-close status:", error);
    return false;
  }

  return data?.auto_close_enabled ?? false;
}

async function updateAutoCloseStatus(mode: string, enabled: boolean): Promise<void> {
  const { error } = await supabase
    .from("risk_limits")
    .update({ auto_close_enabled: enabled })
    .eq("mode", mode)
    .eq("is_active", true);

  if (error) {
    throw new Error(`Failed to update auto-close: ${error.message}`);
  }
}

export function useAutoClose(mode: string = "PAPER") {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["auto-close-status", mode],
    queryFn: () => fetchAutoCloseStatus(mode),
    staleTime: 30000,
  });

  const mutation = useMutation({
    mutationFn: (enabled: boolean) => updateAutoCloseStatus(mode, enabled),
    onSuccess: (_, enabled) => {
      queryClient.invalidateQueries({ queryKey: ["auto-close-status", mode] });
      toast.success(
        enabled 
          ? "Auto-close enabled - positions will close automatically when exit rules trigger" 
          : "Auto-close disabled - positions require manual closing"
      );
    },
    onError: (error) => {
      toast.error(`Failed to update auto-close: ${error.message}`);
    },
  });

  return {
    isEnabled: query.data ?? false,
    isLoading: query.isLoading,
    toggle: () => mutation.mutate(!query.data),
    setEnabled: mutation.mutate,
    isSaving: mutation.isPending,
  };
}
