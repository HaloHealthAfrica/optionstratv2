-- Add missing columns for position tracking (trailing stop and IV crush detection)
ALTER TABLE public.positions 
ADD COLUMN IF NOT EXISTS high_water_mark numeric DEFAULT NULL,
ADD COLUMN IF NOT EXISTS entry_iv numeric DEFAULT NULL;

-- Add index for efficient querying of positions with exit signals
CREATE INDEX IF NOT EXISTS idx_positions_open_exit ON public.positions (is_closed, high_water_mark, entry_iv) 
WHERE is_closed = false;