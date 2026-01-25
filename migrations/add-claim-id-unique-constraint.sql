-- Add unique constraint on claim_id to prevent duplicate expenses for the same claim
-- Migration: 2026-01-24
--
-- The claim_id column and foreign key already exist from create-pet-expenses-table.sql
-- This migration adds a unique constraint so each claim can only have one expense entry

-- Add unique constraint (allows multiple NULLs, only enforces uniqueness for non-null values)
ALTER TABLE pet_expenses
ADD CONSTRAINT pet_expenses_claim_id_unique UNIQUE (claim_id);

-- Add comment for documentation
COMMENT ON CONSTRAINT pet_expenses_claim_id_unique ON pet_expenses
IS 'Ensures each claim can only have one linked expense entry';
