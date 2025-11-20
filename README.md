# Pet Claim Helper

Modern React + Vite + Tailwind app.

## Setup

1. Install Node.js (LTS recommended)
2. Install deps:

```bash
npm install
```

3. Start dev server (Vite + API server):

```bash
npm run dev
```

Environment variables (.env.local):

```bash
# Client (Vite)
VITE_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY
VITE_OPENAI_API_KEY=sk-...

# Server
SUPABASE_URL=https://YOUR-PROJECT.supabase.co
SUPABASE_SERVICE_ROLE_KEY=YOUR_SUPABASE_SERVICE_ROLE_KEY
RESEND_API_KEY=re_...
MAIL_FROM="Pet Claim Helper <noreply@your-domain>"
PORT=8787
```

API health check:

```bash
curl -s http://localhost:8787/api/health
```

4. Build for production:

```bash
npm run build && npm run preview
```



# Admin Dashboard Added - Thu Nov 20 09:33:09 PST 2025
