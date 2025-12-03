#!/bin/bash
source .env.local

PROJECT_REF=$(echo $VITE_SUPABASE_URL | sed 's/https:\/\/\([^.]*\).*/\1/')

echo "🔧 Running SQL via Supabase Management API..."
echo "Project: $PROJECT_REF"
echo ""

# The SQL to execute
SQL='ALTER TABLE profiles ADD COLUMN IF NOT EXISTS city TEXT, ADD COLUMN IF NOT EXISTS state TEXT, ADD COLUMN IF NOT EXISTS zip TEXT;'

# Try to execute using the database query endpoint
curl -X POST "https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query" \
  -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "Content-Type: application/json" \
  -d "{\"query\": \"$SQL\"}" \
  2>&1

echo ""
