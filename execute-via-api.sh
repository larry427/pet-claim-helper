#!/bin/bash
source .env.local

SQL="ALTER TABLE profiles ADD COLUMN IF NOT EXISTS city TEXT, ADD COLUMN IF NOT EXISTS state TEXT, ADD COLUMN IF NOT EXISTS zip TEXT;"

echo "🔧 Executing migration via Supabase REST API..."
echo ""
echo "SQL: $SQL"
echo ""

# Use Supabase PostgREST API with service role key
# Execute via RPC if available, otherwise use Management API

curl -X POST "${VITE_SUPABASE_URL}/rest/v1/rpc/exec_sql" \
  -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "Content-Type: application/json" \
  -d "{\"query\": \"$SQL\"}" \
  2>&1

echo ""
echo "Note: If exec_sql RPC doesn't exist, trying alternate approach..."

