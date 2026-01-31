// Mtf comparison endpoint
import express from 'express';
import { requireAuth } from '../lib/auth.js';

const router = express.Router();

router.get('/', requireAuth, async (req, res) => {
  try {
    const ticker = (req.query.ticker || 'SPY').toString().toUpperCase();
    const emptyAnalysis = {
      ticker,
      recommendation: 'HOLD',
      confidence: 0,
      riskLevel: 'LOW',
      positionSizeMultiplier: 0,
      timeframeBias: {
        weekly: 'NEUTRAL',
        daily: 'NEUTRAL',
        fourHour: 'NEUTRAL',
        entry: 'NEUTRAL',
      },
      alignment: {
        isAligned: false,
        score: 0,
        confluenceCount: 0,
        reasons: [],
      },
      signals: {
        total: 0,
        entry: 0,
        confirmation: 0,
        entryDetails: [],
        confirmationDetails: [],
      },
      primaryEntrySignal: null,
    };

    res.json({
      ticker,
      analysis: emptyAnalysis,
      strictResult: {
        approved: false,
        reason: 'No data available',
        adjustedQuantity: 0,
        positionMultiplier: 0,
      },
      weightedResult: {
        approved: false,
        reason: 'No data available',
        adjustedQuantity: 0,
        positionMultiplier: 0,
      },
    });
  } catch (error) {
    console.error('[mtf-comparison] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
