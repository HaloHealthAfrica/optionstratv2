import { useQuery } from "@tanstack/react-query";
import {
  fetchStats,
  fetchHealth,
  fetchPositions,
  fetchSignals,
  fetchOrders,
  fetchRiskViolations,
} from "@/lib/api";

export function useStats() {
  return useQuery({
    queryKey: ["stats"],
    queryFn: fetchStats,
    refetchInterval: 5000,
  });
}

export function useHealth() {
  return useQuery({
    queryKey: ["health"],
    queryFn: fetchHealth,
    refetchInterval: 10000,
  });
}

export function usePositions(showClosed = false) {
  return useQuery({
    queryKey: ["positions", showClosed],
    queryFn: () => fetchPositions(showClosed),
    refetchInterval: 5000,
  });
}

export function useSignals() {
  return useQuery({
    queryKey: ["signals"],
    queryFn: fetchSignals,
    refetchInterval: 5000,
  });
}

export function useOrders() {
  return useQuery({
    queryKey: ["orders"],
    queryFn: fetchOrders,
    refetchInterval: 5000,
  });
}

export function useRiskViolations() {
  return useQuery({
    queryKey: ["riskViolations"],
    queryFn: fetchRiskViolations,
    refetchInterval: 10000,
  });
}
