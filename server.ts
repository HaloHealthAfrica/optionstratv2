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
  auth: () => import("./supabase/functions/auth/index.ts"),
  "exit-rules": () => import("./supabase/functions/exit-rules/index.ts"),
  "risk-limits": () => import("./supabase/functions/risk-limits/index.ts"),
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
  "refactored-exit-worker": () => import("./supabase/functions/refactored-exit-worker/index.ts"),
  "test-options-quote": () => import("./supabase/functions/test-options-quote/index.ts"),
  "test-orchestrator": () => import("./supabase/functions/test-orchestrator/index.ts"),
  trades: () => import("./supabase/functions/trades/index.ts"),
};

const PORT = parseInt(Deno.env.get("PORT") || "8080");

console.log(`🚀 Optionstrat Backend Server starting on port ${PORT}`);
console.log(`📦 Available endpoints: ${Object.keys(functions).join(", ")}`);

async function runRefactoredExitWorker(): Promise<void> {
  const url = `http://127.0.0.1:${PORT}/refactored-exit-worker`;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  const token = Deno.env.get("API_AUTH_TOKEN");
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  try {
    const response = await fetch(url, {
      method: "POST",
      headers,
    });
    if (!response.ok) {
      console.error(`[ExitWorkerCron] Failed with status ${response.status}`);
      return;
    }
    const data = await response.json();
    console.log(`[ExitWorkerCron] Success: processed=${data.processed ?? 0}`);
  } catch (error) {
    console.error("[ExitWorkerCron] Error:", error);
  }
}

const exitWorkerEnabled = Deno.env.get("EXIT_WORKER_ENABLED") !== "false";
const exitWorkerCron = Deno.env.get("EXIT_WORKER_CRON") || "*/5 * * * 1-5";
const exitWorkerIntervalSeconds = parseInt(Deno.env.get("EXIT_WORKER_INTERVAL_SECONDS") || "0");

if (exitWorkerEnabled) {
  const denoAny = Deno as unknown as { cron?: (name: string, schedule: string, fn: () => void | Promise<void>) => void };
  if (typeof denoAny.cron === "function") {
    denoAny.cron("refactored-exit-worker", exitWorkerCron, () => runRefactoredExitWorker());
    console.log(`[ExitWorkerCron] Scheduled with Deno.cron: ${exitWorkerCron}`);
  } else if (exitWorkerIntervalSeconds > 0) {
    setInterval(() => {
      runRefactoredExitWorker();
    }, exitWorkerIntervalSeconds * 1000);
    console.log(`[ExitWorkerCron] Scheduled with interval: ${exitWorkerIntervalSeconds}s`);
  } else {
    console.log("[ExitWorkerCron] Scheduling disabled (no Deno.cron and EXIT_WORKER_INTERVAL_SECONDS not set).");
  }
}

async function handler(req: Request): Promise<Response> {
  const startTime = Date.now();
  const slowRequestMs = parseInt(Deno.env.get("SLOW_REQUEST_MS") || "2000");
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
    const response = new Response(null, { headers: corsHeaders });
    response.headers.set("x-response-time-ms", "0");
    return response;
  }

  // Health check endpoint
  if (pathname === "/health" || pathname === "/") {
    const response = new Response(
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
    const duration = Date.now() - startTime;
    response.headers.set("x-response-time-ms", String(duration));
    if (duration > slowRequestMs) {
      console.warn(`[Perf] Slow request ${pathname}: ${duration}ms`);
    }
    return response;
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
        
        const wrapped = new Response(response.body, {
          status: response.status,
          statusText: response.statusText,
          headers,
        });
        const duration = Date.now() - startTime;
        wrapped.headers.set("x-response-time-ms", String(duration));
        if (duration > slowRequestMs) {
          console.warn(`[Perf] Slow request ${pathname}: ${duration}ms`);
        }
        return wrapped;
      }
    } catch (error) {
      console.error(`Error executing function ${functionName}:`, error);
      const response = new Response(
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
      const duration = Date.now() - startTime;
      response.headers.set("x-response-time-ms", String(duration));
      if (duration > slowRequestMs) {
        console.warn(`[Perf] Slow request ${pathname}: ${duration}ms`);
      }
      return response;
    }
  }

  // 404 for unknown endpoints
  const response = new Response(
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
  const duration = Date.now() - startTime;
  response.headers.set("x-response-time-ms", String(duration));
  if (duration > slowRequestMs) {
    console.warn(`[Perf] Slow request ${pathname}: ${duration}ms`);
  }
  return response;
}

// Start server
await serve(handler, { port: PORT });
