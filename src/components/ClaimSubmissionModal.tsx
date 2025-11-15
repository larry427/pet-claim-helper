import { useState } from 'react'

interface ClaimSubmissionModalProps {
  claim: any
  pet: any
  userId: string
  onClose: () => void
  onSuccess: (messageId: string) => void
}

export default function ClaimSubmissionModal({ claim, pet, userId, onClose, onSuccess }: ClaimSubmissionModalProps) {
  const [step, setStep] = useState<'confirm' | 'submitting' | 'success' | 'error'>('confirm')
  const [messageId, setMessageId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const insurer = claim.insurer || 'Nationwide'
  const amount = claim.total_amount ? `$${parseFloat(claim.total_amount).toFixed(2)}` : '$0.00'

  async function handleSubmit() {
    setStep('submitting')
    setError(null)

    try {
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8787'
      const response = await fetch(`${apiUrl}/api/claims/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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

      // Notify parent component
      setTimeout(() => {
        onSuccess(result.messageId)
      }, 2000)

    } catch (err: any) {
      console.error('[ClaimSubmission] Error:', err)
      setError(err.message || 'Failed to submit claim')
      setStep('error')
    }
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
            onClick={() => onClose()}
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

        {/* Test Mode Warning */}
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
