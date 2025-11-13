-- Migration: Add photo_url column to pets table for pet photo upload feature
ALTER TABLE public.pets
ADD COLUMN IF NOT EXISTS photo_url text;

-- Create storage bucket for pet photos (if not exists)
-- Note: This needs to be run in Supabase Dashboard > Storage
-- Bucket name: pet-photos
-- Public: true
-- File size limit: 5MB
-- Allowed MIME types: image/png, image/jpeg, image/jpg

-- RLS Policy for pet-photos bucket
-- Users can upload photos for their own pets
-- Users can read all pet photos (since they're public)
