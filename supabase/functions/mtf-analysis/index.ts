// ============================================================================
// MTF Analysis Edge Function
// Returns multi-timeframe analysis for a given ticker
// ============================================================================

import { corsHeaders } from "../_shared/cors.ts";
import { analyzeMultiTimeframe, getPrimaryEntrySignal } from "../_shared/multi-timeframe-analysis.ts";
import { requireAuth } from "../_shared/auth-middleware.ts";

Deno.serve(async (req) => {
  // Handle CORS
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Require authentication
  const { user, response } = await requireAuth(req);
  if (response) return response;

  try {
    const url = new URL(req.url);
    const ticker = url.searchParams.get("ticker") || "SPY";
    const lookbackHours = parseInt(url.searchParams.get("lookback") || "24");

    console.log(`Analyzing MTF for ${ticker} with ${lookbackHours}h lookback...`);

    const analysis = await analyzeMultiTimeframe(
      ticker,
      lookbackHours
    );

    const primarySignal = getPrimaryEntrySignal(analysis);

    return new Response(
      JSON.stringify({
        ticker: analysis.ticker,
        recommendation: analysis.recommendation,
        confidence: analysis.confidence,
        riskLevel: analysis.riskLevel,
        positionSizeMultiplier: analysis.positionSizeMultiplier,
        
        timeframeBias: {
          weekly: analysis.weeklyBias,
          daily: analysis.dailyBias,
          fourHour: analysis.fourHourBias,
          entry: analysis.entryBias,
        },
        
        alignment: {
          isAligned: analysis.isAligned,
          score: analysis.alignmentScore,
          confluenceCount: analysis.confluenceCount,
          reasons: analysis.reasons,
        },
        
        signals: {
          total: analysis.allSignals.length,
          entry: analysis.entrySignals.length,
          confirmation: analysis.confirmationSignals.length,
          entryDetails: analysis.entrySignals.map(s => ({
            source: s.source,
            timeframe: s.timeframe,
            direction: s.direction,
            confidence: s.confidence,
            timestamp: s.timestamp,
          })),
          confirmationDetails: analysis.confirmationSignals.map(s => ({
            source: s.source,
            timeframe: s.timeframe,
            direction: s.direction,
            confidence: s.confidence,
            timestamp: s.timestamp,
          })),
        },
        
        primaryEntrySignal: primarySignal ? {
          source: primarySignal.source,
          timeframe: primarySignal.timeframe,
          direction: primarySignal.direction,
          confidence: primarySignal.confidence,
          price: primarySignal.price,
          tradeLevels: primarySignal.tradeLevels,
        } : null,
      }, null, 2),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("MTF Analysis error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
