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
        const totalDays = Math.floor((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1

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
        const doseDate = new Date(nextDose.scheduled_time)
        const now = new Date()
        const tomorrow = new Date(now)
        tomorrow.setDate(tomorrow.getDate() + 1)

        // Format as "Today 2:30 PM" or "Tomorrow 9:00 AM" or "Mon 12:00 PM"
        const isToday = doseDate.toDateString() === now.toDateString()
        const isTomorrow = doseDate.toDateString() === tomorrow.toDateString()

        const timeStr = doseDate.toLocaleTimeString('en-US', {
          hour: 'numeric',
          minute: '2-digit',
          hour12: true
        })

        if (isToday) {
          nextDoseTime = `Today ${timeStr}`
        } else if (isTomorrow) {
          nextDoseTime = `Tomorrow ${timeStr}`
        } else {
          const dayStr = doseDate.toLocaleDateString('en-US', { weekday: 'short' })
          nextDoseTime = `${dayStr} ${timeStr}`
        }
      }

      // Calculate days remaining
      let daysRemaining: number | null = null
      if (medication?.end_date && !isComplete) {
        const endDate = new Date(medication.end_date)
        const today = new Date()
        today.setHours(0, 0, 0, 0)
        endDate.setHours(0, 0, 0, 0)
        const diffTime = endDate.getTime() - today.getTime()
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
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

  function skipDose() {
    // Just close the modal without marking
    onClose()
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
