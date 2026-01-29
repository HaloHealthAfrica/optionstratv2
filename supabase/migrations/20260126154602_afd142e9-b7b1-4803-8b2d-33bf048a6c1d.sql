-- Drop and recreate the trigger to use the correct column name
DROP TRIGGER IF EXISTS update_positions_updated_at ON public.positions;

-- Create a new function that uses last_updated instead
CREATE OR REPLACE FUNCTION public.update_last_updated_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.last_updated = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Create trigger for positions table
CREATE TRIGGER update_positions_last_updated
BEFORE UPDATE ON public.positions
FOR EACH ROW
EXECUTE FUNCTION public.update_last_updated_column();