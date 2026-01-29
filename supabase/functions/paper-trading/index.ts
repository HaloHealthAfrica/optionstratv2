import { corsHeaders } from "../_shared/cors.ts";
import { createSupabaseClient } from "../_shared/supabase-client.ts";
import { 
  generateGEXSignals, 
  getPaperTradingStats,
  getOpenPaperPositions,
} from "../_shared/gex-signals/index.ts";
import { getMarketDataService } from "../_shared/market-data/index.ts";
import { createMarketdataClient } from "../_shared/market-data/marketdata-client.ts";

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const action = url.searchParams.get('action') || 'stats';
    const ticker = url.searchParams.get('ticker') || 'SPY';
    const expiration = url.searchParams.get('expiration');

    // GET /paper-trading?action=stats
    if (action === 'stats') {
      const stats = await getPaperTradingStats();
      return new Response(JSON.stringify(stats), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // GET /paper-trading?action=positions
    if (action === 'positions') {
      const positions = await getOpenPaperPositions();
      return new Response(JSON.stringify({ positions }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // GET /paper-trading?action=history
    if (action === 'history') {
      const supabase = createSupabaseClient();
      const limit = parseInt(url.searchParams.get('limit') || '50');
      
      const { data: trades, error } = await supabase
        .from('paper_trades')
        .select('*')
        .eq('status', 'CLOSED')
        .order('exit_timestamp', { ascending: false })
        .limit(limit);
      
      if (error) {
        throw new Error(`Failed to fetch history: ${error.message}`);
      }
      
      return new Response(JSON.stringify({ trades }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // GET /paper-trading?action=gex-signals&ticker=SPY&expiration=2025-01-31
    if (action === 'gex-signals') {
      if (!expiration) {
        return new Response(JSON.stringify({ error: 'Expiration required' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Fetch options chain
      console.log(`[PaperTrading] Fetching options chain for ${ticker} ${expiration}`);
      const marketdataClient = createMarketdataClient();
      if (!marketdataClient) {
        return new Response(JSON.stringify({ error: 'Market data client not configured' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const chainResult = await marketdataClient.getOptionsChain(ticker, expiration);
      
      if (!chainResult.success || !chainResult.data) {
        return new Response(JSON.stringify({ 
          error: 'Failed to fetch options chain',
          details: chainResult.error,
        }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const chain = chainResult.data;
      const currentPrice = chain.underlying_price;

      // Get previous GEX for flip detection
      const supabase = createSupabaseClient();
      const { data: previousSignal } = await supabase
        .from('gex_signals')
        .select('net_gex, dealer_position')
        .eq('ticker', ticker)
        .order('calculated_at', { ascending: false })
        .limit(1)
        .single();

      // Generate GEX signals
      const signals = generateGEXSignals(
        ticker,
        expiration,
        currentPrice,
        chain,
        previousSignal?.net_gex,
        previousSignal?.dealer_position as any,
        undefined // VIX - could fetch from market context
      );

      // Store in database
      await supabase.from('gex_signals').insert({
        ticker,
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

      console.log(`[PaperTrading] GEX signals generated for ${ticker}: ${signals.marketRegime.regime}`);

      return new Response(JSON.stringify(signals), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // GET /paper-trading?action=latest-gex&ticker=SPY
    if (action === 'latest-gex') {
      const supabase = createSupabaseClient();
      
      const { data: signal, error } = await supabase
        .from('gex_signals')
        .select('*')
        .eq('ticker', ticker)
        .order('calculated_at', { ascending: false })
        .limit(1)
        .single();
      
      if (error) {
        return new Response(JSON.stringify({ error: 'No GEX signals found' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      
      return new Response(JSON.stringify(signal), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error: 'Unknown action' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[PaperTrading] Error:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
