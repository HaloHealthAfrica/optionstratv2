-- Create exit_rules configuration table
CREATE TABLE public.exit_rules (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  mode TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  
  -- Profit/Loss Rules
  profit_target_percent NUMERIC DEFAULT 50,
  stop_loss_percent NUMERIC DEFAULT 75,
  trailing_stop_percent NUMERIC DEFAULT 25,
  
  -- Time-based Rules
  min_days_to_expiration INTEGER DEFAULT 5,
  max_days_in_trade INTEGER DEFAULT 14,
  
  -- Greeks-based Rules
  delta_exit_threshold NUMERIC DEFAULT 0.82,
  theta_decay_threshold NUMERIC DEFAULT 0.04,
  
  -- Volatility Rules
  iv_crush_threshold NUMERIC DEFAULT 0.20,
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  
  CONSTRAINT unique_active_mode UNIQUE (mode, is_active)
);

-- Enable RLS
ALTER TABLE public.exit_rules ENABLE ROW LEVEL SECURITY;

-- RLS policies (same pattern as risk_limits)
CREATE POLICY "Authenticated users can read exit_rules"
ON public.exit_rules
FOR SELECT
USING (true);

CREATE POLICY "Service role full access to exit_rules"
ON public.exit_rules
FOR ALL
USING (true)
WITH CHECK (true);

-- Create trigger for updated_at
CREATE TRIGGER update_exit_rules_updated_at
BEFORE UPDATE ON public.exit_rules
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Insert default rules for PAPER mode
INSERT INTO public.exit_rules (mode, is_active, profit_target_percent, stop_loss_percent, trailing_stop_percent, min_days_to_expiration, max_days_in_trade, delta_exit_threshold, theta_decay_threshold, iv_crush_threshold)
VALUES ('PAPER', true, 50, 75, 25, 5, 14, 0.82, 0.04, 0.20);

-- Insert default rules for LIVE mode
INSERT INTO public.exit_rules (mode, is_active, profit_target_percent, stop_loss_percent, trailing_stop_percent, min_days_to_expiration, max_days_in_trade, delta_exit_threshold, theta_decay_threshold, iv_crush_threshold)
VALUES ('LIVE', true, 50, 75, 25, 5, 14, 0.82, 0.04, 0.20);