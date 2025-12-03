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
          .eq('status', 'pending')
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
          .eq('status', 'pending')
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
      const { data: doses, error: dosesError } = await supabase
        .from('medication_doses')
        .select('*')
        .eq('medication_id', medId)
        .order('scheduled_time', { ascending: true })

      if (dosesError || !doses) {
        console.error('[DoseMarkingPage] Failed to fetch doses for stats:', dosesError)
        return
      }

      // Calculate TOTAL doses from medication schedule (NOT from database row count!)
      // This fixes the bug where it showed "1 of 1 doses" instead of "1 of 7 doses"
      let totalCount = 0
      if (medication?.start_date && medication?.end_date) {
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
        totalCount = totalDays * dosesPerDay

        console.log('[DoseMarkingPage] Progress calculation:', {
          startDate: medication.start_date,
          endDate: medication.end_date,
          totalDays,
          dosesPerDay,
          totalCount,
          dosesInDB: doses.length
        })
      } else {
        // Fallback to database count if medication dates are missing
        totalCount = doses.length
        console.warn('[DoseMarkingPage] Missing medication dates, falling back to DB count')
      }

      const givenCount = doses.filter(d => d.status === 'given').length
      const percentage = totalCount > 0 ? Math.round((givenCount / totalCount) * 100) : 0
      const isComplete = givenCount === totalCount && totalCount > 0

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

      setProgressStats({
        givenCount,
        totalCount,
        percentage,
        nextDoseTime,
        daysRemaining,
        isComplete
      })
    } catch (err) {
      console.error('[DoseMarkingPage] Error calculating progress stats:', err)
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
      // Call backend API to mark dose as given
      // Pass one of: shortCode (new), token (legacy), or userId (session auth)
      const body = shortCode
        ? { shortCode }
        : magicToken
        ? { token: magicToken }
        : { userId }

      console.log('[DoseMarkingPage] Marking as given with:', shortCode ? 'short code' : magicToken ? 'magic link token' : 'session auth')

      // Use actualMedicationId if available (from short code lookup), otherwise use medicationId
      const medId = actualMedicationId || medicationId

      const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:8787'}/api/medications/${medId}/mark-given`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      })

      const result = await response.json()

      if (!response.ok || !result.ok) {
        setError(result.error || 'Failed to mark dose as given')
        setMarking(false)
        return
      }

      console.log('[DoseMarkingPage] ✅ Successfully marked as given')

      // Calculate progress stats for success modal (only for logged-in users)
      // For standalone magic link users, skip progress stats to avoid DB queries
      if (userId && actualMedicationId) {
        await calculateProgressStats()
      }

      setSuccess(true)
      setMarking(false)

      // Success modal will stay visible until user clicks button
      // No auto-redirect - user controls when to leave
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
            <div className="text-green-600 text-6xl mb-4">🎉</div>
            <h2 className="text-2xl font-bold text-gray-800 mb-2">Nice work!</h2>
            <p className="text-gray-700 text-lg mb-6">
              You've given <strong>{pet?.name || 'your pet'}</strong> their <strong>{medication?.medication_name || 'medication'}</strong>
            </p>

            {/* Progress Stats Section */}
            {progressStats && (
              <div className="bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-200 rounded-xl p-5 mb-6 text-left">
                <h3 className="text-sm font-semibold text-gray-700 mb-3 text-center">Treatment Progress</h3>

                {/* Progress Bar */}
                <div className="mb-4">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-sm font-medium text-gray-700">
                      {progressStats.givenCount} of {progressStats.totalCount} doses
                    </span>
                    <span className="text-sm font-bold text-indigo-600">
                      {progressStats.percentage}%
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden shadow-inner">
                    <div
                      className="h-full bg-gradient-to-r from-green-400 to-green-600 rounded-full transition-all duration-500 ease-out shadow-sm"
                      style={{ width: `${progressStats.percentage}%` }}
                    />
                  </div>
                </div>

                {/* Stats Grid */}
                {progressStats.isComplete ? (
                  <div className="bg-green-100 border border-green-300 rounded-lg p-4 text-center">
                    <div className="text-2xl mb-2">🎉</div>
                    <p className="text-green-800 font-semibold">
                      All doses complete!
                    </p>
                    <p className="text-green-700 text-sm mt-1">
                      Treatment finished
                    </p>
                  </div>
                ) : (
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
                // For magic link users (not logged in), just try to close the window
                if ((shortCode || magicToken) && !userId) {
                  // Try to close the window - works in most mobile browsers when opened from SMS
                  window.close()
                  // Note: If window.close() doesn't work, user can close manually
                  return
                }

                // For logged in users, close modal and return to dashboard
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
