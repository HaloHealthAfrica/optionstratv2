import { supabase } from "@/integrations/supabase/client";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

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
  const url = new URL(`${SUPABASE_URL}/functions/v1/${functionName}`);
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      url.searchParams.append(key, value);
    });
  }

  const { data: { session } } = await supabase.auth.getSession();
  
  const response = await fetch(url.toString(), {
    headers: {
      "Content-Type": "application/json",
      "apikey": import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
      ...(session?.access_token && { "Authorization": `Bearer ${session.access_token}` }),
    },
  });

  if (!response.ok) {
    throw new Error(`API error: ${response.status}`);
  }

  return response.json();
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
