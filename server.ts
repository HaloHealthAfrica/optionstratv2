// Fly.io Deno Server Entry Point
// This server wraps all Supabase Edge Functions and serves them as HTTP endpoints

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

// Import all edge functions
const functions = {
  health: () => import("./supabase/functions/health/index.ts"),
  stats: () => import("./supabase/functions/stats/index.ts"),
  positions: () => import("./supabase/functions/positions/index.ts"),
  webhook: () => import("./supabase/functions/webhook/index.ts"),
  analytics: () => import("./supabase/functions/analytics/index.ts"),
  "exit-signals": () => import("./supabase/functions/exit-signals/index.ts"),
  "market-positioning": () => import("./supabase/functions/market-positioning/index.ts"),
  metrics: () => import("./supabase/functions/metrics/index.ts"),
  "monitor-positions": () => import("./supabase/functions/monitor-positions/index.ts"),
  "mtf-analysis": () => import("./supabase/functions/mtf-analysis/index.ts"),
  "mtf-comparison": () => import("./supabase/functions/mtf-comparison/index.ts"),
  "paper-trading": () => import("./supabase/functions/paper-trading/index.ts"),
  "poll-orders": () => import("./supabase/functions/poll-orders/index.ts"),
  "proxy-test": () => import("./supabase/functions/proxy-test/index.ts"),
  "refresh-gex-signals": () => import("./supabase/functions/refresh-gex-signals/index.ts"),
  "refresh-positions": () => import("./supabase/functions/refresh-positions/index.ts"),
  "test-options-quote": () => import("./supabase/functions/test-options-quote/index.ts"),
  "test-orchestrator": () => import("./supabase/functions/test-orchestrator/index.ts"),
  trades: () => import("./supabase/functions/trades/index.ts"),
};

const PORT = parseInt(Deno.env.get("PORT") || "8080");

console.log(`🚀 Optionstrat Backend Server starting on port ${PORT}`);
console.log(`📦 Available endpoints: ${Object.keys(functions).join(", ")}`);

async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const pathname = url.pathname;

  // CORS headers
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey",
  };

  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Health check endpoint
  if (pathname === "/health" || pathname === "/") {
    return new Response(
      JSON.stringify({
        status: "healthy",
        timestamp: new Date().toISOString(),
        version: "2.0.0",
        endpoints: Object.keys(functions),
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }

  // Route to appropriate function
  const functionName = pathname.slice(1); // Remove leading slash
  
  if (functionName in functions) {
    try {
      // Dynamically import and execute the function
      const module = await functions[functionName as keyof typeof functions]();
      
      // Most Supabase edge functions export a default handler
      if (module.default) {
        const response = await module.default(req);
        
        // Add CORS headers to response
        const headers = new Headers(response.headers);
        Object.entries(corsHeaders).forEach(([key, value]) => {
          headers.set(key, value);
        });
        
        return new Response(response.body, {
          status: response.status,
          statusText: response.statusText,
          headers,
        });
      }
    } catch (error) {
      console.error(`Error executing function ${functionName}:`, error);
      return new Response(
        JSON.stringify({
          error: "Internal server error",
          message: error.message,
          function: functionName,
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }
  }

  // 404 for unknown endpoints
  return new Response(
    JSON.stringify({
      error: "Not found",
      message: `Endpoint '${pathname}' not found`,
      available: Object.keys(functions),
    }),
    {
      status: 404,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    }
  );
}

// Start server
await serve(handler, { port: PORT });
