-- Create pet_expenses table for "QuickBooks for Dogs" expense tracking feature
-- Migration: 2026-01-21

CREATE TABLE pet_expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

  -- Core fields
  amount DECIMAL(10,2) NOT NULL,
  category TEXT NOT NULL CHECK (category IN (
    'food_treats', 'supplies_gear', 'grooming',
    'training_boarding', 'vet_medical', 'other'
  )),
  expense_date DATE NOT NULL,

  -- Optional fields
  vendor TEXT,
  description TEXT,
  receipt_url TEXT,

  -- Linked claim (for vet_medical category)
  claim_id UUID REFERENCES claims(id) ON DELETE SET NULL,

  -- AI extraction metadata
  ocr_extracted BOOLEAN DEFAULT FALSE,
  ocr_confidence DECIMAL(3,2),

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for common queries
CREATE INDEX idx_pet_expenses_user_date ON pet_expenses(user_id, expense_date DESC);
CREATE INDEX idx_pet_expenses_user_category ON pet_expenses(user_id, category);
CREATE INDEX idx_pet_expenses_user_year ON pet_expenses(user_id, date_trunc('year', expense_date));

-- Enable RLS
ALTER TABLE pet_expenses ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can only access their own expenses
CREATE POLICY "Users can manage own expenses"
  ON pet_expenses FOR ALL
  USING (auth.uid() = user_id);

-- Add updated_at trigger
CREATE OR REPLACE FUNCTION update_pet_expenses_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER pet_expenses_updated_at
  BEFORE UPDATE ON pet_expenses
  FOR EACH ROW
  EXECUTE FUNCTION update_pet_expenses_updated_at();

-- Comments for documentation
COMMENT ON TABLE pet_expenses IS 'Tracks all pet-related expenses for QuickBooks for Dogs feature';
COMMENT ON COLUMN pet_expenses.category IS 'Expense category: food_treats, supplies_gear, grooming, training_boarding, vet_medical, other';
COMMENT ON COLUMN pet_expenses.claim_id IS 'Links to claims table for vet_medical expenses';
COMMENT ON COLUMN pet_expenses.ocr_extracted IS 'True if expense was created via receipt OCR';
COMMENT ON COLUMN pet_expenses.ocr_confidence IS 'AI confidence score for OCR extraction (0.00-1.00)';
