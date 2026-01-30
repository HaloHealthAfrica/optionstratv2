import apiClient from "@/lib/api-client";

export interface MtfTimeframeBias {
  weekly: "LONG" | "SHORT" | "NEUTRAL";
  daily: "LONG" | "SHORT" | "NEUTRAL";
  fourHour: "LONG" | "SHORT" | "NEUTRAL";
  entry: "LONG" | "SHORT" | "NEUTRAL";
}

export interface MtfAnalysisResponse {
  ticker: string;
  recommendation: string;
  confidence: number;
  riskLevel: "LOW" | "MEDIUM" | "HIGH" | "EXTREME";
  positionSizeMultiplier: number;
  timeframeBias: MtfTimeframeBias;
  alignment: {
    isAligned: boolean;
    score: number;
    confluenceCount: number;
    reasons: string[];
  };
  signals: {
    total: number;
    entry: number;
    confirmation: number;
    entryDetails: Array<{
      source: string;
      timeframe: string;
      direction: string;
      confidence: number;
      timestamp: string;
    }>;
    confirmationDetails: Array<{
      source: string;
      timeframe: string;
      direction: string;
      confidence: number;
      timestamp: string;
    }>;
  };
  primaryEntrySignal: {
    source: string;
    timeframe: string;
    direction: string;
    confidence: number;
    price?: number;
    tradeLevels?: {
      entry?: number;
      stopLoss?: number;
      target1?: number;
      target2?: number;
    };
  } | null;
}

export interface MtfModeResult {
  approved: boolean;
  reason: string;
  adjustedQuantity: number;
  positionMultiplier: number;
}

export interface MtfComparisonResult {
  ticker: string;
  analysis: MtfAnalysisResponse;
  strictResult: MtfModeResult;
  weightedResult: MtfModeResult;
}

async function callEdgeFunction<T>(functionName: string, params?: Record<string, string>): Promise<T> {
  const query = params ? `?${new URLSearchParams(params).toString()}` : "";
  const { data, error } = await apiClient.request<T>(`/${functionName}${query}`, { method: "GET" });
  if (error || !data) throw error || new Error("API error");
  return data;
}

export async function fetchMtfAnalysis(ticker: string, lookback = 24): Promise<MtfAnalysisResponse> {
  return callEdgeFunction<MtfAnalysisResponse>("mtf-analysis", { 
    ticker, 
    lookback: lookback.toString() 
  });
}

export async function fetchMtfComparison(ticker: string): Promise<MtfComparisonResult> {
  return callEdgeFunction<MtfComparisonResult>("mtf-comparison", { ticker });
}
