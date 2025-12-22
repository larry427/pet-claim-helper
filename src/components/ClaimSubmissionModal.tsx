import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import MissingFieldsModal from './MissingFieldsModal'

// Constants for test mode detection
const DEMO_ACCOUNTS = [
  'demo@petclaimhelper.com',
  'drsarah@petclaimhelper.com',
  'david@mybenefitexperience.com',
  'larry@uglydogadventures.com',
  'larrysecrets@gmail.com'
]

const PRODUCTION_INSURERS = [
  'pumpkin',
  'spot',
  'healthy paws',
  'nationwide',
  'trupanion',
  'pets best',
  'figo',
  'aspca'
]

interface ClaimSubmissionModalProps {
  claim: any
  pet: any
  userId: string
  onClose: () => void
  onSuccess: (messageId: string) => void
}

export default function ClaimSubmissionModal({ claim, pet, userId, onClose, onSuccess }: ClaimSubmissionModalProps) {
  const [step, setStep] = useState<'validating' | 'collect-missing-fields' | 'confirm' | 'submitting' | 'success' | 'error' | 'missing-data'>('validating')
  const [messageId, setMessageId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isLoadingPreview, setIsLoadingPreview] = useState(false)
  const [profile, setProfile] = useState<any>(null)
  const [missingFieldsData, setMissingFieldsData] = useState<{
    insurerName: string
    missingFields: any[]
    existingData: any
    suggestedValues: any
  } | null>(null)

  const insurer = pet?.insurance_company || 'Nationwide'
  const amount = claim.total_amount ? `$${parseFloat(claim.total_amount).toFixed(2)}` : '$0.00'

  // Determine if test mode is active based on user email and insurer
  const isTestMode = () => {
    const userEmail = (profile?.email || '').toLowerCase()
    const normalizedInsurer = (insurer || '').toLowerCase()

    // Test mode is active if:
    // 1. User is a demo account, OR
    // 2. Insurer is not in production list
    const isDemoAccount = DEMO_ACCOUNTS.some(email => email.toLowerCase() === userEmail)
    const isProductionInsurer = PRODUCTION_INSURERS.some(prodInsurer =>
      normalizedInsurer.includes(prodInsurer.toLowerCase())
    )

    return isDemoAccount || !isProductionInsurer
  }

  // Validate required data using API
  useEffect(() => {
    async function validateData() {
      try {
        setStep('validating')

        console.log('[ClaimSubmissionModal] Starting validation...')
        console.log('[ClaimSubmissionModal] claim:', claim)
        console.log('[ClaimSubmissionModal] pet:', pet)
        console.log('[ClaimSubmissionModal] pet.insurance_company:', pet?.insurance_company)

        // Fetch user profile for reference
        const { data: profileData, error: profileError } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', userId)
          .single()

        if (profileError) throw profileError
        setProfile(profileData)

        // Determine insurer name from pet's insurance_company
        const insurerName = pet?.insurance_company?.toLowerCase() || ''

        console.log('[ClaimSubmissionModal] insurerName:', insurerName)

        if (!insurerName || insurerName === 'not insured' || insurerName === 'none') {
          console.log('[ClaimSubmissionModal] No insurance company found')
          setError('Pet does not have an insurance company set. Please update pet information in Settings.')
          setStep('missing-data')
          return
        }

        // Get user session for authentication
        const { data: { session } } = await supabase.auth.getSession()
        if (!session?.access_token) {
          setError('Please log in to submit claims')
          setStep('error')
          return
        }

        // Call validation API to check what fields are missing for this insurer
        const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8787'
        console.log('[ClaimSubmissionModal] Calling validation API:', `${apiUrl}/api/claims/validate-fields`)
        console.log('[ClaimSubmissionModal] Request body:', {
          claimId: claim.id,
          userId: userId,
          insurer: insurerName
        })

        const response = await fetch(`${apiUrl}/api/claims/validate-fields`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`
          },
          body: JSON.stringify({
            claimId: claim.id,
            userId: userId,
            insurer: insurerName
          })
        })

        console.log('[ClaimSubmissionModal] Response status:', response.status)
        console.log('[ClaimSubmissionModal] Response ok:', response.ok)
        console.log('[ClaimSubmissionModal] Response headers:', {
          'content-type': response.headers.get('content-type'),
          'content-length': response.headers.get('content-length')
        })

        const responseText = await response.text()
        console.log('[ClaimSubmissionModal] Response text (first 500 chars):', responseText.substring(0, 500))

        let validation
        try {
          validation = JSON.parse(responseText)
          console.log('[ClaimSubmissionModal] Validation response:', validation)
        } catch (parseError) {
          console.error('[ClaimSubmissionModal] Failed to parse JSON response:', parseError)
          console.error('[ClaimSubmissionModal] Full response text:', responseText)
          throw new Error(`API returned non-JSON response (status ${response.status}): ${responseText.substring(0, 200)}`)
        }

        if (!validation.ok) {
          console.error('[ClaimSubmissionModal] Validation failed:', validation.error)
          setError(`Error validating claim requirements: ${validation.error}`)
          setStep('error')
          return
        }

        console.log('[Validation] Result:', validation)

        // If there are missing fields, show collection modal
        if (validation.missingFields && validation.missingFields.length > 0) {
          console.log('[ClaimSubmissionModal] Missing fields detected:', validation.missingFields)
          setMissingFieldsData({
            insurerName: pet.insurance_company,
            missingFields: validation.missingFields,
            existingData: validation.existingData || {},
            suggestedValues: validation.suggestedValues || {}
          })
          setStep('collect-missing-fields')
          return
        }

        // No missing fields, proceed to confirm
        console.log('[ClaimSubmissionModal] All fields present, proceeding to confirm')
        setStep('confirm')

      } catch (err) {
        console.error('[Validation] Error:', err)
        setError(`Failed to validate claim: ${err.message}`)
        setStep('error')
      }
    }

    validateData()
  }, [userId, pet, claim])

  // No longer needed - validation is now handled by API
  // Legacy warning has been removed in favor of the MissingFieldsModal flow
  const missingData: string[] = []

  async function handlePreviewPDF() {
    console.log('[Preview] ========== PREVIEW PDF CLICKED ==========')
    console.log('[Preview] User Agent:', navigator.userAgent)
    console.log('[Preview] Window width:', window.innerWidth)

    try {
      setIsLoadingPreview(true)
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8787'

      // Get auth token
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) {
        throw new Error('Not authenticated')
      }

      // 1. Fetch merged PDF (claim form + vet invoice) from backend
      // Use ?merged=true to request both PDFs merged into one
      const mergedParam = claim.pdf_path ? '?merged=true' : ''
      console.log('[Preview] Fetching PDF from:', `${apiUrl}/api/claims/${claim.id}/preview-pdf${mergedParam}`)

      const response = await fetch(`${apiUrl}/api/claims/${claim.id}/preview-pdf${mergedParam}`, {
        headers: {
          'Authorization': `Bearer ${session.access_token}`
        }
      })

      console.log('[Preview] Response status:', response.status)
      console.log('[Preview] Response content-type:', response.headers.get('content-type'))

      if (!response.ok) {
        // Check if response is JSON (error) or PDF
        const contentType = response.headers.get('content-type')
        if (contentType?.includes('application/json')) {
          const result = await response.json()
          console.error('[Preview] Server returned error:', result)

          // Show detailed error to user
          let errorMsg = result.error || 'Failed to generate preview'
          if (result.details) {
            errorMsg += `\n\nDetails: ${result.details}`
          }
          if (result.fallback === 'claim-form-only') {
            errorMsg += '\n\nThe claim form was generated but the vet invoice could not be retrieved from storage.'
          } else if (result.fallback === 'merge-failed') {
            errorMsg += '\n\nBoth files exist but could not be merged into a single PDF.'
          }
          throw new Error(errorMsg)
        } else {
          throw new Error('Failed to generate preview')
        }
      }

      const pdfBlob = await response.blob()
      console.log('[Preview] PDF blob size:', pdfBlob.size)
      console.log('[Preview] PDF blob type:', pdfBlob.type)

      const pdfUrl = URL.createObjectURL(pdfBlob)
      console.log('[Preview] Blob URL created:', pdfUrl)

      // TEMPORARY: Confirm PDF was fetched
      console.log('[Preview] ✅ PDF fetched successfully, size:', pdfBlob.size, 'bytes')

      // 2. Detect mobile device
      const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) || window.innerWidth < 768
      console.log('[Preview] Mobile detected:', isMobile)

      if (isMobile) {
        console.log('[Preview] Using mobile-specific PDF handling')

        // iOS Safari doesn't support programmatic downloads well
        // Try multiple approaches
        const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent)
        console.log('[Preview] Is iOS:', isIOS)

        if (isIOS) {
          // For iOS: Open in same window (will open PDF viewer)
          console.log('[Preview] Opening PDF in same window (iOS)')
          window.location.href = pdfUrl
        } else {
          // For Android: Try download
          console.log('[Preview] Attempting download (Android)')
          const link = document.createElement('a')
          link.href = pdfUrl
          link.download = `claim-${pet.name}-${new Date().toISOString().split('T')[0]}.pdf`
          document.body.appendChild(link)
          link.click()
          document.body.removeChild(link)
          console.log('[Preview] Download triggered')
        }
      } else {
        // On desktop: open in new tab
        console.log('[Preview] Opening PDF in new tab (desktop)')
        const newWindow = window.open(pdfUrl, '_blank', 'noopener,noreferrer')
        console.log('[Preview] New window opened:', !!newWindow)

        if (claim.pdf_path) {
          console.log('[Preview] Opened merged PDF (claim form + vet invoice)')
        } else {
          console.log('[Preview] Opened claim form PDF (no vet invoice attached)')
        }
      }
    } catch (err: any) {
      console.error('[Preview PDF] ERROR:', err)
      console.error('[Preview PDF] Error stack:', err.stack)
      alert(`Could not generate preview: ${err.message}`)
    } finally {
      console.log('[Preview] Cleaning up, setting loading to false')
      setIsLoadingPreview(false)
    }
  }

  async function handleSubmit() {
    setStep('submitting')
    setError(null)

    try {
      // Get user session for authentication
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) {
        setError('Please log in to submit claims')
        setStep('error')
        return
      }

      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8787'
      const response = await fetch(`${apiUrl}/api/claims/submit`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          claimId: claim.id,
          userId: userId
        })
      })

      const result = await response.json()

      if (!response.ok || !result.ok) {
        throw new Error(result.error || 'Failed to submit claim')
      }

      console.log('[ClaimSubmission] Success:', result)
      setMessageId(result.messageId)
      setStep('success')

      // Don't auto-close - let user click "Done" button
      // onSuccess will be called when user clicks Done

    } catch (err: any) {
      console.error('[ClaimSubmission] Error:', err)
      setError(err.message || 'Failed to submit claim')
      setStep('error')
    }
  }

  async function handleMissingFieldsComplete(collectedData: any) {
    try {
      setStep('validating')

      // Get user session for authentication
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) {
        setError('Please log in to save claim information')
        setStep('error')
        return
      }

      // Save collected data to database
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8787'
      const saveResponse = await fetch(`${apiUrl}/api/claims/${claim.id}/save-collected-fields`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({ collectedData })
      })

      const saveResult = await saveResponse.json()

      if (!saveResponse.ok || !saveResult.ok) {
        setError('Failed to save claim information')
        setStep('error')
        return
      }

      console.log('[Save Fields] Success:', saveResult)

      // Data saved successfully, proceed to confirm step
      setStep('confirm')

    } catch (error) {
      console.error('[Save Fields] Error:', error)
      setError('Failed to save claim information')
      setStep('error')
    }
  }

  if (step === 'validating') {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-8 max-w-md w-full text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-blue-600 mx-auto mb-4"></div>
          <h2 className="text-xl font-bold text-gray-800 dark:text-white">Validating Requirements...</h2>
          <p className="text-gray-600 dark:text-gray-300 mt-2">Checking if all required information is complete</p>
        </div>
      </div>
    )
  }

  if (step === 'collect-missing-fields' && missingFieldsData) {
    return (
      <MissingFieldsModal
        open={true}
        onClose={onClose}
        insurerName={missingFieldsData.insurerName}
        petId={pet.id}
        petName={pet.name}
        claimId={claim.id}
        missingFields={missingFieldsData.missingFields}
        existingData={missingFieldsData.existingData}
        suggestedValues={missingFieldsData.suggestedValues}
        onComplete={handleMissingFieldsComplete}
      />
    )
  }

  if (step === 'missing-data') {
    const handleGoToSettings = () => {
      onClose()
      // Trigger settings navigation in parent component
      window.location.hash = '#settings'
    }

    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-8 max-w-md w-full">
          <div className="text-orange-500 text-6xl mb-4 text-center">⚠️</div>
          <h2 className="text-2xl font-bold text-gray-800 dark:text-white mb-4 text-center">Missing Required Information</h2>
          <p className="text-gray-700 dark:text-gray-300 mb-6 text-center">
            Please complete your profile and pet information before submitting claims.
          </p>

          <div className="bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-lg p-4 mb-6">
            <h3 className="font-semibold text-orange-800 dark:text-orange-300 mb-3">Missing:</h3>
            <ul className="text-sm text-orange-700 dark:text-orange-400 space-y-1.5">
              {error?.split('\n').slice(1).map((line, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="text-orange-500 mt-0.5">▪</span>
                  <span>{line.replace('- ', '')}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 mb-6">
            <h3 className="font-semibold text-blue-800 dark:text-blue-300 mb-2">How to complete:</h3>
            <ul className="text-sm text-blue-700 dark:text-blue-400 space-y-1">
              <li>1. Go to Settings (click button below)</li>
              <li>2. Fill in your signature, insurance info, and address</li>
              <li>3. Update your pet's breed and date of birth</li>
              <li>4. Return here and submit your claim</li>
            </ul>
          </div>

          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 px-6 py-3 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 font-semibold"
            >
              Cancel
            </button>
            <button
              onClick={handleGoToSettings}
              className="flex-1 bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 font-semibold"
            >
              Go to Settings
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (step === 'submitting') {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-8 max-w-md w-full text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-blue-600 mx-auto mb-4"></div>
          <h2 className="text-2xl font-bold text-gray-800 dark:text-white mb-2">Submitting Claim...</h2>
          <p className="text-gray-600 dark:text-gray-300 mb-4">
            Generating PDF and sending to {insurer}
          </p>
          <div className="space-y-2 text-sm text-gray-500 dark:text-gray-400">
            <div className="flex items-center justify-center gap-2">
              <div className="h-2 w-2 bg-green-500 rounded-full animate-pulse"></div>
              <span>Creating claim form PDF...</span>
            </div>
            <div className="flex items-center justify-center gap-2">
              <div className="h-2 w-2 bg-blue-500 rounded-full animate-pulse"></div>
              <span>Sending email to insurance company...</span>
            </div>
            <div className="flex items-center justify-center gap-2">
              <div className="h-2 w-2 bg-purple-500 rounded-full animate-pulse"></div>
              <span>Updating claim status...</span>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (step === 'success') {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-8 max-w-md w-full text-center">
          <div className="text-green-600 text-6xl mb-4">✓</div>
          <h2 className="text-2xl font-bold text-gray-800 dark:text-white mb-4">Claim Submitted!</h2>
          <p className="text-gray-700 dark:text-gray-300 mb-6">
            Your claim for <strong>{pet?.name || 'your pet'}</strong> has been automatically submitted to <strong>{insurer}</strong>.
          </p>

          <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4 mb-6 text-left">
            <h3 className="font-semibold text-green-800 dark:text-green-300 mb-2">What happens next:</h3>
            <ul className="text-sm text-green-700 dark:text-green-400 space-y-1">
              <li>✓ Claim form PDF sent to {insurer}</li>
              <li>✓ Copy sent to your email (BCC)</li>
              <li className="ml-4 text-xs">💡 Don't see it? Check your spam or junk folder</li>
              <li>✓ Claim status updated to "Submitted"</li>
              <li>⏳ Insurance company will review (typically 5-10 business days)</li>
            </ul>
          </div>

          {messageId && (
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3 mb-6">
              <p className="text-xs text-blue-700 dark:text-blue-400 font-mono break-all">
                Tracking ID: {messageId.slice(0, 20)}...
              </p>
            </div>
          )}

          <button
            onClick={() => {
              onSuccess(messageId)
              onClose()
            }}
            className="bg-green-600 text-white px-6 py-3 rounded-lg hover:bg-green-700 font-semibold w-full"
          >
            Done
          </button>
        </div>
      </div>
    )
  }

  if (step === 'error') {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-8 max-w-md w-full text-center">
          <div className="text-red-600 text-6xl mb-4">⚠️</div>
          <h2 className="text-2xl font-bold text-gray-800 dark:text-white mb-4">Submission Failed</h2>
          <p className="text-gray-700 dark:text-gray-300 mb-6">
            We couldn't submit your claim automatically.
          </p>

          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 mb-6 text-left">
            <p className="text-sm text-red-700 dark:text-red-400">
              <strong>Error:</strong> {error}
            </p>
          </div>

          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 mb-6 text-left">
            <h3 className="font-semibold text-blue-800 dark:text-blue-300 mb-2">Next steps:</h3>
            <ul className="text-sm text-blue-700 dark:text-blue-400 space-y-1">
              <li>• Try again in a few minutes</li>
              <li>• Or manually mark as submitted after filing yourself</li>
              <li>• Contact support if the problem persists</li>
            </ul>
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => setStep('confirm')}
              className="flex-1 bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 font-semibold"
            >
              Try Again
            </button>
            <button
              onClick={onClose}
              className="flex-1 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 px-6 py-3 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 font-semibold"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    )
  }

  // Confirmation step
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-8 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="text-center mb-6">
          <div className="text-blue-600 text-5xl mb-4">📧</div>
          <h2 className="text-2xl font-bold text-gray-800 dark:text-white mb-2">
            Auto-Submit Claim to {insurer}?
          </h2>
          <p className="text-gray-600 dark:text-gray-300">
            Review the claim details before submitting
          </p>
        </div>

        {/* Claim Summary */}
        <div className="bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-6 mb-6">
          <h3 className="font-semibold text-gray-800 dark:text-white mb-4">Claim Summary</h3>

          <div className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-600 dark:text-gray-400">Pet:</span>
              <span className="font-medium text-gray-900 dark:text-white">{pet?.name || 'Unknown'} ({pet?.species || 'Pet'})</span>
            </div>

            <div className="flex justify-between">
              <span className="text-gray-600 dark:text-gray-400">Clinic:</span>
              <span className="font-medium text-gray-900 dark:text-white">{claim.clinic_name || 'N/A'}</span>
            </div>

            <div className="flex justify-between">
              <span className="text-gray-600 dark:text-gray-400">Service Date:</span>
              <span className="font-medium text-gray-900 dark:text-white">{claim.service_date || 'N/A'}</span>
            </div>

            <div className="flex justify-between">
              <span className="text-gray-600 dark:text-gray-400">Diagnosis:</span>
              <span className="font-medium text-gray-900 dark:text-white text-right max-w-xs line-clamp-2">
                {claim.visit_title || claim.diagnosis || 'N/A'}
              </span>
            </div>

            <div className="pt-3 border-t border-blue-200 dark:border-blue-700 flex justify-between items-center">
              <span className="text-gray-800 dark:text-gray-200 font-semibold">Total Amount:</span>
              <span className="text-2xl font-bold text-blue-600 dark:text-blue-400">{amount}</span>
            </div>
          </div>
        </div>

        {/* Missing Data Warning */}
        {missingData.length > 0 && (
          <div className="bg-orange-50 dark:bg-orange-900/20 border border-orange-300 dark:border-orange-700 rounded-lg p-4 mb-4">
            <div className="flex items-start gap-3">
              <span className="text-2xl">⚠️</span>
              <div>
                <h4 className="font-semibold text-orange-800 dark:text-orange-300 mb-1">Missing Information</h4>
                <p className="text-sm text-orange-700 dark:text-orange-400 mb-2">
                  The following information is missing from your claim:
                </p>
                <ul className="text-sm text-orange-700 dark:text-orange-400 list-disc list-inside">
                  {missingData.map((item, idx) => (
                    <li key={idx}>{item}</li>
                  ))}
                </ul>
                <p className="text-sm text-orange-700 dark:text-orange-400 mt-2">
                  You can still submit, but the insurance company may request additional information.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Preview PDF Button */}
        <div className="mb-6">
          <button
            onClick={handlePreviewPDF}
            disabled={isLoadingPreview}
            className="w-full py-3 px-4 border-2 border-blue-500 text-blue-600 dark:text-blue-400 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/20 flex items-center justify-center gap-2 font-semibold disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isLoadingPreview ? (
              <>
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600"></div>
                Generating Preview...
              </>
            ) : (
              <>
                <span>📄</span>
                Preview Claim Form PDF
              </>
            )}
          </button>
          <p className="text-xs text-gray-500 dark:text-gray-400 text-center mt-2">
            Review before submitting
          </p>
        </div>

        {/* What Will Happen */}
        <div className="bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-xl p-6 mb-6">
          <h3 className="font-semibold text-gray-800 dark:text-white mb-3">What will happen:</h3>
          <ul className="space-y-2 text-sm text-gray-700 dark:text-gray-300">
            <li className="flex items-start gap-2">
              <span className="text-blue-600 dark:text-blue-400 mt-0.5">1.</span>
              <span>Generate professional claim form PDF with all details</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-blue-600 dark:text-blue-400 mt-0.5">2.</span>
              <span>Email claim form to <strong>{insurer}</strong> at their claims processing address</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-blue-600 dark:text-blue-400 mt-0.5">3.</span>
              <span>Send you a copy (BCC) so you have a record</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-blue-600 dark:text-blue-400 mt-0.5">4.</span>
              <span>Update claim status to "Submitted" in your dashboard</span>
            </li>
          </ul>
        </div>

        {/* Test Mode Warning - Only show for demo accounts or non-production insurers */}
        {isTestMode() && (
          <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-300 dark:border-yellow-700 rounded-lg p-4 mb-6">
            <div className="flex items-start gap-3">
              <span className="text-2xl">🧪</span>
              <div>
                <h4 className="font-semibold text-yellow-800 dark:text-yellow-300 mb-1">Test Mode Active</h4>
                <p className="text-sm text-yellow-700 dark:text-yellow-400">
                  This submission will be sent to <strong>larry@uglydogadventures.com</strong> for testing,
                  not to the actual insurance company. Perfect for testing!
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex gap-3">
          <button
            onClick={handleSubmit}
            className="flex-1 bg-blue-600 text-white px-6 py-4 rounded-lg hover:bg-blue-700 font-semibold text-lg shadow-lg hover:shadow-xl transition-all"
          >
            ✓ Submit to {insurer}
          </button>
          <button
            onClick={onClose}
            className="flex-1 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 px-6 py-4 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 font-semibold"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
