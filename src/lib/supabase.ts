import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

if (!supabaseUrl || !supabaseAnonKey) {
  // eslint-disable-next-line no-console
  console.error('[supabase] Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. Check your .env.local')
  throw new Error('Supabase client not configured: set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY')
}

// eslint-disable-next-line no-console
try {
  console.log('[supabase] initializing client', {
    urlPresent: Boolean(supabaseUrl),
    keyPresent: Boolean(supabaseAnonKey),
    urlPreview: supabaseUrl ? `${supabaseUrl.slice(0, 20)}...` : null,
  })
} catch {}

const storage = typeof window !== 'undefined' ? window.localStorage : undefined

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storage,
    storageKey: 'pch.auth',
  },
})

// Update user's timezone in profiles if not already set
export async function updateUserTimezone(timezone: string): Promise<{ ok: boolean; updated: boolean; timezone?: string; error?: string }> {
	try {
		const { data: userData, error: userErr } = await supabase.auth.getUser()
		if (userErr || !userData?.user?.id) {
			return { ok: false, updated: false, error: userErr?.message || 'No authenticated user' }
		}
		const userId = userData.user.id
		const { data: prof, error: profErr } = await supabase
			.from('profiles')
			.select('timezone')
			.eq('id', userId)
			.single()
		if (profErr) {
			// If profile is missing or select failed, do not hard-fail here
			return { ok: false, updated: false, error: profErr.message }
		}
		const current = String((prof as any)?.timezone || '').trim()
		if (current) {
			return { ok: true, updated: false, timezone: current }
		}
		const tz = String(timezone || '').trim()
		if (!tz) {
			return { ok: false, updated: false, error: 'Empty timezone provided' }
		}
		const { error: updErr } = await supabase
			.from('profiles')
			.update({ timezone: tz })
			.eq('id', userId)
		if (updErr) return { ok: false, updated: false, error: updErr.message }
		return { ok: true, updated: true, timezone: tz }
	} catch (e: any) {
		return { ok: false, updated: false, error: e?.message || String(e) }
	}
}


