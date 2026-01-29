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
import { createSupabaseClient } from "../_shared/supabase-client.ts";
import { verifyHmacSignature } from "../_shared/hmac.ts";
import { saveContext } from "../_shared/market-context-service.ts";
import type { ContextWebhookPayload } from "../_shared/market-context-types.ts";

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
  const supabase = createSupabaseClient();
  
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

// Initialize pipeline once at module load
const { pipeline, auditLogger, metricsService, degradedModeTracker } = initializePipeline();

console.log('[WEBHOOK] Initialized with refactored SignalPipeline and DecisionOrchestrator');

/**
 * Main webhook handler
 */
Deno.serve(async (req) => {
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

  try {
    // Get raw body for signature verification
    const rawBody = await req.text();
    const signature = req.headers.get("x-signature") || "";
    const webhookSecret = Deno.env.get("WEBHOOK_SECRET");

    // Verify HMAC signature when configured
    let signatureValid: boolean | null = null;
    if (webhookSecret) {
      signatureValid = signature
        ? await verifyHmacSignature(rawBody, signature, webhookSecret)
        : false;

      if (!signatureValid) {
        return new Response(
          JSON.stringify({ error: "Invalid signature" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Parse JSON payload
    let rawPayload: unknown;
    try {
      rawPayload = JSON.parse(rawBody);
    } catch {
      return new Response(
        JSON.stringify({ error: "Invalid JSON payload" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // === HANDLE CONTEXT WEBHOOKS (market context indicator) ===
    const payloadObj = rawPayload as Record<string, unknown>;
    if (payloadObj.type === 'CONTEXT') {
      console.log(`[${correlationId}] Received CONTEXT webhook for ${payloadObj.ticker}`);
      
      try {
        const supabase = createSupabaseClient();
        const contextPayload = rawPayload as ContextWebhookPayload;
        
        // Validate required fields
        if (!contextPayload.ticker || !contextPayload.price) {
          return new Response(
            JSON.stringify({ 
              error: 'Invalid CONTEXT payload',
              details: 'Missing required fields: ticker or price'
            }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        
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
          return new Response(
            JSON.stringify({ error: 'Failed to save context' }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        
        console.log(`[${correlationId}] Context saved: ${result.id} for ${contextPayload.ticker}`);
        
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
        console.error(`[${correlationId}] Error processing CONTEXT webhook:`, error);
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
    console.log(`[${correlationId}] Processing trading signal through unified pipeline...`);
    
    // Return HTTP 200 immediately to prevent timeouts (Requirement 1.4)
    // Process signal asynchronously
    processSignalAsync(rawPayload, correlationId, signatureValid).catch(error => {
      console.error(`[${correlationId}] Async processing error:`, error);
    });
    
    const processingTime = Date.now() - startTime;
    metricsService.recordSignalProcessingLatency(processingTime);
    
    return new Response(
      JSON.stringify({
        status: "ACCEPTED",
        message: "Signal received and queued for processing",
        correlation_id: correlationId,
        processing_time_ms: processingTime,
        system: "REFACTORED",
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
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
});

/**
 * Process signal asynchronously through the unified pipeline
 */
async function processSignalAsync(
  rawPayload: any,
  correlationId: string,
  signatureValid: boolean | null
): Promise<void> {
  const supabase = createSupabaseClient();
  const decisionStartTime = Date.now();
  
  try {
    console.log(`[${correlationId}] Processing signal through unified pipeline...`);
    
    // Process through unified pipeline
    const result = await pipeline.processSignal(rawPayload);
    
    const decisionTime = Date.now() - decisionStartTime;
    metricsService.recordDecisionLatency(decisionTime);
    
    // Log result
    if (result.success) {
      console.log(`[${correlationId}] ✅ Signal processed successfully:`, {
        tracking_id: result.trackingId,
        symbol: result.signal?.symbol,
        decision: result.decision?.decision,
        confidence: result.decision?.confidence,
        position_size: result.decision?.positionSize,
      });
      
      metricsService.recordSignalAccepted();
      
      // Store signal in database
      if (result.signal) {
        const metadata = {
          ...(result.signal.metadata || {}),
          correlation_id: correlationId,
          signature_valid: signatureValid,
          raw_payload: rawPayload,
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
      }
    } else {
      console.log(`[${correlationId}] ❌ Signal processing failed:`, {
        tracking_id: result.trackingId,
        stage: result.stage,
        reason: result.failureReason,
      });
      
      metricsService.recordSignalRejected(result.failureReason || 'Unknown reason');
      
      // Store failure in database (signal + pipeline failure)
      if (result.signal) {
        const metadata = {
          ...(result.signal.metadata || {}),
          correlation_id: correlationId,
          signature_valid: signatureValid,
          raw_payload: rawPayload,
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
    }
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[${correlationId}] Signal processing error:`, errorMessage);
    
    metricsService.recordSignalRejected('Processing error');
    
    // Log error to database
    try {
      await supabase.from('refactored_processing_errors').insert({
        correlation_id: correlationId,
        error_message: errorMessage,
        raw_payload: rawPayload,
        created_at: new Date().toISOString(),
      });
    } catch (dbError) {
      console.error(`[${correlationId}] Failed to log error to database:`, dbError);
    }
  }
}
