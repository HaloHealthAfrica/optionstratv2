/**
 * Unified Webhook Handler - MIGRATED TO REFACTORED SYSTEM
 * 
 * Routes all incoming signals to the refactored SignalPipeline
 * Handles both trading signals and market context updates
 * 
 * Requirements: 1.4
 * 
 * BACKUP: Original handler saved as index.ts.backup
 */

import { corsHeaders } from "../_shared/cors.ts";
import { createDbClient } from "../_shared/db-client.ts";
import { verifyHmacSignature, generateSignalHash } from "../_shared/hmac.ts";
import { saveContext } from "../_shared/market-context-service.ts";
import type { ContextWebhookPayload } from "../_shared/market-context-types.ts";
import { parseTradingViewPayload } from "../_shared/tradingview-parser.ts";
import { parseIndicatorPayload, detectIndicatorSource } from "../_shared/indicator-parsers/index.ts";
import type { IncomingSignal } from "../_shared/types.ts";
import { generateOccSymbol, type OrderRequest, type OrderSide, type OrderType } from "../_shared/types.ts";
import { createAdapter } from "../_shared/adapter-factory.ts";

// Import refactored components
import { SignalPipeline } from "../_shared/refactored/pipeline/signal-pipeline.ts";
import { SignalNormalizer } from "../_shared/refactored/pipeline/signal-normalizer.ts";
import { SignalValidator } from "../_shared/refactored/validation/signal-validator.ts";
import { DeduplicationCache } from "../_shared/refactored/cache/deduplication-cache.ts";
import { DecisionOrchestrator } from "../_shared/refactored/orchestrator/decision-orchestrator.ts";
import { ContextCache } from "../_shared/refactored/cache/context-cache.ts";
import { GEXService } from "../_shared/refactored/services/gex-service.ts";
import { PositionManager } from "../_shared/refactored/services/position-manager.ts";
import { RiskManager } from "../_shared/refactored/services/risk-manager.ts";
import { PositionSizingService } from "../_shared/refactored/services/position-sizing-service.ts";
import { ConfluenceCalculator } from "../_shared/refactored/services/confluence-calculator.ts";
import { defaultConfig } from "../_shared/refactored/core/config.ts";
import { AuditLogger, AuditLogEntry } from "../_shared/refactored/monitoring/audit-logger.ts";
import { MetricsService } from "../_shared/refactored/monitoring/metrics-service.ts";
import { DegradedModeTracker } from "../_shared/refactored/monitoring/degraded-mode-tracker.ts";

/**
 * Initialize the unified signal processing pipeline
 */
