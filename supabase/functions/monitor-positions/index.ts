import { corsHeaders } from "../_shared/cors.ts";
import { createSupabaseClient } from "../_shared/supabase-client.ts";
import { 
  getOpenPaperPositions,
  updatePaperPosition,
  evaluateHold,
  evaluateExit,
  executePaperExit,
  generateGEXSignals,
} from "../_shared/gex-signals/index.ts";
import { getMarketDataService } from "../_shared/market-data/index.ts";
import { createMarketdataClient } from "../_shared/market-data/marketdata-client.ts";

// Cron job: Monitor open paper positions
// Schedule: every 5 min during market hours (9-16 EST, Mon-Fri)
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();
  
  try {
    console.log('[MonitorPositions] Starting position monitoring...');
    
    // Get all open positions
    const positions = await getOpenPaperPositions();
    
    if (positions.length === 0) {
      console.log('[MonitorPositions] No open positions to monitor');
      return new Response(JSON.stringify({ 
        success: true, 
        positions_checked: 0,
        duration_ms: Date.now() - startTime,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`[MonitorPositions] Monitoring ${positions.length} open positions`);

    const results = {
      checked: 0,
      updated: 0,
      exited: 0,
      partial_exited: 0,
      errors: 0,
      details: [] as any[],
    };

    // Group positions by ticker for efficient chain fetching
    const positionsByTicker = new Map<string, typeof positions>();
    for (const pos of positions) {
      const key = `${pos.ticker}_${pos.expiration}`;
      if (!positionsByTicker.has(key)) {
        positionsByTicker.set(key, []);
      }
      positionsByTicker.get(key)!.push(pos);
    }

    // Process each ticker group
    for (const [key, tickerPositions] of positionsByTicker) {
      const [ticker, expiration] = key.split('_');
      
      try {
        // Fetch options chain for GEX analysis
        const marketdataClient = createMarketdataClient();
        if (!marketdataClient) {
          console.error(`[MonitorPositions] Market data client not configured`);
          results.errors += tickerPositions.length;
          continue;
        }
        const chainResult = await marketdataClient.getOptionsChain(ticker, expiration);
        
        if (!chainResult.success || !chainResult.data) {
          console.error(`[MonitorPositions] Failed to fetch chain for ${ticker}: ${chainResult.error}`);
          results.errors += tickerPositions.length;
          continue;
        }

        const chain = chainResult.data;
        const underlyingPrice = chain.underlying_price;

        // Generate GEX signals
        const supabase = createSupabaseClient();
        const { data: previousSignal } = await supabase
          .from('gex_signals')
          .select('net_gex, dealer_position')
          .eq('ticker', ticker)
          .order('calculated_at', { ascending: false })
          .limit(1)
          .single();

        const gexSignals = generateGEXSignals(
          ticker,
          expiration,
          underlyingPrice,
          chain,
          previousSignal?.net_gex,
          previousSignal?.dealer_position as any
        );

        // Process each position
        for (const pos of tickerPositions) {
          results.checked++;
          
          try {
            // Get current quote for this option
            const marketService = getMarketDataService();
            const quoteResult = await marketService.getOptionQuote(
              pos.ticker, pos.expiration, pos.strike, pos.option_type
            );
            
            if (!quoteResult.success || !quoteResult.data) {
              console.error(`[MonitorPositions] Failed to fetch quote for ${pos.symbol}`);
              results.errors++;
              continue;
            }

            const quote = quoteResult.data;
            const currentPrice = quote.mid || quote.last;
            
            // Update position with current data
            await updatePaperPosition(pos.id, currentPrice, underlyingPrice, {
              delta: quote.delta,
              gamma: quote.gamma,
              theta: quote.theta,
              iv: quote.implied_volatility,
            });
            results.updated++;

            // Calculate metrics
            const entryTime = new Date(pos.entry_timestamp).getTime();
            const hoursInTrade = (Date.now() - entryTime) / (1000 * 60 * 60);
            const unrealizedPnl = (currentPrice - pos.entry_price) * pos.quantity * 100;
            const unrealizedPnlPct = ((currentPrice - pos.entry_price) / pos.entry_price) * 100;
            const dte = Math.ceil((new Date(pos.expiration).getTime() - Date.now()) / (1000 * 60 * 60 * 24));

            // Calculate theta decay percentage
            const thetaDecayPct = quote.theta ? Math.abs(quote.theta / currentPrice) * 100 : undefined;

            // Evaluate exit decision
            const exitDecision = evaluateExit({
              position: {
                id: pos.id,
                optionType: pos.option_type as 'CALL' | 'PUT',
                entryPrice: pos.entry_price,
                currentPrice,
                highestPriceSinceEntry: Math.max(pos.highest_price_since_entry || currentPrice, currentPrice),
                unrealizedPnl,
                unrealizedPnlPct,
                dte,
                hoursInTrade,
                entryMarketRegime: pos.entry_market_regime,
                plannedStopLoss: pos.planned_stop_loss,
                plannedTarget1: pos.planned_target_1,
                plannedTarget2: pos.planned_target_2,
                trailingStopPct: pos.trailing_stop_pct || 25,
                partialExitDone: (pos.partial_exit_quantity || 0) > 0,
              },
              gexSignals,
              greeks: {
                delta: quote.delta,
                theta: quote.theta,
                thetaDecayPct,
              },
            });

            // Execute exit if needed
            if (exitDecision.action !== 'HOLD') {
              if (exitDecision.urgency === 'IMMEDIATE' || exitDecision.urgency === 'SOON') {
                const exitResult = await executePaperExit(
                  pos.id,
                  exitDecision,
                  currentPrice,
                  underlyingPrice,
                  gexSignals.marketRegime.regime
                );

                if (exitResult.success) {
                  if (exitDecision.action === 'CLOSE_FULL') {
                    results.exited++;
                    console.log(`[MonitorPositions] Exited ${pos.symbol}: ${exitDecision.reason}`);
                  } else {
                    results.partial_exited++;
                    console.log(`[MonitorPositions] Partial exit ${pos.symbol}: ${exitDecision.reason}`);
                  }
                } else {
                  console.error(`[MonitorPositions] Exit failed for ${pos.symbol}: ${exitResult.error}`);
                  results.errors++;
                }

                results.details.push({
                  symbol: pos.symbol,
                  action: exitDecision.action,
                  trigger: exitDecision.trigger,
                  reason: exitDecision.reason,
                  pnl: unrealizedPnl,
                  pnlPct: unrealizedPnlPct,
                });
              }
            } else {
              // Evaluate hold decision for logging
              const holdDecision = evaluateHold({
                position: {
                  id: pos.id,
                  optionType: pos.option_type as 'CALL' | 'PUT',
                  entryPrice: pos.entry_price,
                  currentPrice,
                  unrealizedPnlPct,
                  hoursInTrade,
                  entryMarketRegime: pos.entry_market_regime,
                  entryDealerPosition: pos.entry_dealer_position,
                },
                gexSignals,
              });

              // Log warnings if any
              if (holdDecision.warnings.length > 0) {
                await supabase
                  .from('paper_trades')
                  .update({
                    warnings_log: [
                      ...(pos.warnings_log || []),
                      {
                        timestamp: new Date().toISOString(),
                        warnings: holdDecision.warnings,
                        holdConfidence: holdDecision.holdConfidence,
                      },
                    ],
                    hold_decisions_log: [
                      ...(pos.hold_decisions_log || []),
                      holdDecision.decisionLog,
                    ],
                  })
                  .eq('id', pos.id);
              }
            }

          } catch (posError) {
            console.error(`[MonitorPositions] Error processing ${pos.symbol}:`, posError);
            results.errors++;
          }
        }

      } catch (tickerError) {
        console.error(`[MonitorPositions] Error processing ticker ${ticker}:`, tickerError);
        results.errors += tickerPositions.length;
      }
    }

    const duration = Date.now() - startTime;
    console.log(`[MonitorPositions] Complete: ${results.checked} checked, ${results.exited} exited, ${results.errors} errors in ${duration}ms`);

    return new Response(JSON.stringify({
      success: true,
      positions_checked: results.checked,
      positions_updated: results.updated,
      positions_exited: results.exited,
      positions_partial_exited: results.partial_exited,
      errors: results.errors,
      details: results.details,
      duration_ms: duration,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[MonitorPositions] Fatal error:', error);
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
