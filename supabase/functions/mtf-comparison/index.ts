// ============================================================================
// MTF Comparison Edge Function
// Returns both STRICT and WEIGHTED mode results for comparison
// ============================================================================

import { corsHeaders } from "../_shared/cors.ts";
import { analyzeMultiTimeframe } from "../_shared/multi-timeframe-analysis.ts";
import { 
  evaluateMtfAlignment, 
  DEFAULT_MTF_CONFIG,
  MtfFilterResult 
} from "../_shared/mtf-filter.ts";
import { requireAuth } from "../_shared/auth-middleware.ts";

Deno.serve(async (req) => {
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
    const testQuantity = parseInt(url.searchParams.get("quantity") || "10");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    console.log(`MTF Comparison for ${ticker}...`);

    // Get base analysis
    const analysis = await analyzeMultiTimeframe(
      ticker,
      lookbackHours,
      supabaseUrl,
      supabaseKey
    );

    // Evaluate in STRICT mode
    const strictResult = await evaluateMtfAlignment(
      ticker,
      testQuantity,
      { ...DEFAULT_MTF_CONFIG, mode: 'STRICT' },
      supabaseUrl,
      supabaseKey
    );

    // Evaluate in WEIGHTED mode
    const weightedResult = await evaluateMtfAlignment(
      ticker,
      testQuantity,
      { ...DEFAULT_MTF_CONFIG, mode: 'WEIGHTED' },
      supabaseUrl,
      supabaseKey
    );

    const formatResult = (r: MtfFilterResult) => ({
      approved: r.approved,
      reason: r.reason,
      adjustedQuantity: r.adjustedQuantity,
      positionMultiplier: r.positionMultiplier,
    });

    return new Response(
      JSON.stringify({
        ticker: analysis.ticker,
        analysis: {
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
          primaryEntrySignal: null,
        },
        strictResult: formatResult(strictResult),
        weightedResult: formatResult(weightedResult),
      }, null, 2),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("MTF Comparison error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