function initializePipeline(): {
  pipeline: SignalPipeline;
  auditLogger: AuditLogger;
  metricsService: MetricsService;
  degradedModeTracker: DegradedModeTracker;
} {
  const supabase = createDbClient();
  
  // Initialize monitoring services
  const auditLogger = new AuditLogger(async (entry: AuditLogEntry) => {
    if (entry.type !== 'decision_made') {
      return;
    }

    const decision = entry.finalDecision;
    const decisionPayload = {
      id: crypto.randomUUID(),
      signal_id: entry.signalId,
      decision_type: entry.decisionType,
      decision: entry.decision,
      confidence: 'confidence' in decision ? Math.round(decision.confidence) : null,
      position_size: 'positionSize' in decision ? decision.positionSize : null,
      reasoning: decision.reasoning,
      calculations: entry.calculatedValues,
      context_data: entry.inputData.context ?? null,
      gex_data: entry.inputData.gex ?? null,
      created_at: entry.timestamp.toISOString(),
    };

    const { error } = await supabase
      .from('refactored_decisions')
      .insert(decisionPayload);

    if (error) {
      throw new Error(`Failed to persist decision audit: ${error.message}`);
    }
  });
  const metricsService = new MetricsService();
  const degradedModeTracker = new DegradedModeTracker();
  
  // Create context fetcher
  const fetchContext = async () => {
    try {
      const { data, error } = await supabase
        .from('refactored_context_snapshots')
        .select('*')
        .order('timestamp', { ascending: false })
        .limit(1)
        .single();
      
      if (error || !data) {
        degradedModeTracker.recordFailure('CONTEXT', 'Failed to fetch context');
        throw new Error('Context fetch failed');
      }
      
      degradedModeTracker.recordSuccess('CONTEXT');
      
      return {
        vix: data.vix,
        trend: data.trend as 'BULLISH' | 'BEARISH' | 'NEUTRAL',
        bias: data.bias,
        regime: data.regime as 'LOW_VOL' | 'HIGH_VOL' | 'NORMAL',
        timestamp: new Date(data.timestamp),
      };
    } catch (error) {
      degradedModeTracker.recordFailure('CONTEXT', error instanceof Error ? error.message : 'Unknown error');
      throw error;
    }
  };
  
  // Create service instances
  const contextCache = new ContextCache(defaultConfig, fetchContext);
  const gexService = new GEXService(supabase, defaultConfig, degradedModeTracker);
  const positionManager = new PositionManager(supabase, defaultConfig);
  const riskManager = new RiskManager(defaultConfig);
  const positionSizingService = new PositionSizingService(defaultConfig);
  const confluenceCalculator = new ConfluenceCalculator();
  
  // Create orchestrator
  const orchestrator = new DecisionOrchestrator(
    contextCache,
    gexService,
    positionManager,
    riskManager,
    positionSizingService,
    confluenceCalculator,
    defaultConfig,
    auditLogger
  );
  
  // Create pipeline components
  const normalizer = new SignalNormalizer();
  const validator = new SignalValidator(defaultConfig);
  const deduplicationCache = new DeduplicationCache(defaultConfig);
  
  // Create pipeline
  const pipeline = new SignalPipeline(
    normalizer,
    validator,
    deduplicationCache,
    orchestrator,
    positionManager,
    defaultConfig,
    auditLogger
  );
  
  return { pipeline, auditLogger, metricsService, degradedModeTracker };
}

// Allow running standalone (Supabase edge / local dev)
if (import.meta.main) {
  Deno.serve(handleWebhook);
}

// Initialize pipeline once at module load
const { pipeline, auditLogger, metricsService, degradedModeTracker } = initializePipeline();

console.log('[WEBHOOK] Initialized with refactored SignalPipeline and DecisionOrchestrator');

function inferTimeframe(payload: Record<string, unknown>): string {
  const candidates = [
    payload.timeframe,
    payload.tf,
    payload.interval,
    payload.trigger_timeframe,
    payload.timeframe_minutes,
  ];

  const nested = payload.market as Record<string, unknown> | undefined;
  if (nested?.timeframe) {
    candidates.push(nested.timeframe);
  }

  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate.trim();
    }
    if (typeof candidate === 'number' && candidate > 0) {
      return `${candidate}m`;
    }
  }

  return '5m';
}

function inferTimestamp(payload: Record<string, unknown>): string | undefined {
  const candidates = [
    payload.timestamp,
    payload.time,
    payload.signal_time,
  ];

  const signal = payload.signal as Record<string, unknown> | undefined;
  if (signal?.timestamp) {
    candidates.push(signal.timestamp);
  }

  const journal = payload.journal as Record<string, unknown> | undefined;
  if (journal?.created_at) {
    candidates.push(journal.created_at);
  }

  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate.trim();
    }
    if (typeof candidate === 'number' && candidate > 0) {
      return new Date(candidate).toISOString();
    }
  }

  return undefined;
}

function resolveOrderSide(action: IncomingSignal['action']): OrderSide {
  switch (action) {
    case 'BUY':
      return 'BUY_TO_OPEN';
    case 'SELL':
      return 'SELL_TO_OPEN';
    case 'CLOSE':
      return 'SELL_TO_CLOSE';
    default:
      return 'BUY_TO_OPEN';
  }
}

function resolveOrderType(orderType?: OrderType): OrderType {
  return orderType ?? 'MARKET';
}

