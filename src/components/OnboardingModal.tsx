import React, { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { createPet } from '../lib/petStorage'
import { INSURANCE_OPTIONS, getInsuranceValue } from '../lib/insuranceOptions'

type Props = {
  open: boolean
  onClose: () => void
  userId: string
  userEmail?: string | null
}

export default function OnboardingModal({ open, onClose, userId, userEmail }: Props) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Onboarding state (single step)
  const [newFullName, setNewFullName] = useState('')
  const [newPetName, setNewPetName] = useState('')
  const [newSpecies, setNewSpecies] = useState<'dog' | 'cat' | ''>('')
  const [newInsurance, setNewInsurance] = useState('Not Insured')
  const [newMonthlyPremium, setNewMonthlyPremium] = useState('')
  const [newCoverageMonth, setNewCoverageMonth] = useState('')
  const [newCoverageYear, setNewCoverageYear] = useState('')

  useEffect(() => {
    if (!open) return
    // Reset state when opened
    setSaving(false)
    setError(null)
    setNewFullName('')
    setNewPetName('')
    setNewSpecies('')
    setNewInsurance('Not Insured')
    setNewMonthlyPremium('')
    setNewCoverageMonth('')
    setNewCoverageYear('')
  }, [open])

  // Onboarding validation - only 4 required fields
  const canSubmit = useMemo(() => {
    return newFullName.trim().length > 0 &&
      newPetName.trim().length > 0 &&
      !!newSpecies &&
      newInsurance.length > 0
  }, [newFullName, newPetName, newSpecies, newInsurance])

  // Prevent body scroll and handle escape key when modal is open
  useEffect(() => {
    if (!open) return
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
  }, [open, onClose])

  const handleSubmit = async () => {
    setSaving(true)
    setError(null)
    try {
      // Save profile with name and email
      const profileUpdate: any = {
        id: userId,
        full_name: newFullName.trim(),
        email: userEmail || '',
        onboarding_complete: true
      }

      const { error: profErr } = await supabase
        .from('profiles')
        .upsert(profileUpdate, { onConflict: 'id' })
        .select()
      if (profErr) throw profErr

      // Convert coverage month/year to ISO date (assume 1st of month)
      let coverageStartDateISO = null
      if (newCoverageMonth && newCoverageYear) {
        const monthNum = String(newCoverageMonth).padStart(2, '0')
        coverageStartDateISO = `${newCoverageYear}-${monthNum}-01`
      }

      // Save pet with optional insurance fields
      const insuranceValue = getInsuranceValue(newInsurance)
      const petPayload: any = {
        user_id: userId,
        name: newPetName.trim(),
        species: newSpecies || 'other',
        insurance_company: insuranceValue || null,
        monthly_premium: newMonthlyPremium === '' ? null : parseFloat(newMonthlyPremium),
        coverage_start_date: coverageStartDateISO
      }

      await createPet(petPayload)

      // Close modal and refresh
      onClose()
    } catch (e: any) {
      setError(e?.message || 'Failed to save your info. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="relative mx-4 w-full max-w-md rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-6 shadow-2xl max-h-[calc(100vh-40px)] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        {error && <div className="mb-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</div>}

        <div className="animate-fadeIn">
            <div className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">Welcome to Pet Claim Helper! 🎉</div>
            <p className="text-sm text-slate-600 dark:text-slate-400 mb-6">Quick setup - then we'll handle the insurance headaches for you.</p>

            <div className="space-y-4">
              {/* Required: Full Name */}
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-2">
                  Full Name <span className="text-red-500">*</span>
                </label>
                <input
                  value={newFullName}
                  onChange={(e) => setNewFullName(e.target.value)}
                  placeholder="John Smith"
                  className="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white/90 dark:bg-slate-900 px-3 py-3"
                />
              </div>

              {/* Required: Pet Name */}
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-2">
                  Pet Name <span className="text-red-500">*</span>
                </label>
                <input
                  value={newPetName}
                  onChange={(e) => setNewPetName(e.target.value)}
                  placeholder="Max"
                  className="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white/90 dark:bg-slate-900 px-3 py-3"
                />
              </div>

              {/* Required: Species */}
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-2">
                  Species <span className="text-red-500">*</span>
                </label>
                <select
                  value={newSpecies}
                  onChange={(e) => setNewSpecies(e.target.value as any)}
                  className="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white/90 dark:bg-slate-900 px-3 py-3"
                >
                  <option value="">— Select —</option>
                  <option value="dog">Dog</option>
                  <option value="cat">Cat</option>
                </select>
              </div>

              {/* Required: Insurance Company */}
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-2">
                  Insurance Company <span className="text-red-500">*</span>
                </label>
                <select
                  value={newInsurance}
                  onChange={(e) => setNewInsurance(e.target.value)}
                  className="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white/90 dark:bg-slate-900 px-3 py-3"
                >
                  {INSURANCE_OPTIONS.map(opt => (
                    <option key={opt.display} value={opt.display}>{opt.display}</option>
                  ))}
                </select>
              </div>

              {/* Optional: Monthly Premium & Coverage Start */}
              <div className="pt-4 border-t border-slate-200 dark:border-slate-700">
                <div className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">Optional</div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">Track your complete pet expenses</p>

                <div className="space-y-3">
                  {/* Monthly Premium */}
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-2">
                      Monthly Premium (USD)
                    </label>
                    <input
                      type="number"
                      min={0}
                      value={newMonthlyPremium}
                      onChange={(e) => setNewMonthlyPremium(e.target.value)}
                      placeholder="50"
                      className="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white/90 dark:bg-slate-900 px-3 py-3"
                    />
                  </div>

                  {/* Coverage Start (Month + Year) */}
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-2">
                      Coverage Start
                    </label>
                    <div className="flex gap-2">
                      <select
                        value={newCoverageMonth}
                        onChange={(e) => setNewCoverageMonth(e.target.value)}
                        className="flex-1 rounded-md border border-slate-300 dark:border-slate-700 bg-white/90 dark:bg-slate-900 px-3 py-3"
                      >
                        <option value="">Month</option>
                        <option value="1">January</option>
                        <option value="2">February</option>
                        <option value="3">March</option>
                        <option value="4">April</option>
                        <option value="5">May</option>
                        <option value="6">June</option>
                        <option value="7">July</option>
                        <option value="8">August</option>
                        <option value="9">September</option>
                        <option value="10">October</option>
                        <option value="11">November</option>
                        <option value="12">December</option>
                      </select>
                      <select
                        value={newCoverageYear}
                        onChange={(e) => setNewCoverageYear(e.target.value)}
                        className="flex-1 rounded-md border border-slate-300 dark:border-slate-700 bg-white/90 dark:bg-slate-900 px-3 py-3"
                      >
                        <option value="">Year</option>
                        {Array.from({ length: 10 }, (_, i) => new Date().getFullYear() - i).map(year => (
                          <option key={year} value={year}>{year}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>

                <div className="mt-3 text-center">
                  <button
                    type="button"
                    onClick={() => {
                      setNewMonthlyPremium('')
                      setNewCoverageMonth('')
                      setNewCoverageYear('')
                    }}
                    className="text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                  >
                    Skip for now
                  </button>
                </div>
              </div>
            </div>

            {/* Submit Button */}
            <div className="mt-6 flex flex-col sm:flex-row gap-3 sm:justify-end">
              <button
                type="button"
                className="h-12 rounded-lg border border-slate-300 dark:border-slate-700 px-4 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                onClick={onClose}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!canSubmit || saving}
                onClick={handleSubmit}
                className="h-12 rounded-lg bg-emerald-600 hover:bg-emerald-700 hover:scale-[1.02] hover:shadow-lg text-white px-6 disabled:opacity-60 disabled:hover:scale-100 disabled:hover:shadow-none transition-all duration-200"
              >
                {saving ? 'Saving…' : 'Get Started'}
              </button>
            </div>
          </div>
      </div>
    </div>
  )
}
