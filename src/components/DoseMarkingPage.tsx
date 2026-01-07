import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

interface DoseMarkingPageProps {
  medicationId: string // Can be either short_code (8 chars) or UUID
  userId: string | null
  onClose: (wasMarked?: boolean) => void
}

export default function DoseMarkingPage({ medicationId, userId, onClose }: DoseMarkingPageProps) {
  const [medication, setMedication] = useState<any>(null)
  const [pet, setPet] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [marking, setMarking] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Extract magic link token from URL if present (legacy)
  const [magicToken, setMagicToken] = useState<string | null>(null)
  // Store the actual medication UUID (resolved from short code or passed directly)
  const [actualMedicationId, setActualMedicationId] = useState<string | null>(null)
  // Store short code if using new format
  const [shortCode, setShortCode] = useState<string | null>(null)
  // Store the current dose being marked (includes scheduled_time)
  const [currentDose, setCurrentDose] = useState<any>(null)
  // Progress stats for success modal
  const [progressStats, setProgressStats] = useState<{
    givenCount: number
    totalCount: number
    remainingCount: number
    percentage: number
    nextDoseTime: string | null
    daysRemaining: number | null
    isComplete: boolean
  } | null>(null)

  useEffect(() => {
    console.log('[DoseMarkingPage] useEffect triggered', {
      medicationId,
      userId,
      success,
      loading,
      error
    })

    // Don't reload if already successful - prevents re-querying after marking as given
    if (success) {
      console.log('[DoseMarkingPage] Already successful, skipping reload')
      return
    }

    // Extract token from URL and pass it directly to loadMedicationDetails
    // This avoids a race condition where setState hasn't updated yet
    const urlParams = new URLSearchParams(window.location.search)
    const token = urlParams.get('token')

    if (token) {
      setMagicToken(token)
      console.log('[DoseMarkingPage] Magic link token detected:', token.slice(0, 8) + '...')
    }

    console.log('[DoseMarkingPage] Calling loadMedicationDetails with token:', token ? token.slice(0, 8) + '...' : 'null')
    // Pass token directly (don't rely on magicToken state which may not be updated yet)
    loadMedicationDetails(token)
  }, [medicationId, userId, success])

  // Calculate progress stats when medication is loaded
  useEffect(() => {
    if (medication && actualMedicationId && !success) {
      calculateProgressStats()
    }
  }, [medication, actualMedicationId, success])

  async function loadMedicationDetails(tokenFromUrl: string | null = null) {
    console.log('[DoseMarkingPage] loadMedicationDetails called', {
      tokenFromUrl,
      magicToken,
      medicationId,
      success,
      loading
    })

    try {
      // Use tokenFromUrl (passed directly) OR magicToken (from state)
      const effectiveToken = tokenFromUrl || magicToken

      // MAGIC LINK AUTH via short code or legacy token
      // The medicationId could be:
      // 1. Short code (8 alphanumeric chars, no hyphens) - NEW FORMAT
      // 2. UUID (with hyphens) - LEGACY FORMAT (when used with ?token= param)

      const isShortCode = medicationId.length === 8 && !medicationId.includes('-')
      const isUUID = medicationId.includes('-')

      console.log('[DoseMarkingPage] Detecting format', {
        isShortCode,
        isUUID,
        effectiveToken: effectiveToken ? effectiveToken.slice(0, 8) + '...' : 'null'
      })

      // Try short code lookup first (new format)
      if (isShortCode) {
        console.log('[DoseMarkingPage] Loading via short code:', medicationId)

        const { data: doseData, error: doseError } = await supabase
          .from('medication_doses')
          .select('*, medications(*, pets(name, species))')
          .eq('short_code', medicationId)
          .single()

        if (doseError || !doseData) {
          console.error('[DoseMarkingPage] Short code lookup failed:', doseError?.message, doseError?.code)
          setError('This link is invalid or has expired. Please check for a newer SMS.')
          setLoading(false)
          return
        }

        console.log('[DoseMarkingPage] ✅ Dose found via short code:', doseData.id)
        setMedication(doseData.medications)
        setPet(doseData.medications?.pets)
        setActualMedicationId(doseData.medication_id)
        setShortCode(medicationId)
        setCurrentDose(doseData)
        setLoading(false)
        return
      }

      // Legacy: Token-based auth (for backwards compatibility)
      if (effectiveToken) {
        console.log('[DoseMarkingPage] Loading via legacy token:', effectiveToken.slice(0, 8) + '...')

        // Get dose by token, which includes medication details
        const { data: doseData, error: doseError } = await supabase
          .from('medication_doses')
          .select('*, medications(*, pets(name, species))')
          .eq('one_time_token', effectiveToken)
          .single()

        if (doseError || !doseData) {
          console.error('[DoseMarkingPage] Token validation failed:', doseError?.message, doseError?.code)
          console.error('[DoseMarkingPage] Full error:', JSON.stringify(doseError))
          setError('This link is invalid or has expired. Please check for a newer SMS.')
          setLoading(false)
          return
        }

        // Token is valid - load medication details from the joined data
        console.log('[DoseMarkingPage] ✅ Dose found via token:', doseData.id)
        console.log('[DoseMarkingPage] Full dose data:', JSON.stringify(doseData, null, 2))
        console.log('[DoseMarkingPage] Medications object:', doseData.medications)
        console.log('[DoseMarkingPage] Pets object:', doseData.medications?.pets)

        setMedication(doseData.medications)
        setPet(doseData.medications?.pets)
        setCurrentDose(doseData)
        setLoading(false)

        console.log('[DoseMarkingPage] ✅ Medication name:', doseData.medications?.medication_name || 'MISSING')
        console.log('[DoseMarkingPage] ✅ Pet name:', doseData.medications?.pets?.name || 'MISSING')
        return
      }

      // TRADITIONAL SESSION AUTH: Requires userId
      if (!userId) {
        setError('Please log in to mark medication as given')
        setLoading(false)
        return
      }

      // Get medication details with pet information (requires authentication)
      const { data: medData, error: medError } = await supabase
        .from('medications')
        .select('*, pets(name, species)')
        .eq('id', medicationId)
        .eq('user_id', userId)
        .single()

      if (medError || !medData) {
        setError('Medication not found')
        setLoading(false)
        return
      }

      setMedication(medData)
      setPet(medData.pets)

      // Check if medication is already complete
      const stats = await calculateProgressStats()
      if (stats?.isComplete) {
        setError('This medication course is already complete!')
      }

      setLoading(false)
    } catch (err) {
      console.error('Error loading medication:', err)
      setError('Failed to load medication details')
      setLoading(false)
    }
  }

  async function calculateProgressStats() {
    try {
      // Use actualMedicationId (UUID) not medicationId (which might be a short code)
      const medId = actualMedicationId || medicationId

      // Fetch all doses for this medication to calculate progress
      // IMPORTANT: Don't filter by status - include both 'pending' and 'given'
      const { data: doses, error: dosesError } = await supabase
        .from('medication_doses')
        .select('*')
        .eq('medication_id', medId)
        .order('scheduled_time', { ascending: true })

      if (dosesError || !doses) {
        console.error('[DoseMarkingPage] Failed to fetch doses for stats:', dosesError)
        return null
      }

      // Calculate TOTAL expected doses from medication schedule
      let totalExpectedDoses = 0
      if (medication?.start_date && medication?.end_date && medication?.reminder_times) {
        // Parse dates as local dates (not UTC) to avoid timezone bugs
        const [startYear, startMonth, startDay] = medication.start_date.split('-').map(Number)
        const startDate = new Date(startYear, startMonth - 1, startDay)

        const [endYear, endMonth, endDay] = medication.end_date.split('-').map(Number)
        const endDate = new Date(endYear, endMonth - 1, endDay)

        // Calculate total days in treatment (inclusive)
        // CRITICAL FIX: Use date-only comparison to avoid off-by-one errors from timestamps
        const startDay_dateOnly = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate())
        const endDay_dateOnly = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate())
        const totalDays = Math.round((endDay_dateOnly.getTime() - startDay_dateOnly.getTime()) / 86400000) + 1

        // Get doses per day from reminder_times array
        const dosesPerDay = (medication.reminder_times && Array.isArray(medication.reminder_times))
          ? medication.reminder_times.length
          : 1

        // Total doses = days * doses per day
        totalExpectedDoses = totalDays * dosesPerDay

        console.log('[DoseMarkingPage] Progress calculation:', {
          startDate: medication.start_date,
          endDate: medication.end_date,
          totalDays,
          dosesPerDay,
          totalExpectedDoses,
          dosesInDB: doses.length
        })
      } else {
        // Fallback to database count if medication dates are missing
        totalExpectedDoses = doses.length
        console.warn('[DoseMarkingPage] Missing medication dates, falling back to DB count')
      }

      const givenCount = doses.filter(d => d.status === 'given').length
      const remainingCount = totalExpectedDoses - givenCount
      const percentage = totalExpectedDoses > 0 ? Math.min(Math.round((givenCount / totalExpectedDoses) * 100), 100) : 0
      const isComplete = givenCount >= totalExpectedDoses && totalExpectedDoses > 0

      // Find next pending dose
      const nextDose = doses.find(d => d.status === 'pending')
      let nextDoseTime: string | null = null

      if (nextDose && !isComplete) {
        // Supabase returns timestamps without 'Z', so append it to parse as UTC
        const doseDate = new Date(
          nextDose.scheduled_time.endsWith('Z')
            ? nextDose.scheduled_time
            : nextDose.scheduled_time + 'Z'
        )
        const now = new Date()
        const tomorrow = new Date(now)
        tomorrow.setDate(tomorrow.getDate() + 1)

        // Format time string
        const timeStr = doseDate.toLocaleTimeString('en-US', {
          hour: 'numeric',
          minute: '2-digit',
          hour12: true
        })

        // Check if dose is in the past (overdue)
        const isOverdue = doseDate.getTime() < now.getTime()
        const isToday = doseDate.toDateString() === now.toDateString()
        const isTomorrow = doseDate.toDateString() === tomorrow.toDateString()

        if (isOverdue) {
          // Handle overdue doses
          if (isToday) {
            // Overdue from earlier today
            nextDoseTime = `Overdue - was ${timeStr}`
          } else {
            // Overdue from previous day(s)
            nextDoseTime = `Overdue`
          }
        } else {
          // Handle future doses
          if (isToday) {
            nextDoseTime = `Today ${timeStr}`
          } else if (isTomorrow) {
            nextDoseTime = `Tomorrow ${timeStr}`
          } else {
            const dayStr = doseDate.toLocaleDateString('en-US', { weekday: 'short' })
            nextDoseTime = `${dayStr} ${timeStr}`
          }
        }
      }

      // Calculate days remaining
      let daysRemaining: number | null = null
      if (medication?.end_date && !isComplete) {
        // Parse date string as local date to avoid timezone issues
        const [endYear, endMonth, endDay] = medication.end_date.split('-').map(Number)
        const endDate = new Date(endYear, endMonth - 1, endDay)
        const today = new Date()
        const todayDay = new Date(today.getFullYear(), today.getMonth(), today.getDate())
        const diffTime = endDate.getTime() - todayDay.getTime()
        const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24))
        daysRemaining = diffDays >= 0 ? diffDays : 0
      }

      const stats = {
        givenCount,
        totalCount: totalExpectedDoses,
        remainingCount,
        percentage,
        nextDoseTime,
        daysRemaining,
        isComplete
      }

      setProgressStats(stats)
      return stats
    } catch (err) {
      console.error('[DoseMarkingPage] Error calculating progress stats:', err)
      return null
    }
  }

  async function markAsGiven() {
    // Magic link auth (short code OR token) OR session auth (userId) - one of them must be present
    if (!shortCode && !magicToken && !userId) {
      setError('Please log in to mark medication as given')
      return
    }

    setMarking(true)
    setError(null)

    try {
      // BYPASS BACKEND: For short code users, update directly via Supabase
      if (shortCode) {
        console.log('[DoseMarkingPage] SHORT CODE: Bypassing backend, using Supabase directly')

        // Find dose by short code
        const { data: dose, error: findError } = await supabase
          .from('medication_doses')
          .select('*')
          .eq('short_code', shortCode)
          .single()

        if (findError || !dose) {
          console.error('[DoseMarkingPage] Invalid short code:', findError)
          setError('Invalid link. Please check your recent SMS.')
          setMarking(false)
          return
        }

        console.log('[DoseMarkingPage] Found dose:', dose.id, 'Status:', dose.status)

        // If already given, treat as success (idempotent)
        if (dose.status === 'given') {
          console.log('[DoseMarkingPage] Dose already marked as given - redirecting to success')
          window.location.href = `/dose-success?pet=${encodeURIComponent(pet?.name || 'Your pet')}&med=${encodeURIComponent(medication?.medication_name || 'medication')}&count=1&total=1`
          return
        }

        // VALIDATION: Check if all doses are already complete
        const { count: givenCount, error: countError } = await supabase
          .from('medication_doses')
          .select('*', { count: 'exact', head: true })
          .eq('medication_id', dose.medication_id)
          .eq('status', 'given')

        if (countError) {
          console.error('[DoseMarkingPage] Error counting doses:', countError)
          setError('Error checking medication status')
          setMarking(false)
          return
        }

        // Calculate total expected doses
        if (medication) {
          // Parse date strings as local dates to avoid timezone issues
          const [startYear, startMonth, startDay] = medication.start_date.split('-').map(Number)
          const start = new Date(startYear, startMonth - 1, startDay)
          const [endYear, endMonth, endDay] = medication.end_date.split('-').map(Number)
          const end = new Date(endYear, endMonth - 1, endDay)
          // CRITICAL FIX: Use date-only comparison to avoid off-by-one errors from timestamps
          const startDay_dateOnly = new Date(start.getFullYear(), start.getMonth(), start.getDate())
          const endDay_dateOnly = new Date(end.getFullYear(), end.getMonth(), end.getDate())
          const totalDays = Math.max(1, Math.round((endDay_dateOnly.getTime() - startDay_dateOnly.getTime()) / 86400000) + 1)
          const totalExpectedDoses = totalDays * (medication.times_per_day || 1)

          if ((givenCount || 0) >= totalExpectedDoses) {
            console.log('[DoseMarkingPage] All doses already complete:', { givenCount, totalExpectedDoses })
            setError('All doses have been recorded for this medication')
            setMarking(false)
            return
          }
        }

        // Mark as given directly via Supabase
        console.log('[DoseMarkingPage] Marking dose as given via Supabase...')
        const { error: updateError } = await supabase
          .from('medication_doses')
          .update({
            status: 'given',
            given_time: new Date().toISOString()
          })
          .eq('id', dose.id)

        if (updateError) {
          console.error('[DoseMarkingPage] Failed to update dose:', updateError)
          setError('Failed to mark dose as given. Please try again.')
          setMarking(false)
          return
        }

        console.log('[DoseMarkingPage] ✅ Dose marked as given via Supabase')

        // Calculate progress stats with timeout
        console.log('[DoseMarkingPage] Calculating progress stats...')
        let stats = null
        try {
          const statsPromise = calculateProgressStats()
          const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Stats timeout')), 3000)
          )
          stats = await Promise.race([statsPromise, timeoutPromise])
          console.log('[DoseMarkingPage] Stats calculated:', stats)
        } catch (statsError) {
          console.error('[DoseMarkingPage] Stats calculation failed/timeout:', statsError)
        }

        // Build success URL with stats
        const params = new URLSearchParams({
          pet: pet?.name || 'Your pet',
          med: medication?.medication_name || 'medication',
          count: String(stats?.givenCount || 1),
          total: String(stats?.totalCount || 1)
        })

        if (stats?.nextDoseTime) {
          params.set('next', stats.nextDoseTime)
        }

        console.log('[DoseMarkingPage] Redirecting to success page')
        window.location.href = `/dose-success?${params.toString()}`
        return
      }

      // FOR LEGACY TOKEN AND SESSION AUTH: Still use backend API
      console.log('[DoseMarkingPage] Using backend API for:', magicToken ? 'magic token' : 'session auth')

      const body = magicToken ? { token: magicToken } : { userId }
      const medId = actualMedicationId || medicationId
      const apiUrl = `${import.meta.env.VITE_API_URL || 'http://localhost:8787'}/api/medications/${medId}/mark-given`

      console.log('[DoseMarkingPage] Calling API:', apiUrl)

      // Create fetch with 10-second timeout
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 10000)

      let response
      try {
        response = await fetch(apiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal: controller.signal
        })
        clearTimeout(timeoutId)
      } catch (fetchError: any) {
        clearTimeout(timeoutId)
        console.error('[DoseMarkingPage] API call failed or timeout:', fetchError)
        if (fetchError.name === 'AbortError') {
          setError('Request timeout. Please try again or close this tab.')
        } else {
          setError('Network error. Please check your connection or close this tab.')
        }
        setMarking(false)
        return
      }

      console.log('[DoseMarkingPage] API response status:', response.status)

      let result
      try {
        result = await response.json()
        console.log('[DoseMarkingPage] API response body:', result)
      } catch (jsonError) {
        console.error('[DoseMarkingPage] Failed to parse response:', jsonError)
        setError('Something went wrong. Please try again or close this tab.')
        setMarking(false)
        return
      }

      if (!response.ok || !result.ok) {
        console.error('[DoseMarkingPage] API call failed:', { status: response.status, result })
        setError(result.error || 'Failed to mark dose as given')
        setMarking(false)
        return
      }

      console.log('[DoseMarkingPage] ✅ Successfully marked as given')

      // For standalone magic link users (not logged in), redirect to static success page
      if ((shortCode || magicToken) && !userId) {
        console.log('[DoseMarkingPage] Redirecting to static success page')

        // Calculate progress for display with timeout fallback
        console.log('[DoseMarkingPage] Calculating progress stats...')
        let stats = null
        try {
          const statsPromise = calculateProgressStats()
          const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Stats calculation timeout')), 3000)
          )
          stats = await Promise.race([statsPromise, timeoutPromise])
          console.log('[DoseMarkingPage] Stats calculated:', stats)
        } catch (statsError) {
          console.error('[DoseMarkingPage] Stats calculation failed/timeout:', statsError)
          // Continue anyway with fallback values
        }

        // Build success URL with display params
        const params = new URLSearchParams({
          pet: pet?.name || 'Your pet',
          med: medication?.medication_name || 'medication',
          count: String(stats?.givenCount || 1),
          total: String(stats?.totalCount || 1)
        })

        if (stats?.nextDoseTime) {
          params.set('next', stats.nextDoseTime)
        }

        console.log('[DoseMarkingPage] Redirecting to:', `/dose-success?${params.toString()}`)
        // Redirect to static success page - zero database calls from here on
        window.location.href = `/dose-success?${params.toString()}`
        return
      }

      // For logged-in users, show success modal
      await calculateProgressStats()
      setSuccess(true)
      setMarking(false)
    } catch (err) {
      console.error('Error marking dose:', err)
      setError('Failed to mark dose as given')
      setMarking(false)
    }
  }

  async function skipDose() {
    // Magic link auth (short code OR token) OR session auth (userId) - one of them must be present
    if (!shortCode && !magicToken && !userId) {
      setError('Please log in to skip this dose')
      return
    }

    setMarking(true)
    setError(null)

    try {
      // BYPASS BACKEND: For short code users, update directly via Supabase
      if (shortCode) {
        console.log('[DoseMarkingPage] SHORT CODE: Skipping dose via Supabase directly')

        // Find dose by short code
        const { data: dose, error: findError } = await supabase
          .from('medication_doses')
          .select('*')
          .eq('short_code', shortCode)
          .single()

        if (findError || !dose) {
          console.error('[DoseMarkingPage] Invalid short code:', findError)
          setError('Invalid link. Please check your recent SMS.')
          setMarking(false)
          return
        }

        console.log('[DoseMarkingPage] Found dose:', dose.id, 'Status:', dose.status)

        // Mark as skipped directly via Supabase
        console.log('[DoseMarkingPage] Marking dose as skipped via Supabase...')
        const { error: updateError } = await supabase
          .from('medication_doses')
          .update({
            status: 'skipped',
            given_time: new Date().toISOString() // Reuse given_time to track when skipped
          })
          .eq('id', dose.id)

        if (updateError) {
          console.error('[DoseMarkingPage] Failed to update dose:', updateError)
          setError('Failed to skip dose. Please try again.')
          setMarking(false)
          return
        }

        console.log('[DoseMarkingPage] ✅ Dose marked as skipped via Supabase')

        // Redirect to a simple confirmation (we could create a dose-skipped page later)
        // For now, just redirect to dose-success with a skipped flag
        const params = new URLSearchParams({
          pet: pet?.name || 'Your pet',
          med: medication?.medication_name || 'medication',
          skipped: 'true'
        })

        console.log('[DoseMarkingPage] Redirecting to success page with skipped=true')
        window.location.href = `/dose-success?${params.toString()}`
        return
      }

      // FOR LEGACY TOKEN AND SESSION AUTH: Use backend API if available, otherwise Supabase
      console.log('[DoseMarkingPage] Skipping dose for:', magicToken ? 'magic token' : 'session auth')

      // Try direct Supabase update for all cases (simpler)
      const medId = actualMedicationId || medicationId

      // Find the pending dose for this medication
      const { data: doses, error: findError } = await supabase
        .from('medication_doses')
        .select('*')
        .eq('medication_id', medId)
        .eq('status', 'pending')
        .order('scheduled_time', { ascending: true })
        .limit(1)

      if (findError || !doses || doses.length === 0) {
        console.error('[DoseMarkingPage] No pending dose found:', findError)
        setError('No pending dose found to skip.')
        setMarking(false)
        return
      }

      const dose = doses[0]

      // Update to skipped
      const { error: updateError } = await supabase
        .from('medication_doses')
        .update({
          status: 'skipped',
          given_time: new Date().toISOString()
        })
        .eq('id', dose.id)

      if (updateError) {
        console.error('[DoseMarkingPage] Failed to skip dose:', updateError)
        setError('Failed to skip dose. Please try again.')
        setMarking(false)
        return
      }

      console.log('[DoseMarkingPage] ✅ Dose skipped successfully')

      // For standalone magic link users (not logged in), redirect to static success page
      if ((shortCode || magicToken) && !userId) {
        const params = new URLSearchParams({
          pet: pet?.name || 'Your pet',
          med: medication?.medication_name || 'medication',
          skipped: 'true'
        })

        window.location.href = `/dose-success?${params.toString()}`
        return
      }

      // For logged-in users, just close
      onClose(true)
    } catch (err) {
      console.error('Error skipping dose:', err)
      setError('Failed to skip dose')
      setMarking(false)
    }
  }

  if (loading) {
    return (
      <div className="fixed inset-0 bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
        <div className="bg-white rounded-lg p-8 max-w-md w-full mx-4 shadow-xl">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-gray-600">Loading medication details...</p>
          </div>
        </div>
      </div>
    )
  }

  if (error && !medication) {
    return (
      <div className="fixed inset-0 bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
        <div className="bg-white rounded-lg p-8 max-w-md w-full mx-4 shadow-xl">
          <div className="text-center">
            <div className="text-red-600 text-5xl mb-4">⚠️</div>
            <h2 className="text-2xl font-bold text-gray-800 mb-4">Error</h2>
            <p className="text-gray-600 mb-6">{error}</p>
            <button
              onClick={onClose}
              className="bg-gray-600 text-white px-6 py-2 rounded-lg hover:bg-gray-700"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (success) {
    // Show standalone success page for unauthenticated users (magic link)
    // They don't have access to the dashboard, so don't redirect
    return (
      <div className="fixed inset-0 bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
        <div className="bg-white rounded-lg p-8 max-w-md w-full mx-4 max-h-[90vh] overflow-y-auto shadow-xl">
          <div className="text-center">
            <div className="text-green-600 text-6xl mb-4">✓</div>
            <h2 className="text-2xl font-bold text-gray-800 mb-2">
              {progressStats?.isComplete ? 'All doses complete!' : `Dose ${progressStats?.givenCount || 1} of ${progressStats?.totalCount || 1} complete`}
            </h2>
            <p className="text-gray-600 text-base mb-6">
              {pet?.name || 'Your pet'} • {medication?.medication_name || 'Medication'}
            </p>

            {/* Progress Stats Section */}
            {progressStats && (
              <div className="bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-200 rounded-xl p-5 mb-6 text-left">
                {/* Progress Bar */}
                <div className="mb-4">
                  <div className="w-full bg-gray-200 rounded-full h-4 overflow-hidden shadow-inner mb-3">
                    <div
                      className="h-full bg-gradient-to-r from-green-400 to-green-600 rounded-full transition-all duration-500 ease-out shadow-sm"
                      style={{ width: `${progressStats.percentage}%` }}
                    />
                  </div>
                  <div className="text-center">
                    <span className="text-2xl font-bold text-gray-800">{progressStats.percentage}%</span>
                    <p className="text-sm text-gray-600 mt-1">
                      {progressStats.isComplete
                        ? '🎉 Treatment complete!'
                        : progressStats.remainingCount === 1
                        ? 'Just 1 more dose!'
                        : `${progressStats.remainingCount} doses to go`}
                    </p>
                  </div>
                </div>

                {/* Stats Grid */}
                {!progressStats.isComplete && (
                  <div className="space-y-3">
                    {progressStats.nextDoseTime && (
                      <div className="flex items-center justify-between py-2 px-3 bg-white/60 rounded-lg">
                        <span className="text-sm text-gray-600">Next dose:</span>
                        <span className="text-sm font-semibold text-gray-800">
                          {progressStats.nextDoseTime}
                        </span>
                      </div>
                    )}
                    {progressStats.daysRemaining !== null && progressStats.daysRemaining >= 0 && (
                      <div className="flex items-center justify-between py-2 px-3 bg-white/60 rounded-lg">
                        <span className="text-sm text-gray-600">Days remaining:</span>
                        <span className="text-sm font-semibold text-gray-800">
                          {progressStats.daysRemaining === 0
                            ? 'Last day'
                            : progressStats.daysRemaining === 1
                            ? '1 day'
                            : `${progressStats.daysRemaining} days`}
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Message for magic link users (not logged in) */}
            {(shortCode || magicToken) && !userId ? (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
                {progressStats?.nextDoseTime ? (
                  <>
                    <p className="text-blue-800 text-sm font-medium text-center mb-2">
                      ✓ All done! You can close this tab now.
                    </p>
                    <p className="text-blue-700 text-xs text-center">
                      📅 Next reminder: {progressStats.nextDoseTime}
                    </p>
                  </>
                ) : progressStats?.isComplete ? (
                  <p className="text-blue-800 text-sm font-medium text-center">
                    🎉 Treatment complete! You can close this tab.
                  </p>
                ) : (
                  <p className="text-blue-800 text-sm font-medium text-center">
                    ✓ All done! You can close this tab now.
                  </p>
                )}
              </div>
            ) : (
              <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6">
                <p className="text-green-800 text-sm">
                  ✓ Your pet's medication has been recorded. You're all set!
                </p>
              </div>
            )}

            <button
              onClick={() => {
                if ((shortCode || magicToken) && !userId) {
                  window.close()
                  return
                }
                onClose(true)
              }}
              className="bg-green-600 text-white px-6 py-3 rounded-lg hover:bg-green-700 font-semibold"
            >
              {(shortCode || magicToken) && !userId ? 'Done' : 'View Dashboard'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  // Calculate progress info for display (only when medication is loaded)
  let progressInfo: {
    currentDoseNumber: number
    totalDoses: number
    percentage: number
    daysRemaining: number | null
    scheduledTime: string | null
  } | null = null

  if (medication && currentDose) {
    try {
      // Calculate total doses from medication schedule
      let totalDoses = 0
      if (medication.start_date && medication.end_date && medication.reminder_times) {
        const [startYear, startMonth, startDay] = medication.start_date.split('-').map(Number)
        const startDate = new Date(startYear, startMonth - 1, startDay)
        const [endYear, endMonth, endDay] = medication.end_date.split('-').map(Number)
        const endDate = new Date(endYear, endMonth - 1, endDay)

        const startDay_dateOnly = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate())
        const endDay_dateOnly = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate())
        const totalDays = Math.round((endDay_dateOnly.getTime() - startDay_dateOnly.getTime()) / 86400000) + 1

        const dosesPerDay = Array.isArray(medication.reminder_times) ? medication.reminder_times.length : 1
        totalDoses = totalDays * dosesPerDay
      }

      // Calculate days remaining
      let daysRemaining: number | null = null
      if (medication.end_date) {
        const today = new Date()
        const todayDay = new Date(today.getFullYear(), today.getMonth(), today.getDate())
        const [endYear, endMonth, endDay] = medication.end_date.split('-').map(Number)
        const endDate = new Date(endYear, endMonth - 1, endDay)
        const diffTime = endDate.getTime() - todayDay.getTime()
        const diffDays = Math.ceil(diffTime / 86400000)
        daysRemaining = diffDays >= 0 ? diffDays : 0
      }

      // Format scheduled time
      let scheduledTime: string | null = null
      if (currentDose.scheduled_time) {
        // scheduled_time is stored in local time format (e.g., "2026-01-06T20:00:00")
        // Do NOT append 'Z' - that would incorrectly treat it as UTC
        // If it already has 'Z', remove it to parse as local time
        const timeStr = currentDose.scheduled_time.endsWith('Z')
          ? currentDose.scheduled_time.slice(0, -1)
          : currentDose.scheduled_time
        const doseDate = new Date(timeStr)
        scheduledTime = doseDate.toLocaleTimeString('en-US', {
          hour: 'numeric',
          minute: '2-digit',
          hour12: true
        })
      }

      // Current dose number = givenCount + 1 (this is the dose they're about to mark)
      // We'll fetch this from progressStats if available, or default to 1
      // Cap at totalDoses to prevent showing "Dose 15 of 14" if progressStats is stale
      const rawCurrentDoseNumber = (progressStats?.givenCount || 0) + 1
      const currentDoseNumber = totalDoses > 0 ? Math.min(rawCurrentDoseNumber, totalDoses) : rawCurrentDoseNumber
      const percentage = totalDoses > 0 ? Math.round((currentDoseNumber / totalDoses) * 100) : 0

      progressInfo = {
        currentDoseNumber,
        totalDoses,
        percentage,
        daysRemaining,
        scheduledTime
      }
    } catch (err) {
      console.error('[DoseMarkingPage] Error calculating progress info:', err)
    }
  }

  return (
    <div className="fixed inset-0 bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
      <div className="bg-white rounded-lg p-8 max-w-md w-full mx-4 shadow-xl">
        <div className="text-center">
          <div className="text-blue-600 text-5xl mb-4">💊</div>
          <h2 className="text-2xl font-bold text-gray-800 mb-2">
            Mark Medication as Given?
          </h2>
          <div className="bg-gray-50 rounded-lg p-4 mb-6 text-left">
            <p className="text-sm text-gray-600 mb-1">Pet:</p>
            <p className="text-lg font-semibold text-gray-800 mb-3">{pet?.name}</p>
            <p className="text-sm text-gray-600 mb-1">Medication:</p>
            <p className="text-lg font-semibold text-gray-800 mb-3">{medication?.medication_name}</p>
            {medication?.dosage && (
              <>
                <p className="text-sm text-gray-600 mb-1">Dosage:</p>
                <p className="text-lg font-semibold text-gray-800">{medication.dosage}</p>
              </>
            )}
          </div>

          {progressInfo && (
            <div className="bg-gradient-to-br from-emerald-50 to-green-50 border border-emerald-200 rounded-lg p-4 mb-6 text-left">
              {/* Progress label */}
              <div className="text-center mb-3">
                <p className="text-sm font-semibold text-emerald-800">
                  Dose {progressInfo.currentDoseNumber} of {progressInfo.totalDoses}
                </p>
              </div>

              {/* Progress bar */}
              <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden mb-4">
                <div
                  className="h-full bg-gradient-to-r from-emerald-500 to-green-600 rounded-full transition-all duration-300"
                  style={{ width: `${progressInfo.percentage}%` }}
                />
              </div>

              {/* Additional info grid */}
              <div className="space-y-2 text-sm">
                {progressInfo.scheduledTime && (
                  <div className="flex justify-between items-center">
                    <span className="text-gray-600">Scheduled:</span>
                    <span className="font-medium text-gray-800">{progressInfo.scheduledTime}</span>
                  </div>
                )}
                {progressInfo.daysRemaining !== null && (
                  <div className="flex justify-between items-center">
                    <span className="text-gray-600">Days remaining:</span>
                    <span className="font-medium text-gray-800">
                      {progressInfo.daysRemaining === 0
                        ? 'Last day'
                        : progressInfo.daysRemaining === 1
                        ? '1 day'
                        : `${progressInfo.daysRemaining} days`}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4">
              <p className="text-red-700 text-sm">{error}</p>
            </div>
          )}

          <div className="flex flex-col gap-3">
            <button
              onClick={markAsGiven}
              disabled={marking}
              className="bg-green-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {marking ? (
                <>
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                  Marking...
                </>
              ) : (
                <>
                  ✓ Yes, I gave it
                </>
              )}
            </button>
            <button
              onClick={skipDose}
              disabled={marking}
              className="bg-gray-200 text-gray-700 px-6 py-2 rounded-lg hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Skip this dose
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