function resolveEntryPrice(parsedSignal: IncomingSignal, metadata: Record<string, unknown>): number | undefined {
  const candidates = [
    parsedSignal.limit_price,
    (metadata.entry_price as number | undefined),
    (metadata.entry as { price?: number } | undefined)?.price,
  ];

  return candidates.find((value) => typeof value === 'number' && value > 0);
}

function buildPipelinePayload(
  incoming: IncomingSignal,
  source: string,
  rawPayload: Record<string, unknown>,
  signalHash: string,
  signatureVerified: boolean
): Record<string, unknown> {
  const direction = incoming.option_type;
  const timeframe = inferTimeframe(rawPayload);
  const timestamp = inferTimestamp(rawPayload);

  const entryPriceCandidates = [
    incoming.limit_price,
    (rawPayload.entry as Record<string, unknown> | undefined)?.price,
    rawPayload.price,
    rawPayload.current_price,
    rawPayload.last,
  ];

  const entryPrice = entryPriceCandidates.find(
    (candidate) => typeof candidate === 'number' && candidate > 0
  );

  const metadata = {
    ...incoming.metadata,
    parsed_signal: incoming,
    raw_payload: rawPayload,
    signal_hash: signalHash,
    signature_verified: signatureVerified,
    indicator_source: source,
    entry_price: entryPrice,
  };

  if (typeof metadata.alignment_score === 'number') {
    metadata.mtf_aligned = metadata.alignment_score >= 50;
  }

  if (typeof metadata.confluence_score === 'number') {
    metadata.confluence = metadata.confluence_score / 100;
  }

  return {
    source,
    symbol: incoming.underlying,
    direction,
    timeframe,
    ...(timestamp ? { timestamp } : {}),
    metadata,
  };
}

/**
 * Main webhook handler
 */
