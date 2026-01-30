import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import apiClient from "@/lib/api-client";

export interface ExitRulesConfig {
  id?: string;
  mode: string;
  is_active: boolean;
  profit_target_percent: number | null;
  stop_loss_percent: number | null;
  trailing_stop_percent: number | null;
  min_days_to_expiration: number | null;
  max_days_in_trade: number | null;
  delta_exit_threshold: number | null;
  theta_decay_threshold: number | null;
  iv_crush_threshold: number | null;
}

const DEFAULT_CONFIG: ExitRulesConfig = {
  mode: "PAPER",
  is_active: true,
  profit_target_percent: 50,
  stop_loss_percent: 75,
  trailing_stop_percent: 25,
  min_days_to_expiration: 5,
  max_days_in_trade: 14,
  delta_exit_threshold: 0.82,
  theta_decay_threshold: 0.04,
  iv_crush_threshold: 0.20,
};

async function fetchExitRules(mode: string): Promise<ExitRulesConfig> {
  try {
    const { data, error } = await apiClient.getExitRules(mode);
    if (error) {
      console.warn('Exit rules endpoint not available, using defaults');
      return { ...DEFAULT_CONFIG, mode };
    }
    return (data?.rules as ExitRulesConfig) || { ...DEFAULT_CONFIG, mode };
  } catch (error) {
    console.warn('Failed to fetch exit rules, using defaults:', error);
    return { ...DEFAULT_CONFIG, mode };
  }
}

async function updateExitRules(config: ExitRulesConfig): Promise<void> {
  try {
    const { error } = await apiClient.updateExitRules(config.mode, config);
    if (error) throw error;
  } catch (error) {
    console.warn('Exit rules update not available:', error);
    throw error;
  }
}

export function useExitRules(mode: string = "PAPER") {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["exit-rules", mode],
    queryFn: () => fetchExitRules(mode),
    staleTime: 30000,
  });

  const mutation = useMutation({
    mutationFn: updateExitRules,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["exit-rules", mode] });
      toast.success("Exit rules saved successfully");
    },
    onError: (error) => {
      toast.error(`Failed to save exit rules: ${error.message}`);
    },
  });

  return {
    config: query.data ?? { ...DEFAULT_CONFIG, mode },
    isLoading: query.isLoading,
    isError: query.isError,
    save: mutation.mutate,
    isSaving: mutation.isPending,
  };
}
