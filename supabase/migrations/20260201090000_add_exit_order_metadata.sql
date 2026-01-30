-- Add refactored position linkage and exit metadata to orders

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS refactored_position_id VARCHAR(255),
  ADD COLUMN IF NOT EXISTS exit_action TEXT CHECK (exit_action IN ('PARTIAL', 'FULL')),
  ADD COLUMN IF NOT EXISTS exit_quantity INTEGER;

CREATE INDEX IF NOT EXISTS idx_orders_refactored_position_id ON orders(refactored_position_id);
