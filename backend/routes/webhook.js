// Webhook endpoint - Migrated from Deno
// Handles TradingView webhooks and signal processing
import express from 'express';
import crypto from 'crypto';
import { query, getClient } from '../lib/db.js';

const router = express.Router();

/**
 * Verify HMAC signature for webhook security
 */
function verifyHmacSignature(payload, signature) {
  const secret = process.env.HMAC_SECRET;
  if (!secret || !signature) {
    return false;
  }

  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(JSON.stringify(payload));
  const expectedSignature = hmac.digest('hex');

  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
}

/**
 * Generate unique hash for signal deduplication
 */
function generateSignalHash(signal) {
  const key = `${signal.symbol}-${signal.direction}-${signal.action}-${signal.timeframe}`;
  return crypto.createHash('sha256').update(key).digest('hex');
}

/**
 * Parse TradingView webhook payload
 */
function parseTradingViewPayload(payload) {
  // Extract signal data from TradingView format
  const symbol = payload.ticker || payload.symbol || 'SPY';
  const action = (payload.action || payload.order || 'BUY').toUpperCase();
  const direction = (payload.direction || payload.option_type || 'CALL').toUpperCase();
  
  return {
    underlying: symbol,
    action,
    option_type: direction,
    strike: payload.strike || null,
    expiration: payload.expiration || null,
    limit_price: payload.limit_price || payload.price || null,
    metadata: {
      source: 'tradingview',
      raw_payload: payload,
      timeframe: payload.timeframe || payload.interval || '5m',
      timestamp: payload.timestamp || new Date().toISOString(),
    },
  };
}

/**
 * Validate incoming signal
 */
function validateSignal(signal) {
  const errors = [];

  // Validate action
  const validActions = ['BUY', 'SELL', 'CLOSE', 'LONG', 'SHORT', 'EXIT'];
  if (!validActions.includes(signal.action)) {
    errors.push(`Invalid action: "${signal.action}". Must be ${validActions.join(', ')}`);
  }

  // Validate strike
  if (signal.strike && (typeof signal.strike !== 'number' || signal.strike <= 0)) {
    errors.push(`Invalid strike: "${signal.strike}". Must be a positive number`);
  }

  // Validate expiration
  if (signal.expiration && !/^\d{4}-\d{2}-\d{2}$/.test(signal.expiration)) {
    errors.push(`Invalid expiration: "${signal.expiration}". Use YYYY-MM-DD format`);
  }

  // Validate option type
  const validOptionTypes = ['CALL', 'C', 'PUT', 'P'];
  if (signal.option_type && !validOptionTypes.includes(signal.option_type.toUpperCase())) {
    errors.push(`Invalid option type: "${signal.option_type}". Must be CALL/C or PUT/P`);
  }

  return errors;
}

/**
 * Save signal to database
 */
