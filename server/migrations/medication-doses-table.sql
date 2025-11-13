-- Create medication_doses table for tracking when medications are given
-- This table is used by the SMS deep link feature (/dose/:id?action=mark)

CREATE TABLE IF NOT EXISTS medication_doses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  medication_id UUID NOT NULL REFERENCES medications(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'given', 'skipped')),
  scheduled_time TIMESTAMPTZ NOT NULL,
  given_time TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_medication_doses_medication_id ON medication_doses(medication_id);
CREATE INDEX IF NOT EXISTS idx_medication_doses_user_id ON medication_doses(user_id);
CREATE INDEX IF NOT EXISTS idx_medication_doses_status ON medication_doses(status);
CREATE INDEX IF NOT EXISTS idx_medication_doses_scheduled_time ON medication_doses(scheduled_time);

-- Create index for the common query pattern (finding today's pending doses)
CREATE INDEX IF NOT EXISTS idx_medication_doses_pending_today ON medication_doses(medication_id, user_id, status, scheduled_time)
WHERE status = 'pending';

-- Enable Row Level Security
ALTER TABLE medication_doses ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can only see their own doses
CREATE POLICY "Users can view own doses"
  ON medication_doses FOR SELECT
  USING (auth.uid() = user_id);

-- RLS Policy: Users can insert their own doses
CREATE POLICY "Users can insert own doses"
  ON medication_doses FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- RLS Policy: Users can update their own doses
CREATE POLICY "Users can update own doses"
  ON medication_doses FOR UPDATE
  USING (auth.uid() = user_id);

-- RLS Policy: Users can delete their own doses
CREATE POLICY "Users can delete own doses"
  ON medication_doses FOR DELETE
  USING (auth.uid() = user_id);

-- Function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_medication_doses_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to call the update function
CREATE TRIGGER medication_doses_updated_at
  BEFORE UPDATE ON medication_doses
  FOR EACH ROW
  EXECUTE FUNCTION update_medication_doses_updated_at();

-- Comments for documentation
COMMENT ON TABLE medication_doses IS 'Tracks when medications are given or scheduled';
COMMENT ON COLUMN medication_doses.status IS 'Status: pending, given, or skipped';
COMMENT ON COLUMN medication_doses.scheduled_time IS 'When the dose was scheduled to be given';
COMMENT ON COLUMN medication_doses.given_time IS 'When the dose was actually marked as given';
