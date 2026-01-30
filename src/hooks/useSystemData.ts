import { useQuery } from "@tanstack/react-query";
import {
  fetchStats,
  fetchHealth,
  fetchPositions,
  fetchSignals,
  fetchOrders,
  fetchRiskViolations,
} from "@/lib/api";
import { POLLING_INTERVALS } from "@/lib/polling";

export function useStats() {
  return useQuery({
    queryKey: ["stats"],
    queryFn: fetchStats,
    refetchInterval: POLLING_INTERVALS.systemStats,
  });
}

export function useHealth() {
  return useQuery({
    queryKey: ["health"],
    queryFn: fetchHealth,
    refetchInterval: POLLING_INTERVALS.systemHealth,
  });
}

export function usePositions(showClosed = false) {
  return useQuery({
    queryKey: ["positions", showClosed],
    queryFn: () => fetchPositions(showClosed),
    refetchInterval: POLLING_INTERVALS.positions,
  });
}

export function useSignals() {
  return useQuery({
    queryKey: ["signals"],
    queryFn: fetchSignals,
    refetchInterval: POLLING_INTERVALS.signals,
  });
}

export function useOrders() {
  return useQuery({
    queryKey: ["orders"],
    queryFn: fetchOrders,
    refetchInterval: POLLING_INTERVALS.orders,
  });
}

export function useRiskViolations() {
  return useQuery({
    queryKey: ["riskViolations"],
    queryFn: fetchRiskViolations,
    refetchInterval: POLLING_INTERVALS.riskViolations,
  });
}
