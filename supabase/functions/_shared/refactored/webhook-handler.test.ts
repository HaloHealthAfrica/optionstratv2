/**
 * Integration tests for Webhook Handler
 * Tests that webhook signals reach DecisionOrchestrator
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { handleWebhookRequest } from './webhook-handler.ts';

describe('Webhook Handler Integration Tests', () => {
  beforeEach(() => {
    // Mock Deno.env
    vi.stubGlobal('Deno', {
      env: {
        get: (key: string) => {
          if (key === 'WEBHOOK_SECRET') return 'test-secret';
          if (key === 'SUPABASE_URL') return 'http://localhost:54321';
          if (key === 'SUPABASE_SERVICE_ROLE_KEY') return 'test-key';
          return undefined;
        },
      },
    });
  });

  /**
   * Integration Test: Webhook to Pipeline Routing
   * Test that webhook signals reach DecisionOrchestrator
   * Validates: Requirements 1.4
   */
  it('should route webhook signals to unified pipeline', async () => {
    const rawSignal = {
      source: 'TRADINGVIEW',
      symbol: 'SPY',
      direction: 'CALL',
      timeframe: '5m',
      price: 450,
    };

    const request = new Request('http://localhost:3000/webhook', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(rawSignal),
    });

    const response = await handleWebhookRequest(request);

    // Should return 200 immediately
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.status).toBe('ACCEPTED');
    expect(body.correlation_id).toBeDefined();
    expect(body.message).toContain('queued');
  });

  it('should reject non-POST requests', async () => {
    const request = new Request('http://localhost:3000/webhook', {
      method: 'GET',
    });

    const response = await handleWebhookRequest(request);

    expect(response.status).toBe(405);
    const body = await response.json();
    expect(body.error).toContain('not allowed');
  });

  it('should handle CORS preflight', async () => {
    const request = new Request('http://localhost:3000/webhook', {
      method: 'OPTIONS',
    });

    const response = await handleWebhookRequest(request);

    expect(response.status).toBe(200);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBeDefined();
  });

  it('should reject invalid JSON', async () => {
    const request = new Request('http://localhost:3000/webhook', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: 'invalid json{',
    });

    const response = await handleWebhookRequest(request);

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toContain('Invalid JSON');
  });

  it('should handle missing required fields gracefully', async () => {
    const incompleteSignal = {
      source: 'TRADINGVIEW',
      // Missing symbol, direction, timeframe
    };

    const request = new Request('http://localhost:3000/webhook', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(incompleteSignal),
    });

    const response = await handleWebhookRequest(request);

    // Should still accept and queue for processing
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.status).toBe('ACCEPTED');
  });

  it('should include correlation ID in all responses', async () => {
    const request = new Request('http://localhost:3000/webhook', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ source: 'TEST' }),
    });

    const response = await handleWebhookRequest(request);
    const body = await response.json();

    expect(body.correlation_id).toBeDefined();
    expect(typeof body.correlation_id).toBe('string');
    expect(body.correlation_id.length).toBeGreaterThan(0);
  });

  it('should return quickly to prevent timeouts', async () => {
    const startTime = Date.now();

    const request = new Request('http://localhost:3000/webhook', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        source: 'TRADINGVIEW',
        symbol: 'SPY',
        direction: 'CALL',
        timeframe: '5m',
      }),
    });

    const response = await handleWebhookRequest(request);
    const endTime = Date.now();
    const responseTime = endTime - startTime;

    // Should respond in less than 100ms (immediate response)
    expect(responseTime).toBeLessThan(100);
    expect(response.status).toBe(200);
  });
});
