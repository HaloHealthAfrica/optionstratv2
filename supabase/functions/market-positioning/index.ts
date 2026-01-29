/**
 * Market Positioning Edge Function
 * 
 * Provides Put/Call ratio, Max Pain, GEX, and Options Flow data.
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const underlying = url.searchParams.get('underlying');
    const expiration = url.searchParams.get('expiration');
    const quick = url.searchParams.get('quick') === 'true';

    if (!underlying || !expiration) {
      return new Response(
        JSON.stringify({ 
          error: 'Missing required parameters: underlying and expiration' 
        }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // Dynamic import to avoid loading heavy modules for simple requests
    const { getMarketPositioningService } = await import(
      "../_shared/market-data/positioning-service.ts"
    );

    const service = getMarketPositioningService();
    
    if (quick) {
      // Quick mode - just bias and key metrics
      const result = await service.getQuickBias(underlying, expiration);
      
      return new Response(
        JSON.stringify({
          success: true,
          underlying,
          expiration,
          ...result,
        }),
        { 
          status: 200, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // Full positioning analysis
    const positioning = await service.getPositioning(underlying, expiration);

    return new Response(
      JSON.stringify({
        success: true,
        ...positioning,
        available_sources: service.getAvailableSources(),
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error) {
    console.error('[market-positioning] Error:', error);
    
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : 'Unknown error',
        success: false,
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
