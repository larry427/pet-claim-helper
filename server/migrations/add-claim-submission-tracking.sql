-- Add columns to track claim submission status and history
-- Migration: add-claim-submission-tracking.sql
-- Date: 2025-11-15

-- Add submission tracking columns to claims table
ALTER TABLE claims
ADD COLUMN IF NOT EXISTS submission_status TEXT DEFAULT 'draft',
ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS submission_email_id TEXT;

-- Add index for faster filtering by submission status
CREATE INDEX IF NOT EXISTS idx_claims_submission_status ON claims(submission_status);

-- Add index for submitted_at to enable sorting by submission date
CREATE INDEX IF NOT EXISTS idx_claims_submitted_at ON claims(submitted_at);

-- Add comment to explain column usage
COMMENT ON COLUMN claims.submission_status IS 'Status of claim submission: draft, submitted, approved, denied';
COMMENT ON COLUMN claims.submitted_at IS 'Timestamp when claim was submitted to insurance company';
COMMENT ON COLUMN claims.submission_email_id IS 'Resend email message ID for tracking';

-- Update existing claims to have 'draft' status if null
UPDATE claims
SET submission_status = 'draft'
WHERE submission_status IS NULL;