export default async function handleWebhook(req: Request): Promise<Response> {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Only accept POST requests
  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const correlationId = crypto.randomUUID();
  const startTime = Date.now();

  // Enhanced logging: Stage 1 - Webhook Receipt
  console.log(`[${correlationId}] Stage: RECEIPT, Status: RECEIVED, Method: ${req.method}, Headers: ${JSON.stringify(Object.fromEntries(req.headers))}`);

  try {
    // Get raw body for signature verification
    const rawBody = await req.text();
    const signature = req.headers.get("x-signature") || "";
    const webhookSecret = Deno.env.get("WEBHOOK_SECRET") || Deno.env.get("HMAC_SECRET");

    // Enhanced logging: Stage 2 - HMAC Verification
    console.log(`[${correlationId}] Stage: HMAC_VERIFICATION, Status: CHECKING, HasSecret: ${!!webhookSecret}, HasSignature: ${!!signature}`);

    // Signature is optional; if provided and secret configured, verify it
    let signatureValid = false;
    if (webhookSecret && signature) {
      signatureValid = await verifyHmacSignature(rawBody, signature, webhookSecret);
      console.log(`[${correlationId}] Stage: HMAC_VERIFICATION, Status: ${signatureValid ? 'SUCCESS' : 'FAILED'}`);
      if (!signatureValid) {
        console.error(`[${correlationId}] Stage: HMAC_VERIFICATION, Status: REJECTED, Reason: Invalid signature`);
        return new Response(
          JSON.stringify({ error: "Invalid signature" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    } else {
      console.log(`[${correlationId}] Stage: HMAC_VERIFICATION, Status: SKIPPED, Reason: ${!webhookSecret ? 'No secret configured' : 'No signature provided'}`);
    }

    // Enhanced logging: Stage 3 - JSON Parsing
    console.log(`[${correlationId}] Stage: JSON_PARSING, Status: ATTEMPTING, BodyLength: ${rawBody.length}`);
    
    let rawPayload: unknown;
    try {
      rawPayload = JSON.parse(rawBody);
      console.log(`[${correlationId}] Stage: JSON_PARSING, Status: SUCCESS`);
    } catch (parseError) {
      console.error(`[${correlationId}] Stage: JSON_PARSING, Status: FAILED, Error: ${parseError instanceof Error ? parseError.message : 'Unknown error'}`);
      return new Response(
        JSON.stringify({ error: "Invalid JSON payload" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // === HANDLE CONTEXT WEBHOOKS (market context indicator) ===
    const payloadObj = rawPayload as Record<string, unknown>;
    if (payloadObj.type === 'CONTEXT') {
      console.log(`[${correlationId}] Stage: CONTEXT_WEBHOOK, Status: DETECTED, Ticker: ${payloadObj.ticker}`);
      
      try {
        const supabase = createDbClient();
        const contextPayload = rawPayload as ContextWebhookPayload;
        
        // Validate required fields
        if (!contextPayload.ticker || !contextPayload.price) {
          console.error(`[${correlationId}] Stage: CONTEXT_VALIDATION, Status: FAILED, Reason: Missing required fields`);
          return new Response(
            JSON.stringify({ 
              error: 'Invalid CONTEXT payload',
              details: 'Missing required fields: ticker or price'
            }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        
        console.log(`[${correlationId}] Stage: CONTEXT_STORAGE, Status: SAVING`);
        
        // Save full context to market context table
        const result = await saveContext(contextPayload);

        // Also persist refactored context snapshot for decision engine
        await supabase.from('refactored_context_snapshots').insert({
          id: crypto.randomUUID(),
          vix: contextPayload.volatility?.vix ?? 0,
          trend: (contextPayload.market?.spy_trend || 'NEUTRAL').toUpperCase(),
          bias: contextPayload.market?.market_bias === 'BULLISH'
            ? 1
            : contextPayload.market?.market_bias === 'BEARISH'
              ? -1
              : 0,
          regime: (contextPayload.volatility?.vix_regime || 'NORMAL').toUpperCase(),
          timestamp: new Date(contextPayload.timestamp).toISOString(),
        });
        
        if (!result) {
          console.error(`[${correlationId}] Stage: CONTEXT_STORAGE, Status: FAILED`);
          return new Response(
            JSON.stringify({ error: 'Failed to save context' }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        
        console.log(`[${correlationId}] Stage: CONTEXT_STORAGE, Status: SUCCESS, ContextId: ${result.id}`);
        
        return new Response(
          JSON.stringify({
            success: true,
            id: result.id,
            ticker: contextPayload.ticker,
            event: contextPayload.event,
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      } catch (error) {
        console.error(`[${correlationId}] Stage: CONTEXT_PROCESSING, Status: ERROR, Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
        return new Response(
          JSON.stringify({ 
            error: 'Failed to process context',
            details: error instanceof Error ? error.message : 'Unknown error'
          }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // === HANDLE TRADING SIGNALS ===
    console.log(`[${correlationId}] Stage: SIGNAL_PARSING, Status: DETECTING_SOURCE`);
    const indicatorSource = detectIndicatorSource(payloadObj);
    console.log(`[${correlationId}] Stage: SIGNAL_PARSING, Status: SOURCE_DETECTED, Source: ${indicatorSource}`);
    
    let parsedSignal: IncomingSignal | null = null;
    let parseErrors: string[] = [];
    let isTestPing = false;

    if (indicatorSource === 'tradingview') {
      const tvResult = parseTradingViewPayload(rawPayload);
      parsedSignal = tvResult.signal;
      parseErrors = tvResult.errors;
      console.log(`[${correlationId}] Stage: SIGNAL_PARSING, Status: ${parseErrors.length > 0 ? 'FAILED' : 'SUCCESS'}, Parser: TradingView, Errors: ${parseErrors.length}`);
    } else {
      const indicatorResult = parseIndicatorPayload(rawPayload, {
        scoreConfig: {
          minThreshold: 70,
          baseQuantity: 1,
          scalingFactor: 0.05,
          maxQuantity: 10,
        },
      });
      parsedSignal = indicatorResult.signal;
      parseErrors = indicatorResult.errors;
      isTestPing = indicatorResult.isTest;
      console.log(`[${correlationId}] Stage: SIGNAL_PARSING, Status: ${parseErrors.length > 0 ? 'FAILED' : 'SUCCESS'}, Parser: Indicator, Errors: ${parseErrors.length}, IsTest: ${isTestPing}`);
    }

    if (isTestPing) {
      console.log(`[${correlationId}] Stage: TEST_PING, Status: RECEIVED`);
      return new Response(
        JSON.stringify({
          status: "OK",
          message: "Test ping received",
          source: indicatorSource,
          correlation_id: correlationId,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!parsedSignal || parseErrors.length > 0) {
      console.error(`[${correlationId}] Stage: SIGNAL_PARSING, Status: REJECTED, Errors: ${JSON.stringify(parseErrors)}`);
      return new Response(
        JSON.stringify({
          status: "REJECTED",
          validation_errors: parseErrors.length > 0 ? parseErrors : ['Unable to parse signal'],
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[${correlationId}] Stage: SIGNAL_STORAGE, Status: CHECKING_DUPLICATE`);
    const supabase = createDbClient();
    const signalHash = await generateSignalHash(rawPayload as Record<string, unknown>);

    const { data: existingSignal } = await supabase
      .from("signals")
      .select("id, status")
      .eq("signal_hash", signalHash)
      .single();

    if (existingSignal) {
      console.log(`[${correlationId}] Stage: SIGNAL_STORAGE, Status: DUPLICATE_DETECTED, ExistingSignalId: ${existingSignal.id}`);
      return new Response(
        JSON.stringify({
          message: "Duplicate signal detected",
          signal_id: existingSignal.id,
          status: existingSignal.status,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[${correlationId}] Stage: SIGNAL_STORAGE, Status: INSERTING, Underlying: ${parsedSignal.underlying}, Strike: ${parsedSignal.strike}, Type: ${parsedSignal.option_type}`);
    const { data: insertedSignal, error: insertError } = await supabase
      .from("signals")
      .insert({
        source: indicatorSource,
        signal_hash: signalHash,
        raw_payload: rawPayload,
        signature_verified: signatureValid,
        action: parsedSignal.action,
        underlying: parsedSignal.underlying,
        strike: parsedSignal.strike,
        expiration: parsedSignal.expiration,
        option_type: parsedSignal.option_type,
        quantity: parsedSignal.quantity,
        strategy_type: parsedSignal.strategy_type || null,
        status: "PENDING",
        validation_errors: null,
      });

    if (insertError || !insertedSignal) {
      console.error(`[${correlationId}] Stage: SIGNAL_STORAGE, Status: FAILED, Error: ${insertError?.message || 'Unknown error'}`);
      return new Response(
        JSON.stringify({ error: "Failed to record signal" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[${correlationId}] Stage: SIGNAL_STORAGE, Status: SUCCESS, SignalId: ${insertedSignal.id}`);

    const pipelineSource = indicatorSource === 'mtf-trend-dots' ? 'MTF' : 'TRADINGVIEW';
    const pipelinePayload = buildPipelinePayload(
      parsedSignal,
      pipelineSource,
      rawPayload as Record<string, unknown>,
      signalHash,
      signatureValid
    );

    console.log(`[${correlationId}] Stage: PIPELINE_PROCESSING, Status: QUEUED, SignalId: ${insertedSignal.id}`);

    // Return HTTP 200 immediately to prevent timeouts (Requirement 1.4)
    // Process signal asynchronously
    processSignalAsync(
      pipelinePayload,
      correlationId,
      signatureValid,
      insertedSignal.id,
      signalHash
    ).catch(error => {
      console.error(`[${correlationId}] Stage: ASYNC_PROCESSING, Status: ERROR, Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    });

    const processingTime = Date.now() - startTime;
    metricsService.recordSignalProcessingLatency(processingTime);

    console.log(`[${correlationId}] Stage: WEBHOOK_RESPONSE, Status: SUCCESS, ProcessingTime: ${processingTime}ms`);

    return new Response(
      JSON.stringify({
        signal_id: insertedSignal.id,
        status: "PROCESSING",
        correlation_id: correlationId,
        processing_time_ms: processingTime,
        system: "REFACTORED",
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[${correlationId}] Webhook handler error:`, errorMessage);
    
    return new Response(
      JSON.stringify({
        error: "Internal server error",
        correlation_id: correlationId,
        details: errorMessage,
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      }
    );
  }
}

// Allow running standalone (Supabase edge / local dev)
if (import.meta.main) {
  Deno.serve(handleWebhook);
}

/**
 * Process signal asynchronously through the unified pipeline
 */
async function processSignalAsync(
  rawPayload: any,
  correlationId: string,
  signatureValid: boolean,
  signalId: string,
  signalHash: string
): Promise<void> {
  const supabase = createDbClient();
  const decisionStartTime = Date.now();
  
  try {
    console.log(`[${correlationId}] Stage: PIPELINE_PROCESSING, Status: STARTED`);
    
    // Process through unified pipeline
    const result = await pipeline.processSignal(rawPayload);
    
    const decisionTime = Date.now() - decisionStartTime;
    metricsService.recordDecisionLatency(decisionTime);
    
    console.log(`[${correlationId}] Stage: PIPELINE_PROCESSING, Status: COMPLETED, Success: ${result.success}, Stage: ${result.stage}, DecisionTime: ${decisionTime}ms`);
    
    // Log result
    if (result.success) {
      console.log(`[${correlationId}] Stage: DECISION_MADE, Status: SUCCESS, Decision: ${result.decision?.decision}, Confidence: ${result.decision?.confidence}, PositionSize: ${result.decision?.positionSize}`);
      
      metricsService.recordSignalAccepted();

      await supabase.from('signals').update({
        status: 'COMPLETED',
        processed_at: new Date().toISOString(),
        validation_errors: null,
      }).eq('id', signalId);
      
      console.log(`[${correlationId}] Stage: SIGNAL_UPDATE, Status: SUCCESS, NewStatus: COMPLETED`);
      
      // Store signal in database
      if (result.signal) {
        const metadata = {
          ...(result.signal.metadata || {}),
          correlation_id: correlationId,
          signature_valid: signatureValid,
          signal_hash: signalHash,
          original_signal_id: signalId,
          raw_payload: result.signal.metadata?.raw_payload ?? rawPayload,
        };

        await supabase.from('refactored_signals').insert({
          id: result.trackingId,
          source: result.signal.source,
          symbol: result.signal.symbol,
          direction: result.signal.direction,
          timeframe: result.signal.timeframe,
          timestamp: result.signal.timestamp.toISOString(),
          metadata,
          validation_result: {
            valid: true,
            stage: result.stage,
          },
          created_at: new Date().toISOString(),
        });
        
        console.log(`[${correlationId}] Stage: REFACTORED_SIGNAL_STORAGE, Status: SUCCESS, TrackingId: ${result.trackingId}`);
      }

      if (result.decision?.decision === 'ENTER' && result.signal) {
        console.log(`[${correlationId}] Stage: ORDER_CREATION, Status: PREPARING`);
        
        const parsedSignal = (result.signal.metadata?.parsed_signal ?? null) as IncomingSignal | null;
        if (!parsedSignal) {
          console.warn(`[${correlationId}] Stage: ORDER_CREATION, Status: SKIPPED, Reason: Missing parsed signal metadata`);
        } else if (parsedSignal.action === 'CLOSE') {
          console.warn(`[${correlationId}] Stage: ORDER_CREATION, Status: SKIPPED, Reason: CLOSE action with ENTER decision`);
        } else {
          const orderSide = resolveOrderSide(parsedSignal.action);
          const orderType = resolveOrderType(parsedSignal.order_type);
          const occSymbol = generateOccSymbol(
            parsedSignal.underlying,
            parsedSignal.expiration,
            parsedSignal.option_type,
            parsedSignal.strike
          );

          const orderRequest: OrderRequest = {
            signal_id: signalId,
            underlying: parsedSignal.underlying,
            symbol: occSymbol,
            strike: parsedSignal.strike,
            expiration: parsedSignal.expiration,
            option_type: parsedSignal.option_type,
            side: orderSide,
            quantity: Math.max(1, result.decision.positionSize || parsedSignal.quantity || 1),
            order_type: orderType,
            limit_price: parsedSignal.limit_price,
            stop_price: parsedSignal.stop_price,
            time_in_force: parsedSignal.time_in_force || 'DAY',
          };

          console.log(`[${correlationId}] Stage: ORDER_SUBMISSION, Status: SUBMITTING, Symbol: ${occSymbol}, Quantity: ${orderRequest.quantity}`);

          const { adapter, safety_result, warnings } = createAdapter({
            paper_config: {
              slippage_percent: 0.1,
              commission_per_contract: 0.65,
              fee_per_contract: 0.02,
            },
          });

          if (warnings.length > 0) {
            console.warn(`[${correlationId}] Stage: ADAPTER_CREATION, Status: WARNING, Warnings: ${JSON.stringify(warnings)}`);
          }

          const basePrice = resolveEntryPrice(parsedSignal, result.signal.metadata || {}) ?? 1.5;
          const { result: orderResult, trade } = await adapter.submitOrder(orderRequest, basePrice);

          console.log(`[${correlationId}] Stage: ORDER_SUBMISSION, Status: ${orderResult.success ? 'SUCCESS' : 'FAILED'}, OrderStatus: ${orderResult.status}, BrokerOrderId: ${orderResult.broker_order_id}`);

          await supabase.from('adapter_logs').insert({
            correlation_id: correlationId,
            adapter_name: adapter.name,
            operation: 'SUBMIT_ORDER',
            request_payload: orderRequest,
            response_payload: orderResult,
            status: orderResult.success ? 'SUCCESS' : 'FAILURE',
            duration_ms: Date.now() - decisionStartTime,
          });

          const { data: orderRow, error: orderError } = await supabase
            .from('orders')
            .insert({
              signal_id: signalId,
              broker_order_id: orderResult.broker_order_id,
              client_order_id: `CLT-${signalId.substring(0, 8)}-${Date.now()}`,
              underlying: orderRequest.underlying,
              symbol: orderRequest.symbol,
              strike: orderRequest.strike,
              expiration: orderRequest.expiration,
              option_type: orderRequest.option_type,
              side: orderRequest.side,
              quantity: orderRequest.quantity,
              order_type: orderRequest.order_type,
              limit_price: orderRequest.limit_price || null,
              stop_price: orderRequest.stop_price || null,
              time_in_force: orderRequest.time_in_force,
              mode: adapter.mode,
              status: orderResult.status,
              filled_quantity: orderResult.filled_quantity,
              avg_fill_price: orderResult.avg_fill_price || null,
              submitted_at: new Date().toISOString(),
              filled_at: orderResult.status === 'FILLED' ? new Date().toISOString() : null,
            })
            .select('*')
            .single();

          if (orderError) {
            console.error(`[${correlationId}] Stage: ORDER_STORAGE, Status: FAILED, Error: ${orderError.message}`);
          } else {
            console.log(`[${correlationId}] Stage: ORDER_STORAGE, Status: SUCCESS, OrderId: ${orderRow?.id}`);
          }

          if (orderRow && orderResult.status === 'FILLED' && trade) {
            console.log(`[${correlationId}] Stage: TRADE_EXECUTION, Status: FILLED, ExecutionPrice: ${trade.execution_price}, Quantity: ${trade.quantity}`);
            
            await supabase.from('trades').insert({
              order_id: orderRow.id,
              broker_trade_id: trade.broker_trade_id || null,
              execution_price: trade.execution_price,
              quantity: trade.quantity,
              commission: trade.commission,
              fees: trade.fees,
              total_cost: trade.total_cost,
              underlying: orderRequest.underlying,
              symbol: orderRequest.symbol,
              strike: orderRequest.strike,
              expiration: orderRequest.expiration,
              option_type: orderRequest.option_type,
              executed_at: trade.executed_at,
            });

            console.log(`[${correlationId}] Stage: TRADE_STORAGE, Status: SUCCESS`);

            await supabase
              .from('refactored_positions')
              .update({
                entry_price: trade.execution_price,
                updated_at: new Date().toISOString(),
              })
              .eq('signal_id', result.trackingId);
              
            console.log(`[${correlationId}] Stage: POSITION_UPDATE, Status: SUCCESS, EntryPrice: ${trade.execution_price}`);
          }
        }
      } else {
        console.log(`[${correlationId}] Stage: ORDER_CREATION, Status: SKIPPED, Reason: Decision was ${result.decision?.decision || 'unknown'}`);
      }
    } else {
      console.log(`[${correlationId}] Stage: PIPELINE_PROCESSING, Status: FAILED, Stage: ${result.stage}, Reason: ${result.failureReason}`);
      
      metricsService.recordSignalRejected(result.failureReason || 'Unknown reason');

      await supabase.from('signals').update({
        status: 'REJECTED',
        processed_at: new Date().toISOString(),
        validation_errors: [{
          stage: result.stage,
          reason: result.failureReason || 'Unknown failure',
        }],
      }).eq('id', signalId);
      
      console.log(`[${correlationId}] Stage: SIGNAL_UPDATE, Status: SUCCESS, NewStatus: REJECTED`);
      
      // Store failure in database (signal + pipeline failure)
      if (result.signal) {
        const metadata = {
          ...(result.signal.metadata || {}),
          correlation_id: correlationId,
          signature_valid: signatureValid,
          signal_hash: signalHash,
          original_signal_id: signalId,
          raw_payload: result.signal.metadata?.raw_payload ?? rawPayload,
        };

        await supabase.from('refactored_signals').insert({
          id: result.trackingId,
          source: result.signal.source,
          symbol: result.signal.symbol,
          direction: result.signal.direction,
          timeframe: result.signal.timeframe,
          timestamp: result.signal.timestamp.toISOString(),
          metadata,
          validation_result: {
            valid: false,
            rejection_reason: result.failureReason,
            stage: result.stage,
          },
          created_at: new Date().toISOString(),
        });
        
        console.log(`[${correlationId}] Stage: REFACTORED_SIGNAL_STORAGE, Status: SUCCESS, TrackingId: ${result.trackingId}, Valid: false`);
      }

      await supabase.from('refactored_pipeline_failures').insert({
        id: crypto.randomUUID(),
        tracking_id: result.trackingId || correlationId,
        signal_id: result.signal?.id || null,
        stage: result.stage,
        reason: result.failureReason || 'Unknown failure',
        signal_data: result.signal || rawPayload,
        timestamp: new Date().toISOString(),
      });
      
      console.log(`[${correlationId}] Stage: FAILURE_STORAGE, Status: SUCCESS`);
    }
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[${correlationId}] Stage: PROCESSING_ERROR, Status: EXCEPTION, Error: ${errorMessage}, Stack: ${error instanceof Error ? error.stack : 'N/A'}`);
    
    metricsService.recordSignalRejected('Processing error');

    try {
      await supabase.from('signals').update({
        status: 'FAILED',
        processed_at: new Date().toISOString(),
        validation_errors: [{
          stage: 'PROCESSING',
          reason: errorMessage,
        }],
      }).eq('id', signalId);
      
      console.log(`[${correlationId}] Stage: ERROR_SIGNAL_UPDATE, Status: SUCCESS`);
    } catch (updateError) {
      console.error(`[${correlationId}] Stage: ERROR_SIGNAL_UPDATE, Status: FAILED, Error: ${updateError instanceof Error ? updateError.message : 'Unknown error'}`);
    }
    
    // Log error to database
    try {
      await supabase.from('refactored_processing_errors').insert({
        correlation_id: correlationId,
        error_message: errorMessage,
        raw_payload: rawPayload,
        created_at: new Date().toISOString(),
      });
      
      console.log(`[${correlationId}] Stage: ERROR_STORAGE, Status: SUCCESS`);
    } catch (dbError) {
      console.error(`[${correlationId}] Stage: ERROR_STORAGE, Status: FAILED, Error: ${dbError instanceof Error ? dbError.message : 'Unknown error'}`);
    }
  }
}

