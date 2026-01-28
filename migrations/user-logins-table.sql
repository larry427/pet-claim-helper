-- User Logins Tracking Table
-- Run this in Supabase SQL Editor

-- Create the user_logins table
CREATE TABLE IF NOT EXISTS public.user_logins (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  is_demo_account BOOLEAN DEFAULT false,
  logged_in_at TIMESTAMPTZ DEFAULT NOW(),
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_user_logins_user_id ON public.user_logins(user_id);
CREATE INDEX IF NOT EXISTS idx_user_logins_logged_in_at ON public.user_logins(logged_in_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_logins_is_demo ON public.user_logins(is_demo_account) WHERE is_demo_account = true;

-- Enable RLS
ALTER TABLE public.user_logins ENABLE ROW LEVEL SECURITY;

-- Policy: Only admins can read all logins
CREATE POLICY "Admins can read all logins"
ON public.user_logins FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid()
    AND profiles.is_admin = true
  )
);

-- Policy: Allow authenticated users to insert their own login records
CREATE POLICY "Users can insert own login"
ON public.user_logins FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

-- Grant permissions
GRANT SELECT ON public.user_logins TO authenticated;
GRANT INSERT ON public.user_logins TO authenticated;
