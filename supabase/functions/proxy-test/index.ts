/**
 * Simple proxy test function
 * Sends a test request through the Marketdata proxy
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

  // Note: our automated function-call tool can't send querystrings reliably.
  // Support both query params (browser/manual) and JSON body (automation).
  let body: Record<string, unknown> = {};
  if (req.method !== 'GET') {
    try {
      body = await req.json();
    } catch {
      body = {};
    }
  }

  const test = String(
    (body.test as string | undefined) ?? url.searchParams.get('test') ?? 'headers'
  ).toLowerCase();

  const MARKETDATA_PROXY_URL = Deno.env.get('MARKETDATA_PROXY_URL');
  const MARKETDATA_API_KEY = Deno.env.get('MARKETDATA_API_KEY');

  if (!MARKETDATA_PROXY_URL) {
    return new Response(
      JSON.stringify({ error: 'MARKETDATA_PROXY_URL not configured' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const proxyBase = MARKETDATA_PROXY_URL.replace(/\/$/, '');

  const buildOccSymbol = (
    underlying: string,
    expiration: string,
    strike: number,
    optionType: 'CALL' | 'PUT'
  ) => {
    const expDate = expiration.replace(/-/g, '').slice(2); // YYMMDD
    const strikeStr = (strike * 1000).toString().padStart(8, '0');
    const optType = optionType === 'CALL' ? 'C' : 'P';
    return `${underlying.toUpperCase()}${expDate}${optType}${strikeStr}`;
  };

  const fetchMarketdata = async (fullUrl: string) => {
    const resp = await fetch(fullUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Token ${MARKETDATA_API_KEY}`,
        'Accept': 'application/json',
      },
    });
    const status = resp.status;
    const text = await resp.text();
    let json: unknown = null;
    try {
      json = JSON.parse(text);
    } catch {
      // keep as text
    }
    return {
      status,
      raw: text,
      json,
    };
  };

  // Optional: real option quote test
  if (test === 'options_quote' || test === 'option_quote') {
    const underlying = String(
      (body.underlying as string | undefined) ?? url.searchParams.get('underlying') ?? 'SPY'
    );
    const expiration = String(
      (body.expiration as string | undefined) ?? url.searchParams.get('expiration') ?? '2026-01-30'
    );
    const strike = Number(
      (body.strike as number | string | undefined) ?? url.searchParams.get('strike') ?? 600
    );
    const optionType = String(
      (body.type as string | undefined) ?? url.searchParams.get('type') ?? 'CALL'
    ).toUpperCase() as 'CALL' | 'PUT';
    const occ = buildOccSymbol(underlying, expiration, strike, optionType);

    const path = `/v1/options/quotes/${occ}/`;
    const directUrl = `https://api.marketdata.app${path}`;
    const proxyUrl = `${proxyBase}${path}`;

    console.log('[proxy-test] Option quote test', { underlying, expiration, strike, optionType, occ });
    // ONLY use proxy to avoid IP conflicts with Marketdata.app security
    console.log('[proxy-test] Proxy quote URL:', proxyUrl);

    try {
      const result = await fetchMarketdata(proxyUrl);

      return new Response(
        JSON.stringify(
          {
            params: { underlying, expiration, strike, optionType, occ },
            proxy: result,
            note: 'Using proxy only to avoid Marketdata IP lockout'
          },
          null,
          2
        ),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    } catch (error) {
      console.error('[proxy-test] Option quote test error:', error);
      return new Response(
        JSON.stringify(
          {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
          },
          null,
          2
        ),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
  }

  // Chain test - test options chain endpoint
  if (test === 'chain' || test === 'options_chain') {
    const underlying = String(
      (body.underlying as string | undefined) ?? url.searchParams.get('underlying') ?? 'SPY'
    );
    const expiration = String(
      (body.expiration as string | undefined) ?? url.searchParams.get('expiration') ?? '2026-01-30'
    );

    const path = `/v1/options/chain/${underlying.toUpperCase()}/?expiration=${expiration}`;
    const proxyUrl = `${proxyBase}${path}`;

    console.log('[proxy-test] Chain test', { underlying, expiration });
    console.log('[proxy-test] Proxy chain URL:', proxyUrl);

    try {
      const result = await fetchMarketdata(proxyUrl);

      // If we got data, summarize it
      let summary = null;
      if (result.json && typeof result.json === 'object' && 's' in result.json) {
        const data = result.json as Record<string, unknown>;
        summary = {
          status: data.s,
          options_count: Array.isArray(data.optionSymbol) ? (data.optionSymbol as unknown[]).length : 0,
          strikes_sample: Array.isArray(data.strike) ? (data.strike as number[]).slice(0, 5) : [],
          has_greeks: Array.isArray(data.delta) && (data.delta as number[]).length > 0,
          has_volume: Array.isArray(data.volume) && (data.volume as number[]).length > 0,
          has_oi: Array.isArray(data.openInterest) && (data.openInterest as number[]).length > 0,
        };
      }

      return new Response(
        JSON.stringify(
          {
            params: { underlying, expiration },
            proxy_url: proxyUrl,
            result: {
              status: result.status,
              summary,
              raw_preview: typeof result.raw === 'string' ? result.raw.slice(0, 500) : null,
            },
            note: 'Using proxy only to avoid Marketdata IP lockout'
          },
          null,
          2
        ),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    } catch (error) {
      console.error('[proxy-test] Chain test error:', error);
      return new Response(
        JSON.stringify({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
  }

  // Default: Test via proxy only (headers endpoint)
  const proxyUrl = `${proxyBase}/headers/`;

  console.log('[proxy-test] Headers test via proxy only');
  console.log('[proxy-test] Proxy URL:', proxyUrl);
  console.log('[proxy-test] API Key present:', !!MARKETDATA_API_KEY);

  try {
    const proxyResponse = await fetch(proxyUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Token ${MARKETDATA_API_KEY}`,
        'Accept': 'application/json',
      },
    });
    const proxyStatus = proxyResponse.status;
    const proxyText = await proxyResponse.text();
    
    console.log('[proxy-test] Proxy response status:', proxyStatus);

    return new Response(
      JSON.stringify({
        api_key_preview: MARKETDATA_API_KEY?.slice(0, 12) + '...',
        proxy: {
          url: proxyUrl,
          status: proxyStatus,
          body: proxyText.substring(0, 500),
        },
        note: 'Using proxy only to avoid Marketdata IP lockout'
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  } catch (error) {
    console.error('[proxy-test] Error:', error);
    
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});