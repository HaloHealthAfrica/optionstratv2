import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

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
  const { data, error } = await supabase
    .from("exit_rules")
    .select("*")
    .eq("mode", mode)
    .eq("is_active", true)
    .maybeSingle();

  if (error) {
    console.error("Failed to fetch exit rules:", error);
    throw error;
  }

  if (!data) {
    return { ...DEFAULT_CONFIG, mode };
  }

  return data as ExitRulesConfig;
}

async function updateExitRules(config: ExitRulesConfig): Promise<void> {
  const { id, ...updateData } = config;
  
  if (id) {
    // Update existing record
    const { error } = await supabase
      .from("exit_rules")
      .update({
        profit_target_percent: updateData.profit_target_percent,
        stop_loss_percent: updateData.stop_loss_percent,
        trailing_stop_percent: updateData.trailing_stop_percent,
        min_days_to_expiration: updateData.min_days_to_expiration,
        max_days_in_trade: updateData.max_days_in_trade,
        delta_exit_threshold: updateData.delta_exit_threshold,
        theta_decay_threshold: updateData.theta_decay_threshold,
        iv_crush_threshold: updateData.iv_crush_threshold,
      })
      .eq("id", id);

    if (error) throw error;
  } else {
    // Insert new record (upsert based on mode)
    const { error } = await supabase
      .from("exit_rules")
      .upsert({
        mode: updateData.mode,
        is_active: true,
        profit_target_percent: updateData.profit_target_percent,
        stop_loss_percent: updateData.stop_loss_percent,
        trailing_stop_percent: updateData.trailing_stop_percent,
        min_days_to_expiration: updateData.min_days_to_expiration,
        max_days_in_trade: updateData.max_days_in_trade,
        delta_exit_threshold: updateData.delta_exit_threshold,
        theta_decay_threshold: updateData.theta_decay_threshold,
        iv_crush_threshold: updateData.iv_crush_threshold,
      }, {
        onConflict: "mode,is_active",
      });

    if (error) throw error;
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
