import type { IncomingSignal, SignalAction, OptionType, OrderType, TimeInForce } from "./types.ts";

/**
 * TradingView Alert Payload Examples:
 * 
 * Simple format (recommended for TradingView alerts):
 * {
 *   "action": "BUY",
 *   "ticker": "AAPL",
 *   "strike": 180,
 *   "expiration": "2025-03-21",
 *   "type": "CALL",
 *   "qty": 1
 * }
 * 
 * Full format:
 * {
 *   "action": "BUY",
 *   "ticker": "{{ticker}}",
 *   "strike": {{plot("strike")}},
 *   "expiration": "{{plot("expiry")}}",
 *   "type": "CALL",
 *   "qty": {{strategy.order.contracts}},
 *   "price": {{close}},
 *   "order_type": "LIMIT",
 *   "time_in_force": "DAY",
 *   "strategy": "SINGLE"
 * }
 */

interface TradingViewPayload {
  // Action - supports various formats
  action?: string;
  side?: string;
  signal?: string;
  
  // Underlying symbol
  ticker?: string;
  symbol?: string;
  underlying?: string;
  
  // Option details
  strike?: number | string;
  expiration?: string;
  expiry?: string;
  exp?: string;
  type?: string;
  option_type?: string;
  optionType?: string;
  
  // Quantity
  qty?: number | string;
  quantity?: number | string;
  contracts?: number | string;
  size?: number | string;
  
  // Price
  price?: number | string;
  limit_price?: number | string;
  limitPrice?: number | string;
  
  // Order configuration
  order_type?: string;
  orderType?: string;
  time_in_force?: string;
  timeInForce?: string;
  tif?: string;
  
  // Strategy
  strategy?: string;
  strategy_type?: string;
  strategyType?: string;
  
  // Source identification
  source?: string;
  
  // Pass-through metadata
  [key: string]: unknown;
}

export function parseTradingViewPayload(raw: unknown): { 
  signal: IncomingSignal | null; 
  errors: string[];
  rawPayload: TradingViewPayload;
} {
  const errors: string[] = [];
  const payload = raw as TradingViewPayload;
  
  // Parse action
  const actionRaw = payload.action || payload.side || payload.signal || "";
  const action = normalizeAction(actionRaw.toString().toUpperCase());
  if (!action) {
    errors.push(`Invalid action: "${actionRaw}". Must be BUY, SELL, CLOSE, LONG, SHORT, EXIT`);
  }
  
  // Parse underlying
  const underlying = (payload.ticker || payload.symbol || payload.underlying || "").toString().toUpperCase();
  if (!underlying) {
    errors.push("Missing underlying symbol (ticker/symbol/underlying)");
  }
  
  // Parse strike
  const strikeRaw = payload.strike;
  const strike = typeof strikeRaw === "number" ? strikeRaw : parseFloat(strikeRaw?.toString() || "");
  if (isNaN(strike) || strike <= 0) {
    errors.push(`Invalid strike: "${strikeRaw}". Must be a positive number`);
  }
  
  // Parse expiration
  const expirationRaw = payload.expiration || payload.expiry || payload.exp || "";
  const expiration = normalizeExpiration(expirationRaw.toString());
  if (!expiration) {
    errors.push(`Invalid expiration: "${expirationRaw}". Use YYYY-MM-DD format`);
  }
  
  // Parse option type
  const typeRaw = payload.type || payload.option_type || payload.optionType || "";
  const optionType = normalizeOptionType(typeRaw.toString().toUpperCase());
  if (!optionType) {
    errors.push(`Invalid option type: "${typeRaw}". Must be CALL/C or PUT/P`);
  }
  
  // Parse quantity
  const qtyRaw = payload.qty || payload.quantity || payload.contracts || payload.size || "1";
  const quantity = typeof qtyRaw === "number" ? qtyRaw : parseInt(qtyRaw.toString(), 10);
  if (isNaN(quantity) || quantity <= 0) {
    errors.push(`Invalid quantity: "${qtyRaw}". Must be a positive integer`);
  }
  
  // Parse optional price
  const priceRaw = payload.price || payload.limit_price || payload.limitPrice;
  const limitPrice = priceRaw 
    ? (typeof priceRaw === "number" ? priceRaw : parseFloat(priceRaw.toString()))
    : undefined;
  
  // Parse order type
  const orderTypeRaw = payload.order_type || payload.orderType || "MARKET";
  const orderType = normalizeOrderType(orderTypeRaw.toString().toUpperCase());
  
  // Parse time in force
  const tifRaw = payload.time_in_force || payload.timeInForce || payload.tif || "DAY";
  const timeInForce = normalizeTimeInForce(tifRaw.toString().toUpperCase());
  
  // Parse strategy type
  const strategyType = payload.strategy || payload.strategy_type || payload.strategyType || "SINGLE";
  
  // Source
  const source = payload.source || "tradingview";
  
  if (errors.length > 0) {
    return { signal: null, errors, rawPayload: payload };
  }
  
  const signal: IncomingSignal = {
    source: source.toString(),
    action: action!,
    underlying,
    strike,
    expiration: expiration!,
    option_type: optionType!,
    quantity,
    limit_price: limitPrice,
    order_type: orderType,
    time_in_force: timeInForce,
    strategy_type: strategyType.toString(),
    metadata: payload,
  };
  
  return { signal, errors: [], rawPayload: payload };
}

