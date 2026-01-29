-- Add MTF (Multi-Timeframe) settings columns to risk_limits table
ALTER TABLE public.risk_limits
ADD COLUMN IF NOT EXISTS mtf_mode TEXT DEFAULT 'WEIGHTED' CHECK (mtf_mode IN ('DISABLED', 'STRICT', 'WEIGHTED')),
ADD COLUMN IF NOT EXISTS mtf_min_alignment_score NUMERIC DEFAULT 50 CHECK (mtf_min_alignment_score >= 0 AND mtf_min_alignment_score <= 100),
ADD COLUMN IF NOT EXISTS mtf_min_confluence INTEGER DEFAULT 2 CHECK (mtf_min_confluence >= 0 AND mtf_min_confluence <= 8),
ADD COLUMN IF NOT EXISTS mtf_allow_weak_signals BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS mtf_apply_position_sizing BOOLEAN DEFAULT true;

-- Add comments for documentation
COMMENT ON COLUMN public.risk_limits.mtf_mode IS 'MTF filter mode: DISABLED (no check), STRICT (full alignment required), WEIGHTED (flexible with position sizing)';
COMMENT ON COLUMN public.risk_limits.mtf_min_alignment_score IS 'Minimum alignment score (0-100) for WEIGHTED mode';
COMMENT ON COLUMN public.risk_limits.mtf_min_confluence IS 'Minimum number of aligned timeframes for WEIGHTED mode';
COMMENT ON COLUMN public.risk_limits.mtf_allow_weak_signals IS 'Allow WEAK_LONG/WEAK_SHORT signals in WEIGHTED mode';
COMMENT ON COLUMN public.risk_limits.mtf_apply_position_sizing IS 'Apply MTF-based position size multiplier';

-- Update existing PAPER mode record with defaults
UPDATE public.risk_limits 
SET 
  mtf_mode = 'WEIGHTED',
  mtf_min_alignment_score = 50,
  mtf_min_confluence = 2,
  mtf_allow_weak_signals = true,
  mtf_apply_position_sizing = true
WHERE mode = 'PAPER' AND mtf_mode IS NULL;