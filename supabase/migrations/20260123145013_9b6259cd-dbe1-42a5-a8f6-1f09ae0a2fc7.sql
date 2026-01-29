-- Add auto_close_enabled column to risk_limits table
ALTER TABLE public.risk_limits 
ADD COLUMN IF NOT EXISTS auto_close_enabled BOOLEAN DEFAULT false;

-- Add comment explaining the column
COMMENT ON COLUMN public.risk_limits.auto_close_enabled IS 'When enabled, system automatically closes positions when exit rules trigger';

-- Update default PAPER mode risk limits to have auto_close disabled by default
UPDATE public.risk_limits 
SET auto_close_enabled = false 
WHERE auto_close_enabled IS NULL;