import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import apiClient from "@/lib/api-client";

interface RiskLimits {
  id: string;
  mode: string;
  auto_close_enabled: boolean | null;
  is_active: boolean | null;
}

async function fetchAutoCloseStatus(mode: string = "PAPER"): Promise<boolean> {
  try {
    const { data, error } = await apiClient.getRiskLimits(mode);
    if (error) {
      console.warn('Risk limits endpoint not available, defaulting to false');
      return false;
    }
    return data?.risk_limits?.auto_close_enabled ?? false;
  } catch (error) {
    console.warn('Failed to fetch auto-close status:', error);
    return false;
  }
}

async function updateAutoCloseStatus(mode: string, enabled: boolean): Promise<void> {
  try {
    const { error } = await apiClient.updateRiskLimits(mode, { auto_close_enabled: enabled });
    if (error) throw error;
  } catch (error) {
    console.warn('Auto-close update not available:', error);
    throw new Error(`Failed to update auto-close: ${error}`);
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
