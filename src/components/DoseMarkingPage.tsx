import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'

interface DoseMarkingPageProps {
  medicationId: string // Can be short_code (8 chars), UUID, or 'new' for inline use
  userId: string | null
  onClose: (wasMarked?: boolean) => void
}

// Helper to get local ISO string for PST
function getLocalISOString(): string {
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`
}

// Helper to get today's date string in local timezone
function getTodayDateString(): string {
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

export default function DoseMarkingPage({ medicationId, userId, onClose }: DoseMarkingPageProps) {
  const [medication, setMedication] = useState<any>(null)
  const [pet, setPet] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [marking, setMarking] = useState(false)
  const markingRef = useRef(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [alreadyGivenToday, setAlreadyGivenToday] = useState(false)
  // Store the actual medication UUID (resolved from short code if needed)
  const [actualMedicationId, setActualMedicationId] = useState<string | null>(null)
  // Short code for backwards compatibility with old SMS links
  const [shortCode, setShortCode] = useState<string | null>(null)
  // Legacy dose record (for old SMS links)
  const [legacyDose, setLegacyDose] = useState<any>(null)

  useEffect(() => {
    if (success) return
    loadMedicationDetails()
  }, [medicationId, userId, success])

  async function loadMedicationDetails() {
    try {
      const isShortCode = medicationId.length === 8 && !medicationId.includes('-')
      const isUUID = medicationId.includes('-')

      // SHORT CODE LOOKUP - use server API to bypass RLS restrictions
      if (isShortCode) {
        try {
          // Use Render backend URL (not relative path which goes to Vercel)
          const apiBase = import.meta.env.DEV ? 'http://localhost:8787' : 'https://pet-claim-helper.onrender.com'
          console.log('[DoseMarkingPage] Fetching dose by short code:', medicationId, 'from', apiBase)
          const response = await fetch(`${apiBase}/api/doses/by-short-code/${medicationId}`)

          let result
          try {
            result = await response.json()
          } catch (parseErr) {
            console.error('[DoseMarkingPage] Failed to parse API response:', parseErr)
            setError(`API Error (${response.status}): Invalid response - ${response.statusText}`)
            setLoading(false)
            return
          }

          console.log('[DoseMarkingPage] API response:', { status: response.status, ok: response.ok, result })

          if (!response.ok || !result.ok) {
            const errorMsg = result.error || result.message || 'Unknown error'
            console.error('[DoseMarkingPage] API error:', { status: response.status, error: errorMsg, fullResult: result })
            setError(`API Error (${response.status}): ${errorMsg}`)
            setLoading(false)
            return
          }

          // Map server response to component state
          setMedication({
            id: result.medication?.id,
            medication_name: result.medication?.name,
            dosage: result.medication?.dosage,
            frequency: result.medication?.frequency,
            reminder_times: result.medication?.reminderTimes,
            user_id: result.dose?.userId
          })
          setPet({
            id: result.pet?.id,
            name: result.pet?.name,
            species: result.pet?.species
          })
          setActualMedicationId(result.dose?.medicationId)
          setShortCode(medicationId)
          setLegacyDose({
            id: result.dose?.id,
            status: result.dose?.status,
            medication_id: result.dose?.medicationId
          })

          // Check if this specific dose is already given
          if (result.dose?.status === 'given') {
            setAlreadyGivenToday(true)
          }

          setLoading(false)
          return
        } catch (err: any) {
          console.error('[DoseMarkingPage] Fetch error:', err)
          setError(`Network error: ${err.message || 'Failed to connect to server'}`)
          setLoading(false)
          return
        }
      }

      // UUID LOOKUP (direct medication ID)
      if (isUUID) {
        // Try to get medication directly (for logged-in users)
        const query = supabase
          .from('medications')
          .select('*, pets(name, species)')
          .eq('id', medicationId)

        // Add user filter if logged in
        if (userId) {
          query.eq('user_id', userId)
        }

        const { data: medData, error: medError } = await query.single()

        if (medError || !medData) {
          setError('Medication not found')
          setLoading(false)
          return
        }

        setMedication(medData)
        setPet(medData.pets)
        setActualMedicationId(medicationId)

        // Check if already given today
        const today = getTodayDateString()
        const { count } = await supabase
          .from('medication_doses')
          .select('*', { count: 'exact', head: true })
          .eq('medication_id', medicationId)
          .eq('status', 'given')
          .gte('given_time', `${today}T00:00:00`)
          .lte('given_time', `${today}T23:59:59`)

        if (count && count > 0) {
          // Calculate expected doses today
          let expectedToday = 1
          if (Array.isArray(medData.reminder_times)) {
            expectedToday = medData.reminder_times.length
          }
          if (count >= expectedToday) {
            setAlreadyGivenToday(true)
          }
        }

        setLoading(false)
        return
      }

      setError('Invalid medication link')
      setLoading(false)
    } catch (err) {
      console.error('Error loading medication:', err)
      setError('Failed to load medication details')
      setLoading(false)
    }
  }

  async function markAsGiven() {
    if (markingRef.current) return
    markingRef.current = true
    setMarking(true)
    setError(null)

    try {
      const medId = actualMedicationId || medicationId
      const today = getTodayDateString()
      const nowISO = getLocalISOString()

      // LEGACY: If we have a short code dose, update that specific dose record
      if (shortCode && legacyDose) {
        if (legacyDose.status === 'given') {
          // Already given - redirect to success
          redirectToSuccess()
          return
        }

        const { error: updateError } = await supabase
          .from('medication_doses')
          .update({
            status: 'given',
            given_time: nowISO
          })
          .eq('id', legacyDose.id)

        if (updateError) {
          setError('Failed to mark dose as given. Please try again.')
          setMarking(false)
          markingRef.current = false
          return
        }

        redirectToSuccess()
        return
      }

      // NEW SIMPLIFIED: Insert a new log entry for today's dose
      const { error: insertError } = await supabase
        .from('medication_doses')
        .insert({
          medication_id: medId,
          user_id: userId || medication?.user_id,
          status: 'given',
          given_time: nowISO,
          scheduled_time: nowISO, // Use current time as scheduled time for simplified flow
          dose_date: today
        })

      if (insertError) {
        // Handle unique constraint violation (already given)
        if (insertError.code === '23505') {
          setAlreadyGivenToday(true)
          setMarking(false)
          markingRef.current = false
          return
        }
        setError('Failed to mark dose as given. Please try again.')
        setMarking(false)
        markingRef.current = false
        return
      }

      // Success!
      if (userId) {
        // Logged-in user - show success inline
        setSuccess(true)
        markingRef.current = false
        setMarking(false)
      } else {
        // SMS user - redirect to success page
        redirectToSuccess()
      }
    } catch (err) {
      console.error('Error marking dose:', err)
      setError('Failed to mark dose as given')
      markingRef.current = false
      setMarking(false)
    }
  }

  function redirectToSuccess() {
    const params = new URLSearchParams({
      pet: pet?.name || 'Your pet',
      med: medication?.medication_name || 'medication'
    })
    window.location.href = `/dose-success?${params.toString()}`
  }

  // Loading state
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

  // Error state (no medication loaded)
  if (error && !medication) {
    return (
      <div className="fixed inset-0 bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
        <div className="bg-white rounded-lg p-8 max-w-md w-full mx-4 shadow-xl">
          <div className="text-center">
            <div className="text-red-600 text-5xl mb-4">⚠️</div>
            <h2 className="text-2xl font-bold text-gray-800 mb-4">Error</h2>
            <p className="text-gray-600 mb-6">{error}</p>
            <button
              onClick={() => onClose()}
              className="bg-gray-600 text-white px-6 py-2 rounded-lg hover:bg-gray-700"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    )
  }

  // Already given state
  if (alreadyGivenToday && !success) {
    return (
      <div className="fixed inset-0 bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
        <div className="bg-white rounded-lg p-8 max-w-md w-full mx-4 shadow-xl">
          <div className="text-center">
            <div className="text-green-600 text-6xl mb-4">✓</div>
            <h2 className="text-2xl font-bold text-gray-800 mb-2">Already recorded!</h2>
            <p className="text-gray-600 mb-6">
              {pet?.name}'s {medication?.medication_name} was already marked as given today.
            </p>
            <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6">
              <p className="text-green-800 text-sm font-medium text-center">
                ✓ You're all set! You can close this tab.
              </p>
            </div>
            <button
              onClick={() => {
                if (!userId) {
                  window.close()
                } else {
                  onClose(false)
                }
              }}
              className="bg-green-600 text-white px-6 py-3 rounded-lg hover:bg-green-700 font-semibold"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    )
  }

  // Success state (for logged-in users)
  if (success) {
    return (
      <div className="fixed inset-0 bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
        <div className="bg-white rounded-lg p-8 max-w-md w-full mx-4 shadow-xl">
          <div className="text-center">
            <div className="text-green-600 text-6xl mb-4">✓</div>
            <h2 className="text-2xl font-bold text-gray-800 mb-2">Dose recorded!</h2>
            <p className="text-gray-600 mb-6">
              {pet?.name}'s {medication?.medication_name}
            </p>
            <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6">
              <p className="text-green-800 text-sm font-medium text-center">
                ✓ Great job keeping up with your pet's medication!
              </p>
            </div>
            <button
              onClick={() => onClose(true)}
              className="bg-green-600 text-white px-6 py-3 rounded-lg hover:bg-green-700 font-semibold"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    )
  }

  // Main marking UI - SIMPLIFIED
  return (
    <div className="fixed inset-0 bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
      <div className="bg-white rounded-lg p-8 max-w-md w-full mx-4 shadow-xl">
        <div className="text-center">
          <div className="text-blue-600 text-5xl mb-4">💊</div>
          <h2 className="text-2xl font-bold text-gray-800 mb-2">
            Mark as given?
          </h2>

          {/* Medication details */}
          <div className="bg-gray-50 rounded-lg p-4 mb-6 text-left">
            <p className="text-sm text-gray-600 mb-1">Pet:</p>
            <p className="text-lg font-semibold text-gray-800 mb-3">{pet?.name || 'Your pet'}</p>
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

          {/* Action buttons */}
          <div className="flex flex-col gap-3">
            <button
              onClick={markAsGiven}
              disabled={marking}
              className="bg-green-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {marking ? (
                <>
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                  Recording...
                </>
              ) : (
                <>✓ Yes, I gave it</>
              )}
            </button>
            {userId && (
              <button
                onClick={() => onClose(false)}
                disabled={marking}
                className="bg-gray-200 text-gray-700 px-6 py-2 rounded-lg hover:bg-gray-300 disabled:opacity-50"
              >
                Cancel
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
