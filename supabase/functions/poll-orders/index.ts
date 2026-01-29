/**
 * Poll Orders Edge Function
 * Polls pending live orders and updates their status from the broker
 * Designed to run on a 30-second cron schedule
 */

import { corsHeaders } from "../_shared/cors.ts";
import { createSupabaseClient } from "../_shared/supabase-client.ts";
import { getCurrentTradingMode, isBrokerConfigured, validateSafetyGates } from "../_shared/broker-adapter.ts";

interface OrderStatusUpdate {
  order_id: string;
  broker_order_id: string;
  status: string;
  filled_quantity?: number;
  avg_fill_price?: number;
  error_message?: string;
}

interface TradierOrderStatus {
  id: number;
  status: 'pending' | 'open' | 'partially_filled' | 'filled' | 'canceled' | 'expired' | 'rejected';
  exec_quantity?: number;
  avg_fill_price?: number;
  reason_description?: string;
}

interface AlpacaOrderStatus {
  id: string;
  status: 'new' | 'partially_filled' | 'filled' | 'done_for_day' | 'canceled' | 'expired' | 'replaced' | 'pending_cancel' | 'pending_replace' | 'accepted' | 'pending_new' | 'accepted_for_bidding' | 'stopped' | 'rejected' | 'suspended' | 'calculated';
  filled_qty?: string;
  filled_avg_price?: string;
  failed_at?: string;
}

// Map broker status to our internal status
function mapTradierStatus(status: TradierOrderStatus['status']): string {
  switch (status) {
    case 'pending':
    case 'open':
      return 'PENDING';
    case 'partially_filled':
      return 'PARTIAL';
    case 'filled':
      return 'FILLED';
    case 'canceled':
      return 'CANCELLED';
    case 'expired':
      return 'EXPIRED';
    case 'rejected':
      return 'REJECTED';
    default:
      return 'UNKNOWN';
  }
}

function mapAlpacaStatus(status: AlpacaOrderStatus['status']): string {
  switch (status) {
    case 'new':
    case 'accepted':
    case 'pending_new':
    case 'accepted_for_bidding':
      return 'PENDING';
    case 'partially_filled':
      return 'PARTIAL';
    case 'filled':
      return 'FILLED';
    case 'canceled':
    case 'done_for_day':
      return 'CANCELLED';
    case 'expired':
      return 'EXPIRED';
    case 'rejected':
    case 'suspended':
      return 'REJECTED';
    default:
      return 'UNKNOWN';
  }
}

async function pollTradierOrder(brokerOrderId: string): Promise<OrderStatusUpdate | null> {
  const apiKey = Deno.env.get('TRADIER_API_KEY');
  const accountId = Deno.env.get('TRADIER_ACCOUNT_ID');
  
  if (!apiKey || !accountId) {
    return null;
  }

  const baseUrl = Deno.env.get('TRADIER_BASE_URL') || 'https://api.tradier.com/v1';
  
  try {
    const response = await fetch(
      `${baseUrl}/accounts/${accountId}/orders/${brokerOrderId}`,
      {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Accept': 'application/json',
        },
      }
    );

    if (!response.ok) {
      console.error(`Tradier order poll failed: ${response.status}`);
      return null;
    }

    const data = await response.json();
    const order = data.order as TradierOrderStatus;

    return {
      order_id: '', // Will be filled by caller
      broker_order_id: brokerOrderId,
      status: mapTradierStatus(order.status),
      filled_quantity: order.exec_quantity,
      avg_fill_price: order.avg_fill_price,
      error_message: order.reason_description,
    };
  } catch (error) {
    console.error('Tradier poll error:', error);
    return null;
  }
}

