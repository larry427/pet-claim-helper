import React, { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { createPet } from '../lib/petStorage'

type Props = {
  open: boolean
  onClose: () => void
  userId: string
}

export default function OnboardingModal({ open, onClose, userId }: Props) {
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Step 1 - Profile
  const [fullName, setFullName] = useState('')
  const [address, setAddress] = useState('')

  // Step 2 - Pet
  const [petName, setPetName] = useState('')
  const [species, setSpecies] = useState<'dog' | 'cat' | 'other' | ''>('')
  const [breed, setBreed] = useState('')
  const [weightLbs, setWeightLbs] = useState<string>('')
  const [color, setColor] = useState('')

  // Step 3 - Insurance
  const [insuranceCompany, setInsuranceCompany] = useState('')
  const [policyNumber, setPolicyNumber] = useState('')
  const [monthlyPremium, setMonthlyPremium] = useState<string>('')
  const [deductiblePerClaim, setDeductiblePerClaim] = useState<string>('')
  const [coverageStartDate, setCoverageStartDate] = useState('')
  const [insurancePaysPct, setInsurancePaysPct] = useState<string>('80')
  const [annualCoverageLimit, setAnnualCoverageLimit] = useState<string>('')

  useEffect(() => {
    if (!open) return
    // Reset state when opened
    setStep(1)
    setSaving(false)
    setError(null)
    setFullName('')
    setAddress('')
    setPetName('')
    setSpecies('')
    setBreed('')
    setWeightLbs('')
    setColor('')
    setInsuranceCompany('')
    setPolicyNumber('')
    setMonthlyPremium('')
    setDeductiblePerClaim('')
    setCoverageStartDate('')
    setInsurancePaysPct('80')
    setAnnualCoverageLimit('')
  }, [open])

  const canNextFrom1 = useMemo(() => fullName.trim().length > 0, [fullName])
  const canNextFrom2 = useMemo(() => petName.trim().length > 0 && !!species, [petName, species])
  const canFinish = useMemo(() => {
    return Boolean(
      insuranceCompany &&
        policyNumber.trim() &&
        Number.isFinite(Number(monthlyPremium)) &&
        Number(monthlyPremium) > 0 &&
        Number.isFinite(Number(deductiblePerClaim)) &&
        Number(deductiblePerClaim) >= 0 &&
        coverageStartDate
    )
  }, [insuranceCompany, policyNumber, monthlyPremium, deductiblePerClaim, coverageStartDate])

  useEffect(() => {
    if (open && step === 4) {
      const t = setTimeout(() => onClose(), 1000)
      return () => clearTimeout(t)
    }
  }, [open, step, onClose])

  const handleFinish = async () => {
    setSaving(true)
    setError(null)
    try {
      if (!coverageStartDate) {
        throw new Error('Coverage Start Date is required.')
      }
      // Normalize to YYYY-MM-DD for API
      const coverageStartDateISO = (() => {
        const d = new Date(coverageStartDate)
        if (Number.isNaN(d.getTime())) throw new Error('Please select a valid Coverage Start Date.')
        return d.toISOString().slice(0, 10)
      })()
      // Save profile (Step 1)
      const { error: profErr } = await supabase
        .from('profiles')
        .update({ full_name: fullName.trim(), address: address.trim() || null })
        .eq('id', userId)
      if (profErr) throw profErr

      // Save pet (Step 2 + Step 3)
      const petPayload: any = {
        user_id: userId,
        name: petName.trim(),
        species: species || 'other',
        color: color.trim() || null,
        insurance_company: insuranceCompany || null,
        policy_number: policyNumber.trim() || null,
        // Optional/extended fields
        breed: breed.trim() || null,
        weight_lbs: weightLbs === '' ? null : Number(weightLbs),
        monthly_premium: monthlyPremium === '' ? null : parseFloat(monthlyPremium),
        deductible_per_claim: deductiblePerClaim === '' ? null : parseFloat(deductiblePerClaim),
        coverage_start_date: coverageStartDateISO,
        insurance_pays_percentage: insurancePaysPct === '' ? null : Math.max(50, Math.min(100, Number(insurancePaysPct))),
        annual_coverage_limit: annualCoverageLimit === '' ? null : Math.max(0, Math.min(100000, Number(annualCoverageLimit)))
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

      setStep(4)
    } catch (e: any) {
      setError(e?.message || 'Failed to save your info. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  if (!open) return null

  const stepLabel = step === 1 ? 'Step 1 of 3' : step === 2 ? 'Step 2 of 3' : step === 3 ? 'Step 3 of 3' : ''

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="relative mx-4 w-full max-w-md rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-6 shadow-2xl max-h-[calc(100vh-40px)] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        {step !== 4 && (
          <div className="text-xs text-slate-500 dark:text-slate-400 mb-2">{stepLabel}</div>
        )}
        {error && <div className="mb-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</div>}

        {step === 1 && (
          <div>
            <div className="text-lg font-semibold text-gray-900 dark:text-gray-100">Welcome to Pet Claim Helper!</div>
            <div className="mt-4 space-y-3">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">Full Name</label>
                <input value={fullName} onChange={(e) => setFullName(e.target.value)} className="mt-2 w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white/90 dark:bg-slate-900 px-3 py-3" placeholder="Jane Doe" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">Address <span className="text-xs text-slate-500">(optional)</span></label>
                <input value={address} onChange={(e) => setAddress(e.target.value)} className="mt-2 w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white/90 dark:bg-slate-900 px-3 py-3" placeholder="123 Maple St, City, ST" />
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
            <div className="text-lg font-semibold text-gray-900 dark:text-gray-100">Let's add your first pet</div>
            <div className="mt-4 space-y-3">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">Pet Name</label>
                <input value={petName} onChange={(e) => setPetName(e.target.value)} className="mt-2 w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white/90 dark:bg-slate-900 px-3 py-3" placeholder="Bo" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">Species</label>
                <select value={species} onChange={(e) => setSpecies(e.target.value as any)} className="mt-2 w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white/90 dark:bg-slate-900 px-3 py-3">
                  <option value="">— Select —</option>
                  <option value="dog">Dog</option>
                  <option value="cat">Cat</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">Breed <span className="text-xs text-slate-500">(optional)</span></label>
                <input value={breed} onChange={(e) => setBreed(e.target.value)} className="mt-2 w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white/90 dark:bg-slate-900 px-3 py-3" placeholder="Golden Retriever" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">Weight (lbs) <span className="text-xs text-slate-500">(optional)</span></label>
                <input type="number" min={0} value={weightLbs} onChange={(e) => setWeightLbs(e.target.value)} className="mt-2 w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white/90 dark:bg-slate-900 px-3 py-3" placeholder="65" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">Color/Markings <span className="text-xs text-slate-500">(optional)</span></label>
                <input value={color} onChange={(e) => setColor(e.target.value)} className="mt-2 w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white/90 dark:bg-slate-900 px-3 py-3" placeholder="Brown with white chest" />
              </div>
            </div>
            <div className="mt-6 flex flex-col sm:flex-row gap-3 sm:justify-end">
              <button type="button" className="h-12 rounded-lg border border-slate-300 dark:border-slate-700 px-4" onClick={onClose}>Cancel</button>
              <button type="button" disabled={!canNextFrom2} className="h-12 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white px-4 disabled:opacity-60" onClick={() => setStep(3)}>Next</button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div>
            <div className="text-lg font-semibold text-gray-900 dark:text-gray-100">Insurance Details</div>
            <div className="mt-4 space-y-3">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">Insurance Company</label>
                <select value={insuranceCompany} onChange={(e) => setInsuranceCompany(e.target.value)} className="mt-2 w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white/90 dark:bg-slate-900 px-3 py-3">
                  <option value="">— Select —</option>
                  <option value="Nationwide">Nationwide</option>
                  <option value="Trupanion">Trupanion</option>
                  <option value="Fetch">Fetch</option>
                  <option value="Healthy Paws">Healthy Paws</option>
                  <option value="Custom">Custom</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">Policy Number</label>
                <input value={policyNumber} onChange={(e) => setPolicyNumber(e.target.value)} className="mt-2 w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white/90 dark:bg-slate-900 px-3 py-3" placeholder="ABC-12345" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200">Monthly Premium (USD)</label>
                <input type="number" min={0} value={monthlyPremium} onChange={(e) => setMonthlyPremium(e.target.value)} className="mt-2 w-full rounded-md border border-emerald-300 dark:border-emerald-700 bg-white/90 dark:bg-slate-900 px-3 py-3" placeholder="45" />
                <div className="text-xs text-slate-500 mt-1">We need this to calculate your true insurance ROI.</div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200">Deductible per Claim (USD)</label>
                <input type="number" min={0} value={deductiblePerClaim} onChange={(e) => setDeductiblePerClaim(e.target.value)} className="mt-2 w-full rounded-md border border-emerald-300 dark:border-emerald-700 bg-white/90 dark:bg-slate-900 px-3 py-3" placeholder="250" />
                <div className="text-xs text-slate-500 mt-1">This affects your actual out-of-pocket costs.</div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200">What percentage does YOUR INSURANCE PAY?</label>
                <input
                  type="number"
                  min={50}
                  max={100}
                  value={insurancePaysPct}
                  onChange={(e) => setInsurancePaysPct(e.target.value)}
                  className="mt-2 w-full rounded-md border border-emerald-300 dark:border-emerald-700 bg-white/90 dark:bg-slate-900 px-3 py-3"
                  placeholder="80"
                />
                <div className="text-xs text-slate-500 mt-1">After you meet your deductible, your insurance covers this percentage. Common values: 80%, 90%</div>
                <div className="text-xs text-slate-600 dark:text-slate-300 mt-1">(You pay: {(() => {
                  const n = Number(insurancePaysPct)
                  if (!Number.isFinite(n)) return '—'
                  const you = Math.max(0, Math.min(100, 100 - n))
                  return `${you}%`
                })()})</div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200">What is your annual coverage limit (optional)?</label>
                <input
                  type="number"
                  min={0}
                  max={100000}
                  value={annualCoverageLimit}
                  onChange={(e) => setAnnualCoverageLimit(e.target.value)}
                  className="mt-2 w-full rounded-md border border-emerald-300 dark:border-emerald-700 bg-white/90 dark:bg-slate-900 px-3 py-3"
                  placeholder="e.g., 5000"
                />
                <div className="text-xs text-slate-500 mt-1">Maximum amount insurance will cover per year</div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">Coverage Start Date</label>
                <input
                  type="date"
                  required
                  value={coverageStartDate}
                  onChange={(e) => setCoverageStartDate(e.target.value)}
                  onClick={(e) => (e.currentTarget as any).showPicker?.()}
                  className="mt-2 w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white/90 dark:bg-slate-900 px-3 py-3"
                />
              </div>
            </div>
            <div className="mt-6 flex flex-col sm:flex-row gap-3 sm:justify-end">
              <button type="button" className="h-12 rounded-lg border border-slate-300 dark:border-slate-700 px-4" onClick={onClose}>Cancel</button>
              <button type="button" disabled={!canFinish || saving} className="h-12 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white px-4 disabled:opacity-60" onClick={handleFinish}>
                {saving ? 'Saving…' : 'Finish'}
              </button>
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="text-center">
            <div className="text-2xl">✅</div>
            <div className="mt-2 text-lg font-semibold text-gray-900 dark:text-gray-100">All set! Your first pet is added.</div>
          </div>
        )}
      </div>
    </div>
  )
}