function normalizeAction(action: string): SignalAction | null {
  const mapping: Record<string, SignalAction> = {
    "BUY": "BUY",
    "LONG": "BUY",
    "B": "BUY",
    "SELL": "SELL",
    "SHORT": "SELL",
    "S": "SELL",
    "CLOSE": "CLOSE",
    "EXIT": "CLOSE",
    "FLATTEN": "CLOSE",
    "X": "CLOSE",
  };
  return mapping[action] || null;
}

function normalizeOptionType(type: string): OptionType | null {
  const mapping: Record<string, OptionType> = {
    "CALL": "CALL",
    "C": "CALL",
    "PUT": "PUT",
    "P": "PUT",
  };
  return mapping[type] || null;
}

function normalizeOrderType(type: string): OrderType {
  const mapping: Record<string, OrderType> = {
    "MARKET": "MARKET",
    "MKT": "MARKET",
    "M": "MARKET",
    "LIMIT": "LIMIT",
    "LMT": "LIMIT",
    "L": "LIMIT",
    "STOP": "STOP",
    "STP": "STOP",
    "STOP_LIMIT": "STOP_LIMIT",
    "STPLMT": "STOP_LIMIT",
  };
  return mapping[type] || "MARKET";
}

function normalizeTimeInForce(tif: string): TimeInForce {
  const mapping: Record<string, TimeInForce> = {
    "DAY": "DAY",
    "D": "DAY",
    "GTC": "GTC",
    "IOC": "IOC",
    "FOK": "FOK",
  };
  return mapping[tif] || "DAY";
}

function normalizeExpiration(exp: string): string | null {
  // Already in YYYY-MM-DD format
  if (/^\d{4}-\d{2}-\d{2}$/.test(exp)) {
    return exp;
  }
  
  // MM/DD/YYYY format
  const mdyMatch = exp.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (mdyMatch) {
    const [, month, day, year] = mdyMatch;
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }
  
  // YYMMDD format (common in options)
  const shortMatch = exp.match(/^(\d{2})(\d{2})(\d{2})$/);
  if (shortMatch) {
    const [, yy, mm, dd] = shortMatch;
    const year = parseInt(yy, 10) > 50 ? `19${yy}` : `20${yy}`;
    return `${year}-${mm}-${dd}`;
  }
  
  // Try Date parsing as fallback
  try {
    const date = new Date(exp);
    if (!isNaN(date.getTime())) {
      return date.toISOString().split("T")[0];
    }
  } catch {
    // Ignore parse errors
  }
  
  return null;
}

/**
 * Example TradingView Alert Message (paste this in alert):
 * 
 * {
 *   "action": "{{strategy.order.action}}",
 *   "ticker": "{{ticker}}",
 *   "strike": 180,
 *   "expiration": "2025-03-21",
 *   "type": "CALL",
 *   "qty": {{strategy.order.contracts}},
 *   "price": {{close}}
 * }
 * 
 * Or simpler manual format:
 * {"action":"BUY","ticker":"AAPL","strike":180,"expiration":"2025-03-21","type":"CALL","qty":1}
 */
