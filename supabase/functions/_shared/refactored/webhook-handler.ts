/**
 * Refactored Webhook Handler
 * 
 * Routes all incoming signals to the unified SignalPipeline
 * 
 * Requirements: 1.4
 */

import { corsHeaders } from "../cors.ts";
import { SignalPipeline } from "./pipeline/signal-pipeline.ts";
import { SignalNormalizer } from "./pipeline/signal-normalizer.ts";
import { SignalValidator } from "./validation/signal-validator.ts";
import { DeduplicationCache } from "./cache/deduplication-cache.ts";
import { DecisionOrchestrator } from "./orchestrator/decision-orchestrator.ts";
import { ContextCache } from "./cache/context-cache.ts";
import { GEXService } from "./services/gex-service.ts";
import { PositionManager } from "./services/position-manager.ts";
import { RiskManager } from "./services/risk-manager.ts";
import { PositionSizingService } from "./services/position-sizing-service.ts";
import { ConfluenceCalculator } from "./services/confluence-calculator.ts";
import { defaultConfig } from "./core/config.ts";
import { createSupabaseClient } from "../supabase-client.ts";
import { DegradedModeTracker } from "./monitoring/degraded-mode-tracker.ts";
import { AuditLogger } from "./monitoring/audit-logger.ts";

/**
 * Initialize the unified signal processing pipeline
 */
function initializePipeline(): SignalPipeline {
  const supabase = createSupabaseClient();
  const degradedModeTracker = new DegradedModeTracker();
  const auditLogger = new AuditLogger();

  const fetchContext = async () => {
    const { data, error } = await supabase
      .from('refactored_context_snapshots')
      .select('*')
      .order('timestamp', { ascending: false })
      .limit(1)
      .single();

    if (error || !data) {
      throw new Error('Context fetch failed');
    }

    return {
      vix: data.vix,
      trend: data.trend as 'BULLISH' | 'BEARISH' | 'NEUTRAL',
      bias: data.bias,
      regime: data.regime as 'LOW_VOL' | 'HIGH_VOL' | 'NORMAL',
      timestamp: new Date(data.timestamp),
    };
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
  
  // Create and return pipeline
  return new SignalPipeline(
    normalizer,
    validator,
    deduplicationCache,
    orchestrator,
    positionManager,
    defaultConfig,
    auditLogger
  );
}

// Initialize pipeline once at module load
const pipeline = initializePipeline();

/**
 * Webhook request handler
 * 
 * Requirements: 1.4
 */
export async function handleWebhookRequest(req: Request): Promise<Response> {
  const correlationId = crypto.randomUUID();
  const startTime = Date.now();
  
  console.log(`[${correlationId}] Webhook request received`);
  
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  
  // Only accept POST requests
  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      { 
        status: 405, 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      }
    );
  }
  
  try {
    // Parse request body
    const rawBody = await req.text();
    let rawPayload: any;
    
    try {
      rawPayload = JSON.parse(rawBody);
    } catch (error) {
      console.error(`[${correlationId}] Invalid JSON payload:`, error);
      return new Response(
        JSON.stringify({ 
          error: "Invalid JSON payload",
          correlation_id: correlationId,
        }),
        { 
          status: 400, 
          headers: { ...corsHeaders, "Content-Type": "application/json" } 
        }
      );
    }
    
    // Validate authentication (optional - implement based on your needs)
    const signature = req.headers.get("x-signature");
    const webhookSecret = Deno.env.get("WEBHOOK_SECRET");
    
    if (webhookSecret && signature) {
      // TODO: Implement signature verification
      // const isValid = await verifySignature(rawBody, signature, webhookSecret);
      // if (!isValid) {
      //   return new Response(
      //     JSON.stringify({ error: "Invalid signature" }),
      //     { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      //   );
      // }
    }
    
    // Return HTTP 200 immediately to prevent timeouts (Requirement 1.4)
    // Process signal asynchronously
    processSignalAsync(rawPayload, correlationId).catch(error => {
      console.error(`[${correlationId}] Async processing error:`, error);
    });
    
    const processingTime = Date.now() - startTime;
    
    return new Response(
      JSON.stringify({
        status: "ACCEPTED",
        message: "Signal received and queued for processing",
        correlation_id: correlationId,
        processing_time_ms: processingTime,
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
}

/**
 * Process signal asynchronously through the unified pipeline
 */
async function processSignalAsync(rawPayload: any, correlationId: string): Promise<void> {
  const supabase = createSupabaseClient();
  
  try {
    console.log(`[${correlationId}] Processing signal through unified pipeline...`);
    
    // Process through unified pipeline
    const result = await pipeline.processSignal(rawPayload);
    
    // Log result
    if (result.success) {
      console.log(`[${correlationId}] Signal processed successfully:`, {
        tracking_id: result.trackingId,
        symbol: result.signal?.symbol,
        decision: result.decision?.decision,
        confidence: result.decision?.confidence,
        position_size: result.decision?.positionSize,
      });
      
      // Decision persistence handled via AuditLogger
    } else {
      console.log(`[${correlationId}] Signal processing failed:`, {
        tracking_id: result.trackingId,
        stage: result.stage,
        reason: result.failureReason,
      });
      
      // Store failure in database
      await supabase.from('refactored_signals').insert({
        id: result.trackingId,
        source: result.signal?.source || 'UNKNOWN',
        symbol: result.signal?.symbol || 'UNKNOWN',
        direction: result.signal?.direction || 'CALL',
        timeframe: result.signal?.timeframe || '5m',
        timestamp: result.signal?.timestamp?.toISOString() || new Date().toISOString(),
        metadata: result.signal?.metadata || {},
        validation_result: {
          valid: false,
          rejection_reason: result.failureReason,
          stage: result.stage,
        },
        created_at: new Date().toISOString(),
      });
    }
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[${correlationId}] Signal processing error:`, errorMessage);
    
    // Log error to database
    try {
      await supabase.from('processing_errors').insert({
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

/**
 * Deno serve handler
 */
export default async function serve(req: Request): Promise<Response> {
  return handleWebhookRequest(req);
}
