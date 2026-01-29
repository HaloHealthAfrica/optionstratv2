import { corsHeaders } from "../_shared/cors.ts";
import { createSupabaseClient } from "../_shared/supabase-client.ts";
import { generateGEXSignals } from "../_shared/gex-signals/index.ts";
import { createMarketdataClient } from "../_shared/market-data/marketdata-client.ts";

// Tickers to track
const TRACKED_TICKERS = ['SPY', 'QQQ', 'IWM'];
const REFACTORED_TIMEFRAME = '15m';
const GEX_STRENGTH_NORMALIZER = 1_000_000_000;

// Cron job: Refresh GEX signals for tracked tickers
// Schedule: every 15 min during market hours (9-16 EST, Mon-Fri)
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();
  
  try {
    const url = new URL(req.url);
    const ticker = url.searchParams.get('ticker');
    const tickers = ticker ? [ticker] : TRACKED_TICKERS;
    
    console.log(`[RefreshGEX] Starting GEX signal refresh for: ${tickers.join(', ')}`);

    const supabase = createSupabaseClient();
    const results: { ticker: string; success: boolean; regime?: string; error?: string }[] = [];

    // Get next Friday expiration for weekly options
    const getNextFridayExpiration = (): string => {
      const today = new Date();
      const dayOfWeek = today.getDay();
      const daysUntilFriday = (5 - dayOfWeek + 7) % 7 || 7;
      const friday = new Date(today);
      friday.setDate(today.getDate() + daysUntilFriday);
      return friday.toISOString().split('T')[0];
    };

    const expiration = url.searchParams.get('expiration') || getNextFridayExpiration();

    for (const tkr of tickers) {
      try {
        // Fetch options chain
        console.log(`[RefreshGEX] Fetching chain for ${tkr} exp ${expiration}`);
        const marketdataClient = createMarketdataClient();
        if (!marketdataClient) {
          results.push({ ticker: tkr, success: false, error: 'Market data client not configured' });
          continue;
        }
        const chainResult = await marketdataClient.getOptionsChain(tkr, expiration);
        
        if (!chainResult.success || !chainResult.data) {
          console.error(`[RefreshGEX] Failed to fetch chain for ${tkr}: ${chainResult.error}`);
          results.push({ ticker: tkr, success: false, error: chainResult.error });
          continue;
        }

        const chain = chainResult.data;
        const currentPrice = chain.underlying_price;

        // Get previous signal for flip detection
        const { data: previousSignal } = await supabase
          .from('gex_signals')
          .select('net_gex, dealer_position')
          .eq('ticker', tkr)
          .order('calculated_at', { ascending: false })
          .limit(1)
          .single();

        // Fetch VIX from market context if available
        const { data: context } = await supabase
          .from('latest_market_context')
          .select('vix')
          .eq('ticker', tkr)
          .single();

        // Generate signals
        const signals = generateGEXSignals(
          tkr,
          expiration,
          currentPrice,
          chain,
          previousSignal?.net_gex,
          previousSignal?.dealer_position as any,
          context?.vix
        );

        // Store legacy signals (full schema)
        const { error: insertError } = await supabase.from('gex_signals').insert({
          ticker: tkr,
          expiration,
          current_price: currentPrice,
          net_gex: signals.netGex,
          dealer_position: signals.dealerPosition,
          zero_gamma_level: signals.zeroGammaBreakout.zeroGammaLevel,
          gex_flip_detected: signals.gexFlip.detected,
          gex_flip_direction: signals.gexFlip.direction,
          previous_dealer_position: signals.previousDealerPosition,
          nearest_call_wall: signals.gexWalls.nearestCallWall?.strike,
          nearest_call_wall_strength: signals.gexWalls.nearestCallWall?.strength,
          nearest_put_wall: signals.gexWalls.nearestPutWall?.strike,
          nearest_put_wall_strength: signals.gexWalls.nearestPutWall?.strength,
          call_walls: signals.gexWalls.callWalls,
          put_walls: signals.gexWalls.putWalls,
          max_pain_strike: signals.maxPainMagnet.maxPainStrike,
          max_pain_distance_pct: signals.maxPainMagnet.distancePercent,
          max_pain_magnet_strength: signals.maxPainMagnet.magnetStrength,
          max_pain_expected_direction: signals.maxPainMagnet.expectedDirection,
          pc_volume_ratio: signals.pcRatio.volumeRatio,
          pc_oi_ratio: signals.pcRatio.oiRatio,
          pc_combined_ratio: signals.pcRatio.combinedRatio,
          pc_sentiment: signals.pcRatio.sentiment,
          pc_contrarian_signal: signals.pcRatio.contrarianSignal,
          pc_contrarian_conviction: signals.pcRatio.conviction,
          market_regime: signals.marketRegime.regime,
          regime_confidence: signals.marketRegime.confidence / 100,
          regime_primary_driver: signals.marketRegime.primaryDriver,
          regime_strategy: signals.marketRegime.strategy,
          recommended_action: signals.summary.recommendedAction,
          action_conviction: signals.summary.actionConviction,
          action_reasoning: signals.summary.reasoning,
          key_support: signals.summary.keyLevels.support,
          key_resistance: signals.summary.keyLevels.resistance,
          overall_bias: signals.summary.overallBias,
          bias_strength: signals.summary.biasStrength,
        });

        if (insertError) {
          console.error(`[RefreshGEX] Failed to store signals for ${tkr}:`, insertError);
          results.push({ ticker: tkr, success: false, error: insertError.message });
          continue;
        }

        // Store refactored signal summary for DecisionOrchestrator
        const refactoredDirection = signals.netGex >= 0 ? 'CALL' : 'PUT';
        const refactoredStrength = Math.min(
          1,
          Math.abs(signals.netGex) / GEX_STRENGTH_NORMALIZER
        );

        const { error: refactoredError } = await supabase
          .from('refactored_gex_signals')
          .insert({
            id: crypto.randomUUID(),
            symbol: tkr,
            timeframe: REFACTORED_TIMEFRAME,
            strength: refactoredStrength,
            direction: refactoredDirection,
            timestamp: new Date().toISOString(),
            age: 0,
            metadata: {
              source: 'refresh-gex-signals',
              expiration,
              net_gex: signals.netGex,
              dealer_position: signals.dealerPosition,
              zero_gamma_level: signals.zeroGammaBreakout.zeroGammaLevel,
              gex_flip_detected: signals.gexFlip.detected,
              market_regime: signals.marketRegime.regime,
              summary_bias: signals.summary.overallBias,
            },
          });

        if (refactoredError) {
          console.error(`[RefreshGEX] Failed to store refactored signal for ${tkr}:`, refactoredError);
          results.push({ ticker: tkr, success: false, error: refactoredError.message });
          continue;
        }

        // Log GEX flip if detected
        if (signals.gexFlip.detected) {
          console.log(`[RefreshGEX] ⚠️ GEX FLIP DETECTED for ${tkr}: ${signals.gexFlip.direction}`);
          console.log(`[RefreshGEX] Implication: ${signals.gexFlip.implication}`);
          console.log(`[RefreshGEX] Recommended: ${signals.gexFlip.tradeAction}`);
        }

        console.log(`[RefreshGEX] ${tkr}: ${signals.marketRegime.regime} (${signals.marketRegime.confidence}%), bias=${signals.summary.overallBias}`);
        results.push({ 
          ticker: tkr, 
          success: true, 
          regime: signals.marketRegime.regime,
        });

      } catch (tickerError) {
        console.error(`[RefreshGEX] Error for ${tkr}:`, tickerError);
        results.push({ 
          ticker: tkr, 
          success: false, 
          error: tickerError instanceof Error ? tickerError.message : 'Unknown error',
        });
      }
    }

    const duration = Date.now() - startTime;
    const successCount = results.filter(r => r.success).length;
    
    console.log(`[RefreshGEX] Complete: ${successCount}/${tickers.length} succeeded in ${duration}ms`);

    return new Response(JSON.stringify({
      success: successCount > 0,
      tickers_processed: tickers.length,
      tickers_succeeded: successCount,
      results,
      duration_ms: duration,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[RefreshGEX] Fatal error:', error);
    return new Response(JSON.stringify({ 
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      duration_ms: Date.now() - startTime,
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
