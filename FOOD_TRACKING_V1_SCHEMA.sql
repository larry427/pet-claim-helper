-- Food Tracking V1 - Simplified Schema
-- Core value: "Know what you're spending. Know when to reorder. Never run out."

-- Drop old tables
DROP TABLE IF EXISTS feeding_plans CASCADE;
DROP TABLE IF EXISTS food_items CASCADE;

-- Create new simplified food_entries table (one entry per pet)
CREATE TABLE food_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pet_id UUID NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
  food_name TEXT NOT NULL,
  food_type TEXT NOT NULL CHECK (food_type IN ('dry', 'wet', 'freeze-dried')),
  bag_size_lbs DECIMAL(10, 2) NOT NULL,
  bag_cost DECIMAL(10, 2) NOT NULL,
  cups_per_day DECIMAL(5, 2) NOT NULL,
  start_date DATE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CONSTRAINT one_food_per_pet UNIQUE (pet_id)
);

-- RLS policies for food_entries
ALTER TABLE food_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own food entries"
ON food_entries FOR SELECT
USING (
  pet_id IN (
    SELECT id FROM pets WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Users can insert own food entries"
ON food_entries FOR INSERT
WITH CHECK (
  pet_id IN (
    SELECT id FROM pets WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Users can update own food entries"
ON food_entries FOR UPDATE
USING (
  pet_id IN (
    SELECT id FROM pets WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Users can delete own food entries"
ON food_entries FOR DELETE
USING (
  pet_id IN (
    SELECT id FROM pets WHERE user_id = auth.uid()
  )
);

-- Index for performance
CREATE INDEX idx_food_entries_pet_id ON food_entries(pet_id);

-- Conversion factors (for reference, will be hardcoded in frontend):
-- Dry kibble: 4 cups per lb
-- Wet food: 2 cups per lb
-- Freeze-dried: 9 cups per lb
