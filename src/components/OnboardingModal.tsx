import React, { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { createPet } from '../lib/petStorage'

type Props = {
  open: boolean
  onClose: () => void
  userId: string
}

export default function OnboardingModal({ open, onClose, userId }: Props) {
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Step 1 - Profile
  const [fullName, setFullName] = useState('')
  const [phone, setPhone] = useState('')
  const [address, setAddress] = useState('')

  // Step 2 - Pet + Insurance (all in one step)
  const [petName, setPetName] = useState('')
  const [species, setSpecies] = useState<'dog' | 'cat' | 'other' | ''>('')
  const [insuranceCompany, setInsuranceCompany] = useState('')
  const [healthyPawsPetId, setHealthyPawsPetId] = useState('')
  const [policyNumber, setPolicyNumber] = useState('')
  const [monthlyPremium, setMonthlyPremium] = useState<string>('')
  const [deductiblePerClaim, setDeductiblePerClaim] = useState<string>('')
  const [coverageStartDate, setCoverageStartDate] = useState('')
  const [insurancePaysPct, setInsurancePaysPct] = useState<string>('')

  useEffect(() => {
    if (!open) return
    // Reset state when opened
    setStep(1)
    setSaving(false)
    setError(null)
    setFullName('')
    setPhone('')
    setAddress('')
    setPetName('')
    setSpecies('')
    setInsuranceCompany('')
    setHealthyPawsPetId('')
    setPolicyNumber('')
    setMonthlyPremium('')
    setDeductiblePerClaim('')
    setCoverageStartDate('')
    setInsurancePaysPct('')
  }, [open])

  const canNextFrom1 = useMemo(() => fullName.trim().length > 0, [fullName])
  const canNextFrom2 = useMemo(() => petName.trim().length > 0 && !!species, [petName, species])

  // Prevent body scroll and handle escape key when modal is open
  useEffect(() => {
    if (!open) return
    // Prevent body scroll
    const originalOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    // Handle escape key (only allow closing before step 3 - success)
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && step !== 3) onClose()
    }
    window.addEventListener('keydown', handleEscape)
    return () => {
      document.body.style.overflow = originalOverflow
      window.removeEventListener('keydown', handleEscape)
    }
  }, [open, step, onClose])

  const handleFinish = async () => {
    setSaving(true)
    setError(null)
    try {
      // Normalize coverage start date if provided
      let coverageStartDateISO = null
      if (coverageStartDate) {
        const d = new Date(coverageStartDate)
        if (Number.isNaN(d.getTime())) throw new Error('Please select a valid Coverage Start Date.')
        coverageStartDateISO = d.toISOString().slice(0, 10)
      }

      // Prepare profile update data with proper null handling
      const profileUpdate: any = {
        full_name: fullName.trim()
      }

      // Only add optional fields if they have values
      if (phone.trim()) {
        profileUpdate.phone = phone.trim()
      }
      if (address.trim()) {
        profileUpdate.address = address.trim()
      }

      // Save profile (Step 1)
      const { error: profErr } = await supabase
        .from('profiles')
        .update(profileUpdate)
        .eq('id', userId)
      if (profErr) throw profErr

      // Save pet (Step 2 - with optional insurance)
      const petPayload: any = {
        user_id: userId,
        name: petName.trim(),
        species: species || 'other',
        insurance_company: insuranceCompany || null,
        healthy_paws_pet_id: healthyPawsPetId.trim() || null,
        policy_number: policyNumber.trim() || null,
        monthly_premium: monthlyPremium === '' ? null : parseFloat(monthlyPremium),
        deductible_per_claim: deductiblePerClaim === '' ? null : parseFloat(deductiblePerClaim),
        coverage_start_date: coverageStartDateISO,
        insurance_pays_percentage: insurancePaysPct === '' ? null : Math.max(50, Math.min(100, Number(insurancePaysPct))),
      }
      // Debug payload before sending
      // eslint-disable-next-line no-console
      console.log('[OnboardingModal] petPayload about to send:', {
        monthlyPremium,
        deductiblePerClaim,
        coverageStartDate,
        fullPayload: petPayload,
      })
      const data = await createPet(petPayload)

      setStep(3) // Success step
    } catch (e: any) {
      setError(e?.message || 'Failed to save your info. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  if (!open) return null

  const stepLabel = step === 1 ? 'Step 1 of 2' : step === 2 ? 'Step 2 of 2' : ''

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="relative mx-4 w-full max-w-md rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-6 shadow-2xl max-h-[calc(100vh-40px)] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        {step !== 3 && (
          <div className="text-xs text-slate-500 dark:text-slate-400 mb-2">{stepLabel}</div>
        )}
        {error && <div className="mb-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</div>}

        {step === 1 && (
          <div>
            <div className="text-lg font-semibold text-gray-900 dark:text-gray-100">Welcome to Pet Claim Helper!</div>
            <div className="mt-4 space-y-3">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">Full Name <span className="text-red-500">*</span></label>
                <input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="John Smith" className="mt-2 w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white/90 dark:bg-slate-900 px-3 py-3" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">Phone Number <span className="text-xs text-slate-500">(optional)</span></label>
                <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(555) 123-4567" className="mt-2 w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white/90 dark:bg-slate-900 px-3 py-3" />
                <p className="mt-1 text-xs text-slate-500">Required for some insurance forms</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">Mailing Address <span className="text-xs text-slate-500">(optional)</span></label>
                <textarea value={address} onChange={(e) => setAddress(e.target.value)} placeholder="123 Main St, City, State 12345" rows={2} className="mt-2 w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white/90 dark:bg-slate-900 px-3 py-3" />
                <p className="mt-1 text-xs text-slate-500">Required for Nationwide and Healthy Paws claim forms</p>
              </div>
            </div>
            <div className="mt-6 flex flex-col sm:flex-row gap-3 sm:justify-end">
              <button type="button" className="h-12 rounded-lg border border-slate-300 dark:border-slate-700 px-4" onClick={onClose}>Cancel</button>
              <button type="button" disabled={!canNextFrom1} className="h-12 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white px-4 disabled:opacity-60" onClick={() => setStep(2)}>Next</button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div>
            <div className="text-lg font-semibold text-gray-900 dark:text-gray-100">Add Your First Pet</div>
            <div className="mt-4 space-y-3">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">Pet Name <span className="text-red-500">*</span></label>
                <input value={petName} onChange={(e) => setPetName(e.target.value)} placeholder="Max" className="mt-2 w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white/90 dark:bg-slate-900 px-3 py-3" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">Species <span className="text-red-500">*</span></label>
                <select value={species} onChange={(e) => setSpecies(e.target.value as any)} className="mt-2 w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white/90 dark:bg-slate-900 px-3 py-3">
                  <option value="">— Select —</option>
                  <option value="dog">Dog</option>
                  <option value="cat">Cat</option>
                  <option value="other">Other</option>
                </select>
              </div>

              {/* Insurance Section - OPTIONAL */}
              <div className="mt-5 pt-4 border-t border-slate-200 dark:border-slate-700">
                <div className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">Insurance Information (Optional)</div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">Skip this section if your pet doesn't have insurance</p>

                <div className="space-y-3">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">Insurance Company</label>
                    <select value={insuranceCompany} onChange={(e) => setInsuranceCompany(e.target.value)} className="mt-2 w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white/90 dark:bg-slate-900 px-3 py-3">
                      <option value="">— Select —</option>
                      <option value="Nationwide">Nationwide</option>
                      <option value="Trupanion">Trupanion</option>
                      <option value="Fetch">Fetch</option>
                      <option value="Healthy Paws">Healthy Paws</option>
                      <option value="Pets Best">Pets Best</option>
                      <option value="ASPCA">ASPCA</option>
                      <option value="Embrace">Embrace</option>
                      <option value="Figo">Figo</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>

                  {insuranceCompany === 'Healthy Paws' && (
                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">Healthy Paws Pet ID</label>
                      <input value={healthyPawsPetId} onChange={(e) => setHealthyPawsPetId(e.target.value)} placeholder="e.g., 1400806-1" className="mt-2 w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white/90 dark:bg-slate-900 px-3 py-3" />
                      <p className="mt-1 text-xs text-slate-500">Find this on your Healthy Paws policy card or portal</p>
                    </div>
                  )}

                  {insuranceCompany && (
                    <>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">Policy Number</label>
                        <input value={policyNumber} onChange={(e) => setPolicyNumber(e.target.value)} placeholder="e.g., NW12345 or TP123456" className="mt-2 w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white/90 dark:bg-slate-900 px-3 py-3" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">Monthly Premium (USD)</label>
                        <input type="number" min={0} value={monthlyPremium} onChange={(e) => setMonthlyPremium(e.target.value)} placeholder="50" className="mt-2 w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white/90 dark:bg-slate-900 px-3 py-3" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">Deductible (Annual) (USD)</label>
                        <input type="number" min={0} value={deductiblePerClaim} onChange={(e) => setDeductiblePerClaim(e.target.value)} placeholder="250" className="mt-2 w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white/90 dark:bg-slate-900 px-3 py-3" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">Insurance Pays (%)</label>
                        <input
                          type="number"
                          min={50}
                          max={100}
                          value={insurancePaysPct}
                          onChange={(e) => setInsurancePaysPct(e.target.value)}
                          placeholder="80"
                          className="mt-2 w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white/90 dark:bg-slate-900 px-3 py-3"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">Coverage Start Date</label>
                        <input
                          type="date"
                          value={coverageStartDate}
                          onChange={(e) => setCoverageStartDate(e.target.value)}
                          onClick={(e) => (e.currentTarget as any).showPicker?.()}
                          className="mt-2 w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white/90 dark:bg-slate-900 px-3 py-3"
                        />
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
            <div className="mt-6 flex flex-col sm:flex-row gap-3 sm:justify-end">
              <button type="button" className="h-12 rounded-lg border border-slate-300 dark:border-slate-700 px-4" onClick={onClose}>Cancel</button>
              <button type="button" disabled={!canNextFrom2 || saving} className="h-12 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white px-4 disabled:opacity-60" onClick={handleFinish}>
                {saving ? 'Saving…' : 'Finish Setup'}
              </button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="text-center py-4">
            <div className="text-5xl mb-4">✅</div>
            <div className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-6">You're all set!</div>

            <div className="text-left bg-slate-50 dark:bg-slate-800/50 rounded-lg p-5 mb-6">
              <div className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">Here's how Pet Claim Helper works:</div>
              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <div className="text-xl">1.</div>
                  <div className="text-sm text-slate-600 dark:text-slate-400">Upload your vet bill</div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="text-xl">2.</div>
                  <div className="text-sm text-slate-600 dark:text-slate-400">We fill out the official claim form</div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="text-xl">3.</div>
                  <div className="text-sm text-slate-600 dark:text-slate-400 font-semibold">YOU review and approve</div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="text-xl">4.</div>
                  <div className="text-sm text-slate-600 dark:text-slate-400">We submit to your insurance</div>
                </div>
              </div>
            </div>

            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 mb-6">
              <div className="text-sm text-blue-900 dark:text-blue-200">
                <div className="font-semibold mb-1">Time savings:</div>
                <div className="text-xs">Traditional way: 20-30 minutes of paperwork per claim</div>
                <div className="text-xs font-semibold">With Pet Claim Helper: Less than 2 minutes</div>
              </div>
            </div>

            <button
              type="button"
              className="w-full h-12 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-medium"
              onClick={() => {
                // Set flag to show photo upload tooltip on first dashboard visit
                localStorage.setItem('justCompletedOnboarding', 'true')
                onClose()
              }}
            >
              Get Started
            </button>
          </div>
        )}
      </div>
    </div>
  )
}


