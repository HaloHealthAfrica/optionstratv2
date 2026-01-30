import { corsHeaders } from "../_shared/cors.ts";
import { createDbClient } from "../_shared/db-client.ts";
import { getMarketDataService } from "../_shared/market-data/index.ts";
import { createAdapter } from "../_shared/adapter-factory.ts";
import { generateOccSymbol, type OrderRequest } from "../_shared/types.ts";

import { DecisionOrchestrator } from "../_shared/refactored/orchestrator/decision-orchestrator.ts";
import { ContextCache } from "../_shared/refactored/cache/context-cache.ts";
import { GEXService } from "../_shared/refactored/services/gex-service.ts";
import { PositionManager } from "../_shared/refactored/services/position-manager.ts";
import { RiskManager } from "../_shared/refactored/services/risk-manager.ts";
import { PositionSizingService } from "../_shared/refactored/services/position-sizing-service.ts";
import { ConfluenceCalculator } from "../_shared/refactored/services/confluence-calculator.ts";
import { defaultConfig } from "../_shared/refactored/core/config.ts";
import { AuditLogger, type AuditLogEntry } from "../_shared/refactored/monitoring/audit-logger.ts";
import { MetricsService } from "../_shared/refactored/monitoring/metrics-service.ts";
import { DegradedModeTracker } from "../_shared/refactored/monitoring/degraded-mode-tracker.ts";
import type { Position } from "../_shared/refactored/core/types.ts";

type ContractDetails = {
  underlying?: string;
  strike?: number;
  expiration?: string;
  optionType?: 'CALL' | 'PUT';
  timeframe?: string;
  originalSignalId?: string | null;
};

function initializeExitEngine() {
  const supabase = createDbClient();

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
      throw new Error(`Failed to persist exit decision audit: ${error.message}`);
    }
  });

  const metricsService = new MetricsService();
  const degradedModeTracker = new DegradedModeTracker();

  const fetchContext = async () => {
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
  };

  const contextCache = new ContextCache(defaultConfig, fetchContext);
  const gexService = new GEXService(supabase, defaultConfig, degradedModeTracker);
  const positionManager = new PositionManager(supabase, defaultConfig);
  const riskManager = new RiskManager(defaultConfig);
  const positionSizingService = new PositionSizingService(defaultConfig);
  const confluenceCalculator = new ConfluenceCalculator();

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

  return { supabase, orchestrator, positionManager, metricsService };
}

