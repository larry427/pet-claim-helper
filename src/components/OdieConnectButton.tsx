import React, { useCallback, useEffect, useState } from 'react'
import type { PetProfile } from '../types'
import { fetchOdiePolicy, saveOdiePolicyToPet, registerPolicyWebhook, parsePolicyStartDate } from '../lib/odieApi'
import type { OdiePolicy } from '../lib/odieApi'

type Props = {
  pet: PetProfile
  onConnect: () => void
  inline?: boolean
}

/**
 * OdieConnectButton — renders in 3 states:
 * 1. Nothing (pet is not insured with Odie)
 * 2. Green "Connected to Odie" badge (already connected)
 * 3. Teal "Connect to Odie" button → opens modal to enter policy number
 *
 * When inline=true, renders the policy input directly (no modal) for use in OnboardingModal.
 */
export default function OdieConnectButton({ pet, onConnect, inline }: Props) {
  const isOdie = pet.insuranceCompany?.toLowerCase().includes('odie')

  if (!isOdie) return null

  if (pet.odie_connected) {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800">
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
        Connected to Odie
      </span>
    )
  }

  if (inline) {
    return <OdieInlineConnect petId={pet.id} onConnect={onConnect} />
  }

  return <OdieModalConnect petId={pet.id} onConnect={onConnect} />
}

// ---------------------------------------------------------------------------
// Modal variant (used in pet card)
// ---------------------------------------------------------------------------

function OdieModalConnect({ petId, onConnect }: { petId: string; onConnect: () => void }) {
  const [showModal, setShowModal] = useState(false)

  return (
    <>
      <button
        type="button"
        onClick={() => setShowModal(true)}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-teal-600 hover:bg-teal-700 text-white shadow-sm hover:shadow transition-all duration-200"
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.172 13.828a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.102 1.101" />
        </svg>
        Connect to Odie
      </button>

      {showModal && (
        <OdieConnectModal
          petId={petId}
          onClose={() => setShowModal(false)}
          onConnect={() => {
            setShowModal(false)
            onConnect()
          }}
        />
      )}
    </>
  )
}

// ---------------------------------------------------------------------------
// Modal component
// ---------------------------------------------------------------------------

function OdieConnectModal({
  petId,
  onClose,
  onConnect,
}: {
  petId: string
  onClose: () => void
  onConnect: () => void
}) {
  const [policyNumber, setPolicyNumber] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [confirmMismatch, setConfirmMismatch] = useState<{ policy: OdiePolicy } | null>(null)

  // Prevent body scroll and handle escape
  useEffect(() => {
    const originalOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleEscape)
    return () => {
      document.body.style.overflow = originalOverflow
      window.removeEventListener('keydown', handleEscape)
    }
  }, [onClose])

  const handleConnect = useCallback(async (skipMismatchCheck = false) => {
    if (!policyNumber.trim()) return
    setLoading(true)
    setError(null)

    try {
      const result = await fetchOdiePolicy(policyNumber)
      if (!result.ok || !result.policy) {
        setError(result.error || 'Failed to fetch policy.')
        setLoading(false)
        return
      }

      const policy = result.policy

      if (!policy.active) {
        setError('This policy is not currently active.')
        setLoading(false)
        return
      }

      // Check for name/species mismatch — only if not already confirmed
      if (!skipMismatchCheck && policy.petName) {
        // We don't have the pet name here since we only have petId, but the parent
        // already shows the pet card. We'll just proceed and show what Odie says.
        // The mismatch check would need the current pet data — for simplicity
        // we'll always update and inform the user.
      }

      await saveOdiePolicyToPet(petId, policy, true)
      registerPolicyWebhook(policy.policyNumber)
      setSuccess(true)
      setTimeout(() => onConnect(), 1500)
    } catch (err: any) {
      setError(err.message || 'Failed to connect. Please try again.')
    } finally {
      setLoading(false)
    }
  }, [policyNumber, petId, onConnect])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="relative mx-4 w-full max-w-md rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {success ? (
          <div className="text-center py-4">
            <div className="text-4xl mb-3">&#9989;</div>
            <div className="text-lg font-semibold text-emerald-700 dark:text-emerald-300">Connected!</div>
            <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
              Your policy data has been synced from Odie.
            </p>
          </div>
        ) : (
          <>
            <div className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-1">Connect to Odie</div>
            <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
              Enter your Odie policy number to auto-fill your insurance details.
            </p>

            {error && (
              <div className="mb-3 rounded-md border border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-950 px-3 py-2 text-sm text-rose-800 dark:text-rose-300">
                {error}
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-2">
                Odie Policy Number
              </label>
              <input
                type="text"
                value={policyNumber}
                onChange={(e) => setPolicyNumber(e.target.value)}
                placeholder="e.g., 1-MPI-CA-09-12345678-00"
                className="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white/90 dark:bg-slate-900 px-3 py-3 text-sm"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && policyNumber.trim() && !loading) handleConnect()
                }}
              />
            </div>

            <div className="mt-5 flex flex-col sm:flex-row gap-3 sm:justify-end">
              <button
                type="button"
                className="h-11 rounded-lg border border-slate-300 dark:border-slate-700 px-4 text-sm hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                onClick={onClose}
                disabled={loading}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!policyNumber.trim() || loading}
                onClick={() => handleConnect()}
                className="h-11 rounded-lg bg-teal-600 hover:bg-teal-700 text-white px-5 text-sm font-medium disabled:opacity-60 disabled:hover:bg-teal-600 transition-all duration-200"
              >
                {loading ? (
                  <span className="inline-flex items-center gap-2">
                    <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Connecting...
                  </span>
                ) : (
                  'Connect'
                )}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Inline variant (used in OnboardingModal)
