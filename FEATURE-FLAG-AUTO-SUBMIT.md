# Auto-Submit Feature Flag

## Overview
The Auto-Submit to Insurance feature is controlled by an environment variable feature flag.

**Environment Variable:** `VITE_ENABLE_AUTO_SUBMIT`

## Current Status
- **Local Development:** ENABLED (set to 'true' in .env.local)
- **Production:** DISABLED (not set in Vercel environment variables)

## How It Works
The Auto-Submit button (🚀 Auto-Submit to Insurance) will only appear when:
```
VITE_ENABLE_AUTO_SUBMIT === 'true'
```

If the variable is not set, undefined, or set to any other value, the button will be **hidden**.

## Enabling in Production

### Via Vercel Dashboard:
1. Go to your Vercel project: https://vercel.com/your-project
2. Navigate to **Settings** → **Environment Variables**
3. Add new variable:
   - **Name:** `VITE_ENABLE_AUTO_SUBMIT`
   - **Value:** `true`
   - **Environment:** Production (or all environments)
4. Click **Save**
5. **Redeploy** the application for changes to take effect

### Via Vercel CLI:
```bash
vercel env add VITE_ENABLE_AUTO_SUBMIT production
# When prompted, enter: true
```

Then redeploy:
```bash
vercel --prod
```

## Disabling in Production
Simply remove the environment variable or set it to anything other than `'true'`:
- In Vercel Dashboard: Delete the `VITE_ENABLE_AUTO_SUBMIT` variable
- Or set it to: `false`, `disabled`, etc.

Then redeploy.

## Testing Locally

### Enable (show Auto-Submit button):
In `.env.local`:
```bash
VITE_ENABLE_AUTO_SUBMIT=true
```

### Disable (hide Auto-Submit button):
In `.env.local`:
```bash
VITE_ENABLE_AUTO_SUBMIT=false
# OR simply comment it out or remove it
```

Restart your dev server after changing environment variables:
```bash
npm run dev
```

## Current Implementation
**File:** `src/App.tsx` (lines ~2229-2239)

```tsx
{/* Auto-Submit Button - Feature Flagged */}
{import.meta.env.VITE_ENABLE_AUTO_SUBMIT === 'true' && (
  <button
    type="button"
    className="text-xs px-3 py-1.5 rounded bg-blue-600 hover:bg-blue-700 text-white font-semibold whitespace-nowrap flex items-center gap-1.5"
    onClick={() => setSubmittingClaim(c)}
    title="Automatically generate PDF and email to insurance company"
  >
    <span>🚀</span>
    Auto-Submit to Insurance
  </button>
)}
```

## Why This Was Added
The Auto-Submit feature was deployed to production before full testing was complete. This feature flag allows us to:
1. ✅ Hide the feature from production users immediately
2. ✅ Keep it visible in local development for testing
3. ✅ Enable in production when ready with a simple environment variable change (no code deployment needed)

## Safety Notes
- The manual "Mark as Filed" button remains visible at all times
- Users can still generate PDFs and submit claims manually
- This only affects the automatic submission feature
- No data is lost or affected by hiding this button

## When to Enable in Production
Enable when:
- ✅ All end-to-end tests pass
- ✅ Test mode has been verified working
- ✅ Email delivery is confirmed working
- ✅ PDF generation is tested with all insurance companies
- ✅ User acceptance testing is complete
- ✅ Documentation is ready for users