async function saveSignal(signal, requestId) {
  const client = await getClient();
  
  try {
    await client.query('BEGIN');

    const result = await client.query(
      `INSERT INTO signals (
        underlying, action, option_type, strike, expiration,
        limit_price, timeframe, source, metadata, request_id, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING id`,
      [
        signal.underlying,
        signal.action,
        signal.option_type,
        signal.strike,
        signal.expiration,
        signal.limit_price,
        signal.metadata?.timeframe || '5m',
        signal.metadata?.source || 'webhook',
        JSON.stringify(signal.metadata),
        requestId,
        'RECEIVED',
      ]
    );

    await client.query('COMMIT');
    return result.rows[0].id;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Process webhook - Main handler
 */
router.post('/', async (req, res) => {
  const requestId = crypto.randomUUID();
  const startTime = Date.now();

  try {
    console.log(`[${requestId}] Stage: RECEIPT, Status: RECEIVED, Method: ${req.method}`);

    // Verify HMAC signature if secret is configured
    const signature = req.headers['x-webhook-signature'];
    const hmacSecret = process.env.HMAC_SECRET;
    
    if (hmacSecret) {
      console.log(`[${requestId}] Stage: HMAC_VERIFICATION, Status: CHECKING`);
      
      if (!signature) {
        console.log(`[${requestId}] Stage: HMAC_VERIFICATION, Status: SKIPPED, Reason: No signature provided`);
      } else {
        const isValid = verifyHmacSignature(req.body, signature);
        if (!isValid) {
          console.log(`[${requestId}] Stage: HMAC_VERIFICATION, Status: FAILED`);
          return res.status(401).json({
            status: 'REJECTED',
            error: 'Invalid HMAC signature',
            request_id: requestId,
          });
        }
        console.log(`[${requestId}] Stage: HMAC_VERIFICATION, Status: SUCCESS`);
      }
    }

    // Parse payload
    console.log(`[${requestId}] Stage: JSON_PARSING, Status: ATTEMPTING`);
    const payload = req.body;
    console.log(`[${requestId}] Stage: JSON_PARSING, Status: SUCCESS`);

    // Detect source and parse signal
    console.log(`[${requestId}] Stage: SIGNAL_PARSING, Status: DETECTING_SOURCE`);
    const signal = parseTradingViewPayload(payload);
    console.log(`[${requestId}] Stage: SIGNAL_PARSING, Status: SOURCE_DETECTED, Source: tradingview`);

    // Validate signal
    console.log(`[${requestId}] Stage: SIGNAL_PARSING, Status: VALIDATING`);
    const validationErrors = validateSignal(signal);
    
    if (validationErrors.length > 0) {
      console.log(`[${requestId}] Stage: SIGNAL_PARSING, Status: REJECTED, Errors: ${validationErrors.length}`);
      return res.status(400).json({
        status: 'REJECTED',
        validation_errors: validationErrors,
        request_id: requestId,
      });
    }

    console.log(`[${requestId}] Stage: SIGNAL_PARSING, Status: SUCCESS`);

    // Check for duplicates
    const signalHash = generateSignalHash(signal);
    console.log(`[${requestId}] Stage: DEDUPLICATION, Status: CHECKING, Hash: ${signalHash.substring(0, 8)}`);

    const duplicateCheck = await query(
      `SELECT id FROM signals 
       WHERE metadata->>'signal_hash' = $1 
       AND created_at > NOW() - INTERVAL '5 minutes'
       LIMIT 1`,
      [signalHash]
    );

    if (duplicateCheck.rows.length > 0) {
      console.log(`[${requestId}] Stage: DEDUPLICATION, Status: DUPLICATE_FOUND`);
      return res.json({
        status: 'DUPLICATE',
        message: 'Signal already processed',
        request_id: requestId,
        signal_id: duplicateCheck.rows[0].id,
      });
    }

    console.log(`[${requestId}] Stage: DEDUPLICATION, Status: UNIQUE`);

    // Save signal
    signal.metadata = signal.metadata || {};
    signal.metadata.signal_hash = signalHash;
    signal.metadata.request_id = requestId;

    console.log(`[${requestId}] Stage: PERSISTENCE, Status: SAVING`);
    const signalId = await saveSignal(signal, requestId);
    console.log(`[${requestId}] Stage: PERSISTENCE, Status: SUCCESS, SignalId: ${signalId}`);

    const duration = Date.now() - startTime;
    console.log(`[${requestId}] Stage: COMPLETE, Status: SUCCESS, Duration: ${duration}ms`);

    return res.json({
      status: 'ACCEPTED',
      message: 'Signal received and queued for processing',
      request_id: requestId,
      signal_id: signalId,
      processing_time_ms: duration,
    });

  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`[${requestId}] Stage: ERROR, Status: FAILED, Duration: ${duration}ms, Error:`, error);

    return res.status(500).json({
      status: 'ERROR',
      error: error.message,
      request_id: requestId,
      processing_time_ms: duration,
    });
  }
});

export default router;
