/**
 * Market Positioning Edge Function Tests
 */

import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { assertEquals, assertExists } from "https://deno.land/std@0.224.0/assert/mod.ts";

const SUPABASE_URL = Deno.env.get("VITE_SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY")!;

const BASE_URL = `${SUPABASE_URL}/functions/v1/market-positioning`;

Deno.test("market-positioning: returns error for missing parameters", async () => {
  const response = await fetch(BASE_URL, {
    headers: {
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
    },
  });
  
  const body = await response.json();
  
  assertEquals(response.status, 400);
  assertExists(body.error);
  assertEquals(body.error, 'Missing required parameters: underlying and expiration');
});

Deno.test("market-positioning: returns positioning data for valid request", async () => {
  const url = `${BASE_URL}?underlying=SPY&expiration=2026-01-30`;
  
  const response = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
    },
  });
  
  const body = await response.json();
  
  assertEquals(response.status, 200);
  assertEquals(body.success, true);
  assertExists(body.underlying);
  assertEquals(body.underlying, 'SPY');
  assertExists(body.expiration);
  assertExists(body.positioning_bias);
  assertExists(body.confidence);
  assertExists(body.available_sources);
});

Deno.test("market-positioning: quick mode returns bias", async () => {
  const url = `${BASE_URL}?underlying=SPY&expiration=2026-01-30&quick=true`;
  
  const response = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
    },
  });
  
  const body = await response.json();
  
  assertEquals(response.status, 200);
  assertEquals(body.success, true);
  assertExists(body.bias);
  assertExists(body.confidence);
});

Deno.test("market-positioning: handles CORS preflight", async () => {
  const response = await fetch(BASE_URL, {
    method: 'OPTIONS',
    headers: {
      'Origin': 'https://example.com',
      'Access-Control-Request-Method': 'GET',
    },
  });
  
  await response.text(); // Consume body
  
  assertEquals(response.status, 200);
  assertEquals(response.headers.get('Access-Control-Allow-Origin'), '*');
});
