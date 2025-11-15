import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

interface DoseMarkingPageProps {
  medicationId: string
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
  // Extract magic link token from URL if present
  const [magicToken, setMagicToken] = useState<string | null>(null)

  useEffect(() => {
    // Extract token from URL and pass it directly to loadMedicationDetails
    // This avoids a race condition where setState hasn't updated yet
    const urlParams = new URLSearchParams(window.location.search)
    const token = urlParams.get('token')

    if (token) {
      setMagicToken(token)
      console.log('[DoseMarkingPage] Magic link token detected:', token.slice(0, 8) + '...')
    }

    // Pass token directly (don't rely on magicToken state which may not be updated yet)
    loadMedicationDetails(token)
  }, [medicationId, userId])

  async function loadMedicationDetails(tokenFromUrl: string | null = null) {
    try {
      // Use tokenFromUrl (passed directly) OR magicToken (from state)
      const effectiveToken = tokenFromUrl || magicToken

      // MAGIC LINK AUTH: If token is present, use it to load medication details
      // This works without requiring the user to be logged in
      if (effectiveToken) {
        console.log('[DoseMarkingPage] Loading via magic token:', effectiveToken.slice(0, 8) + '...')

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

  async function markAsGiven() {
    // Magic link auth (token) OR session auth (userId) - one of them must be present
    if (!magicToken && !userId) {
      setError('Please log in to mark medication as given')
      return
    }

    setMarking(true)
    setError(null)

    try {
      // Call backend API to mark dose as given
      // Pass either token (magic link) or userId (session auth)
      const body = magicToken
        ? { token: magicToken }
        : { userId }

      console.log('[DoseMarkingPage] Marking as given with:', magicToken ? 'magic link token' : 'session auth')

      const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:8787'}/api/medications/${medicationId}/mark-given`, {
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
      setSuccess(true)
      setMarking(false)

      // Redirect to medications dashboard after 2 seconds
      // Pass true to indicate dose was successfully marked
      setTimeout(() => {
        onClose(true)
      }, 2000)
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
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-8 max-w-md w-full mx-4">
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
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-8 max-w-md w-full mx-4">
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
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-8 max-w-md w-full mx-4">
          <div className="text-center">
            <div className="text-green-600 text-6xl mb-4">✓</div>
            <h2 className="text-2xl font-bold text-gray-800 mb-4">Medication Marked!</h2>
            <p className="text-gray-700 mb-2 text-lg">
              <strong>{medication?.medication_name || 'Medication'}</strong>
            </p>
            <p className="text-gray-600 mb-6">
              has been marked as given for <strong>{pet?.name || 'your pet'}</strong>
            </p>

            <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6">
              <p className="text-green-800 text-sm">
                ✓ Your pet's medication has been recorded. You're all set!
              </p>
            </div>

            {/* Only show redirect message if user is logged in */}
            {userId && (
              <p className="text-sm text-gray-500 mb-4">Taking you to the medications dashboard...</p>
            )}

            <button
              onClick={() => {
                // If logged in, redirect to medications (onClose will handle it)
                // If logged out, just close and stay on current page
                if (!userId && !magicToken) {
                  // For magic link users, close the modal and show a message
                  window.location.href = '/'
                } else {
                  onClose(true)
                }
              }}
              className="bg-green-600 text-white px-6 py-3 rounded-lg hover:bg-green-700 font-semibold"
            >
              {userId ? 'View Dashboard' : 'Done'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-8 max-w-md w-full mx-4">
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
