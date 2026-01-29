/**
 * Test Options Quote - Diagnostic endpoint to test what data we can pull
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const url = new URL(req.url);
  const underlying = url.searchParams.get('underlying') || 'SPY';
  const expiration = url.searchParams.get('expiration') || '2026-01-30';
  const strike = Number(url.searchParams.get('strike') || 600);
  const optionType = (url.searchParams.get('type') || 'CALL') as 'CALL' | 'PUT';

  const results: Record<string, unknown> = {
    params: { underlying, expiration, strike, optionType },
  };

  // Test 1: Stock quote from Marketdata
  try {
    const { createMarketdataClient } = await import("../_shared/market-data/marketdata-client.ts");
    const marketdata = createMarketdataClient();
    
    if (marketdata) {
      // Stock quote test
      const stockResult = await marketdata.getStockQuote(underlying);
      results.marketdata_stock_quote = {
        success: stockResult.success,
        price: stockResult.data?.price,
        latency: stockResult.latency_ms,
        error: stockResult.error,
      };

      // Options chain test
      const chainResult = await marketdata.getOptionsChain(underlying, expiration);
      results.marketdata_options_chain = {
        success: chainResult.success,
        call_count: chainResult.data?.calls?.length || 0,
        put_count: chainResult.data?.puts?.length || 0,
        strikes: chainResult.data?.strikes?.length || 0,
        has_greeks: chainResult.data?.calls?.[0]?.delta !== undefined,
        sample_call: chainResult.data?.calls?.[0] ? {
          strike: chainResult.data.calls[0].strike,
          delta: chainResult.data.calls[0].delta,
          gamma: chainResult.data.calls[0].gamma,
          theta: chainResult.data.calls[0].theta,
          iv: chainResult.data.calls[0].implied_volatility,
          mid: chainResult.data.calls[0].mid,
        } : null,
        latency: chainResult.latency_ms,
        error: chainResult.error,
      };

      // Individual option quote test
      const optionResult = await marketdata.getOptionQuote(underlying, expiration, strike, optionType);
      results.marketdata_option_quote = {
        success: optionResult.success,
        symbol: optionResult.data?.symbol,
        mid: optionResult.data?.mid,
        delta: optionResult.data?.delta,
        gamma: optionResult.data?.gamma,
        theta: optionResult.data?.theta,
        iv: optionResult.data?.implied_volatility,
        latency: optionResult.latency_ms,
        error: optionResult.error,
      };
    } else {
      results.marketdata_error = 'Client not configured (missing MARKETDATA_API_KEY)';
    }
  } catch (error) {
    results.marketdata_error = error instanceof Error ? error.message : String(error);
  }

  // Test 2: Tradier
  try {
    const { createTradierClient } = await import("../_shared/market-data/tradier-client.ts");
    const tradier = createTradierClient();
    
    if (tradier) {
      const optionResult = await tradier.getOptionQuote(underlying, expiration, strike, optionType);
      results.tradier_option_quote = {
        success: optionResult.success,
        symbol: optionResult.data?.symbol,
        mid: optionResult.data?.mid,
        delta: optionResult.data?.delta,
        latency: optionResult.latency_ms,
        error: optionResult.error,
      };
    } else {
      results.tradier_error = 'Client not configured (missing TRADIER_API_KEY)';
    }
  } catch (error) {
    results.tradier_error = error instanceof Error ? error.message : String(error);
  }

  // Test 3: Unified service
  try {
    const { getMarketDataService } = await import("../_shared/market-data/index.ts");
    const service = getMarketDataService();
    
    const unifiedResult = await service.getOptionQuote(underlying, expiration, strike, optionType);
    results.unified_service_option_quote = {
      success: unifiedResult.success,
      provider: unifiedResult.provider,
      symbol: unifiedResult.data?.symbol,
      mid: unifiedResult.data?.mid,
      delta: unifiedResult.data?.delta,
      latency: unifiedResult.latency_ms,
      error: unifiedResult.error,
    };

    results.available_providers = service.getAvailableProviders();
  } catch (error) {
    results.unified_error = error instanceof Error ? error.message : String(error);
  }

  return new Response(
    JSON.stringify(results, null, 2),
    { 
      status: 200, 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    }
  );
});