async function resolveContractDetails(
  supabase: ReturnType<typeof createDbClient>,
  signalId: string,
  fallback: ContractDetails
): Promise<ContractDetails> {
  if (fallback.underlying && fallback.strike && fallback.expiration && fallback.optionType) {
    return fallback;
  }

  const { data: signalRow } = await supabase
    .from('refactored_signals')
    .select('symbol, timeframe, metadata')
    .eq('id', signalId)
    .single();

  const metadata = (signalRow?.metadata ?? {}) as Record<string, unknown>;
  const parsed = metadata.parsed_signal as Record<string, unknown> | undefined;

  return {
    underlying: fallback.underlying ?? (typeof parsed?.underlying === 'string' ? parsed.underlying : signalRow?.symbol),
    strike: fallback.strike ?? (typeof parsed?.strike === 'number' ? parsed.strike : undefined),
    expiration: fallback.expiration ?? (typeof parsed?.expiration === 'string' ? parsed.expiration : undefined),
    optionType: fallback.optionType ?? (typeof parsed?.option_type === 'string' ? parsed.option_type as 'CALL' | 'PUT' : undefined),
    timeframe: fallback.timeframe ?? signalRow?.timeframe,
    originalSignalId: typeof metadata.original_signal_id === 'string' ? metadata.original_signal_id : null,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { supabase, orchestrator, positionManager, metricsService } = initializeExitEngine();
    const url = new URL(req.url);
    const dryRun = url.searchParams.get('dry_run') === 'true';

    const { data: openPositions, error } = await supabase
      .from('refactored_positions')
      .select('*')
      .eq('status', 'OPEN');

    if (error) {
      throw new Error(`Failed to fetch open positions: ${error.message}`);
    }

    await positionManager.loadPositions();

    const marketDataService = getMarketDataService();
    const results: Array<Record<string, unknown>> = [];

    for (const row of openPositions || []) {
      const contractDetails = await resolveContractDetails(supabase, row.signal_id, {
        underlying: row.underlying ?? undefined,
        strike: row.strike ?? undefined,
        expiration: row.expiration ?? undefined,
        optionType: row.option_type ?? undefined,
        timeframe: row.timeframe ?? undefined,
      });

      if (!contractDetails.underlying || !contractDetails.strike || !contractDetails.expiration || !contractDetails.optionType) {
        results.push({
          position_id: row.id,
          status: 'SKIPPED',
          reason: 'Missing contract details',
        });
        continue;
      }

      const quoteResult = await marketDataService.getOptionQuote(
        contractDetails.underlying,
        contractDetails.expiration,
        contractDetails.strike,
        contractDetails.optionType
      );

      if (!quoteResult.success || !quoteResult.data) {
        results.push({
          position_id: row.id,
          status: 'SKIPPED',
          reason: 'Market data unavailable',
          error: quoteResult.error,
        });
        continue;
      }

      const currentPrice = quoteResult.data.mid ?? quoteResult.data.last;
      if (!currentPrice || currentPrice <= 0) {
        results.push({
          position_id: row.id,
          status: 'SKIPPED',
          reason: 'Invalid market price',
        });
        continue;
      }

      const position: Position = {
        id: row.id,
        signalId: row.signal_id,
        symbol: row.symbol,
        direction: row.direction,
        quantity: row.quantity,
        entryPrice: row.entry_price,
        entryTime: new Date(row.entry_time),
        currentPrice,
        unrealizedPnL: row.unrealized_pnl ?? undefined,
        status: row.status,
        underlying: contractDetails.underlying,
        strike: contractDetails.strike,
        expiration: contractDetails.expiration,
        optionType: contractDetails.optionType,
        timeframe: contractDetails.timeframe,
      };

      const decisionStart = Date.now();
      const decision = await orchestrator.orchestrateExitDecision(position);
      metricsService.recordDecisionLatency(Date.now() - decisionStart);

      if (decision.decision !== 'EXIT') {
        results.push({
          position_id: row.id,
          status: 'HOLD',
          reason: decision.reasoning.join('; '),
        });
        continue;
      }

      const isPartialExit = decision.exitReason === 'PROFIT_TARGET' && position.quantity > 1;
      const exitQuantity = isPartialExit
        ? Math.max(1, Math.floor(position.quantity / 2))
        : Math.abs(position.quantity);

      if (dryRun) {
        results.push({
          position_id: row.id,
          status: 'DRY_RUN',
          exit_reason: decision.exitReason,
          exit_action: isPartialExit ? 'PARTIAL' : 'FULL',
          exit_quantity: exitQuantity,
          current_price: currentPrice,
        });
        continue;
      }

      const occSymbol = generateOccSymbol(
        contractDetails.underlying,
        contractDetails.expiration,
        contractDetails.optionType,
        contractDetails.strike
      );

      const orderRequest: OrderRequest = {
        signal_id: contractDetails.originalSignalId ?? null,
        underlying: contractDetails.underlying,
        symbol: occSymbol,
        strike: contractDetails.strike,
        expiration: contractDetails.expiration,
        option_type: contractDetails.optionType,
        side: 'SELL_TO_CLOSE',
        quantity: exitQuantity,
        order_type: 'MARKET',
        time_in_force: 'DAY',
      };

      const { adapter, warnings } = createAdapter({
        paper_config: {
          slippage_percent: 0.1,
          commission_per_contract: 0.65,
          fee_per_contract: 0.02,
        },
      });

      if (warnings.length > 0) {
        console.warn(`[ExitWorker] Adapter warnings:`, warnings);
      }

      const { result: orderResult, trade } = await adapter.submitOrder(orderRequest, currentPrice);

      await supabase.from('adapter_logs').insert({
        correlation_id: crypto.randomUUID(),
        adapter_name: adapter.name,
        operation: 'SUBMIT_ORDER',
        request_payload: orderRequest,
        response_payload: orderResult,
        status: orderResult.success ? 'SUCCESS' : 'FAILURE',
        duration_ms: Date.now() - decisionStart,
      });

      const { data: orderRow } = await supabase
        .from('orders')
        .insert({
          signal_id: contractDetails.originalSignalId ?? null,
          refactored_position_id: position.id,
          exit_action: isPartialExit ? 'PARTIAL' : 'FULL',
          exit_quantity: exitQuantity,
          broker_order_id: orderResult.broker_order_id,
          client_order_id: `CLT-EXIT-${row.id.substring(0, 8)}-${Date.now()}`,
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

      if (orderRow && orderResult.status === 'FILLED' && trade) {
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

        if (isPartialExit) {
          const realized = (trade.execution_price - position.entryPrice) * exitQuantity * 100;
          const remainingQty = Math.max(0, position.quantity - exitQuantity);

          await supabase
            .from('refactored_positions')
            .update({
              quantity: remainingQty,
              realized_pnl: (row.realized_pnl ?? 0) + realized,
              current_price: trade.execution_price,
              updated_at: new Date().toISOString(),
              status: remainingQty === 0 ? 'CLOSED' : 'OPEN',
              exit_price: remainingQty === 0 ? trade.execution_price : null,
              exit_time: remainingQty === 0 ? new Date().toISOString() : null,
            })
            .eq('id', position.id);
        } else {
          await positionManager.closePosition(position.id, trade.execution_price);
        }
      }

      results.push({
        position_id: row.id,
        status: orderResult.status,
        exit_reason: decision.exitReason,
        exit_action: isPartialExit ? 'PARTIAL' : 'FULL',
        exit_quantity: exitQuantity,
      });
    }

    return new Response(
      JSON.stringify({
        success: true,
        dry_run: dryRun,
        processed: results.length,
        results,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error('[RefactoredExitWorker] Error:', error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'Unknown error',
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