async function pollAlpacaOrder(brokerOrderId: string): Promise<OrderStatusUpdate | null> {
  const apiKey = Deno.env.get('ALPACA_API_KEY');
  const secretKey = Deno.env.get('ALPACA_SECRET_KEY');
  
  if (!apiKey || !secretKey) {
    return null;
  }

  const baseUrl = Deno.env.get('ALPACA_BASE_URL') || 'https://api.alpaca.markets/v2';
  
  try {
    const response = await fetch(
      `${baseUrl}/orders/${brokerOrderId}`,
      {
        headers: {
          'APCA-API-KEY-ID': apiKey,
          'APCA-API-SECRET-KEY': secretKey,
        },
      }
    );

    if (!response.ok) {
      console.error(`Alpaca order poll failed: ${response.status}`);
      return null;
    }

    const order = await response.json() as AlpacaOrderStatus;

    return {
      order_id: '', // Will be filled by caller
      broker_order_id: brokerOrderId,
      status: mapAlpacaStatus(order.status),
      filled_quantity: order.filled_qty ? parseFloat(order.filled_qty) : undefined,
      avg_fill_price: order.filled_avg_price ? parseFloat(order.filled_avg_price) : undefined,
    };
  } catch (error) {
    console.error('Alpaca poll error:', error);
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createSupabaseClient();
    const safetyGates = validateSafetyGates();
    
    // Only poll in LIVE mode
    if (safetyGates.mode !== 'LIVE') {
      return new Response(
        JSON.stringify({
          message: 'Order polling skipped - not in LIVE mode',
          mode: safetyGates.mode,
          orders_polled: 0,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fetch pending orders with broker_order_id
    const { data: pendingOrders, error: fetchError } = await supabase
      .from('orders')
      .select('id, broker_order_id, mode')
      .eq('mode', 'LIVE')
      .in('status', ['PENDING', 'PARTIAL', 'SUBMITTED'])
      .not('broker_order_id', 'is', null);

    if (fetchError) {
      throw new Error(`Failed to fetch pending orders: ${fetchError.message}`);
    }

    if (!pendingOrders || pendingOrders.length === 0) {
      return new Response(
        JSON.stringify({
          message: 'No pending orders to poll',
          orders_polled: 0,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const updates: OrderStatusUpdate[] = [];
    const preferredBroker = Deno.env.get('PREFERRED_BROKER') || 'tradier';

    // Poll each pending order
    for (const order of pendingOrders) {
      let statusUpdate: OrderStatusUpdate | null = null;

      if (preferredBroker === 'tradier' && isBrokerConfigured('tradier')) {
        statusUpdate = await pollTradierOrder(order.broker_order_id);
      } else if (preferredBroker === 'alpaca' && isBrokerConfigured('alpaca')) {
        statusUpdate = await pollAlpacaOrder(order.broker_order_id);
      }

      if (statusUpdate) {
        statusUpdate.order_id = order.id;
        updates.push(statusUpdate);
      }
    }

    // Apply updates to database
    const results = [];
    for (const update of updates) {
      const updateData: Record<string, unknown> = {
        status: update.status,
        updated_at: new Date().toISOString(),
      };

      if (update.filled_quantity !== undefined) {
        updateData.filled_quantity = update.filled_quantity;
      }
      if (update.avg_fill_price !== undefined) {
        updateData.avg_fill_price = update.avg_fill_price;
      }
      if (update.error_message) {
        updateData.error_message = update.error_message;
      }
      if (update.status === 'FILLED') {
        updateData.filled_at = new Date().toISOString();
      }
      if (update.status === 'CANCELLED') {
        updateData.cancelled_at = new Date().toISOString();
      }
      if (update.status === 'REJECTED') {
        updateData.rejection_reason = update.error_message || 'Rejected by broker';
      }

      const { error: updateError } = await supabase
        .from('orders')
        .update(updateData)
        .eq('id', update.order_id);

      results.push({
        order_id: update.order_id,
        new_status: update.status,
        success: !updateError,
        error: updateError?.message,
      });

      // If order was filled, create trade record
      if (update.status === 'FILLED' && update.avg_fill_price && update.filled_quantity) {
        // Fetch order details for trade creation
        const { data: orderDetails } = await supabase
          .from('orders')
          .select('*')
          .eq('id', update.order_id)
          .single();

        if (orderDetails) {
          await supabase.from('trades').insert({
            order_id: update.order_id,
            broker_trade_id: update.broker_order_id,
            execution_price: update.avg_fill_price,
            quantity: update.filled_quantity,
            commission: 0.65 * update.filled_quantity, // Estimate
            fees: 0.02 * update.filled_quantity,
            total_cost: update.avg_fill_price * update.filled_quantity * 100,
            underlying: orderDetails.underlying,
            symbol: orderDetails.symbol,
            strike: orderDetails.strike,
            expiration: orderDetails.expiration,
            option_type: orderDetails.option_type,
            executed_at: new Date().toISOString(),
          });
        }
      }
    }

    // Log the polling activity
    await supabase.from('adapter_logs').insert({
      adapter_name: preferredBroker,
      operation: 'poll_orders',
      status: 'success',
      request_payload: { orders_checked: pendingOrders.length },
      response_payload: { updates: results },
    });

    return new Response(
      JSON.stringify({
        message: `Polled ${pendingOrders.length} orders`,
        orders_polled: pendingOrders.length,
        updates: results,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Poll orders error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