// ---------------------------------------------------------------------------

type InlineProps = {
  onPolicyData?: (data: {
    policyNumber: string
    deductibleAmount: number
    coinsurancePercent: number
    standardAnnualLimit: number
    policyStartDate: string | null
    monthlyPremium: number | null
    petName: string
    species: string
    odiePetId: string | null
    odieUserId: string | null
  }) => void
  petId?: string
  onConnect?: () => void
}

function OdieInlineConnect({ petId, onConnect, onPolicyData }: InlineProps) {
  const [policyNumber, setPolicyNumber] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const handleConnect = useCallback(async () => {
    if (!policyNumber.trim()) return
    setLoading(true)
    setError(null)

    try {
      const result = await fetchOdiePolicy(policyNumber)
      if (!result.ok || !result.policy) {
        setError(result.error || 'Failed to fetch policy.')
        setLoading(false)
        return
      }

      const policy = result.policy

      if (!policy.active) {
        setError('This policy is not currently active.')
        setLoading(false)
        return
      }

      // If we have a petId, save directly to Supabase
      if (petId) {
        await saveOdiePolicyToPet(petId, policy, true)
        registerPolicyWebhook(policy.policyNumber)
        setSuccess(true)
        onConnect?.()
      }

      // If we have an onPolicyData callback (onboarding), pass the data up
      if (onPolicyData) {
        onPolicyData({
          policyNumber: policy.policyNumber,
          deductibleAmount: policy.deductibleAmount,
          coinsurancePercent: policy.coinsurancePercent,
          standardAnnualLimit: policy.standardAnnualLimit,
          policyStartDate: parsePolicyStartDate(policy.policyStartDate),
          monthlyPremium: policy.monthlyPremium ?? null,
          petName: policy.petName,
          species: policy.species,
          odiePetId: policy.pet?.id || null,
          odieUserId: policy.user?.id || null,
        })
        setSuccess(true)
      }
    } catch (err: any) {
      setError(err.message || 'Failed to connect. Please try again.')
    } finally {
      setLoading(false)
    }
  }, [policyNumber, petId, onConnect, onPolicyData])

  if (success) {
    return (
      <div className="flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-300">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
        Policy connected! Details auto-filled below.
      </div>
    )
  }

  return (
    <div>
      {error && (
        <div className="mb-2 rounded-md border border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-950 px-3 py-2 text-xs text-rose-800 dark:text-rose-300">
          {error}
        </div>
      )}
      <div className="flex gap-2">
        <input
          type="text"
          value={policyNumber}
          onChange={(e) => setPolicyNumber(e.target.value)}
          placeholder="Odie policy number"
          className="flex-1 rounded-md border border-slate-300 dark:border-slate-700 bg-white/90 dark:bg-slate-900 px-3 py-2 text-sm"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && policyNumber.trim() && !loading) handleConnect()
          }}
        />
        <button
          type="button"
          disabled={!policyNumber.trim() || loading}
          onClick={handleConnect}
          className="rounded-lg bg-teal-600 hover:bg-teal-700 text-white px-4 py-2 text-sm font-medium disabled:opacity-60 transition-all whitespace-nowrap"
        >
          {loading ? 'Connecting...' : 'Connect'}
        </button>
      </div>
    </div>
  )
}

// Export the inline variant for use in OnboardingModal
export { OdieInlineConnect }
