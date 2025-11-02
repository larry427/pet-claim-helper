import React, { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'

type ClaimRow = {
  id: string
  pet_id: string | null
  total_amount: number | null
  reimbursed_amount: number | null
  filing_status: string | null
  expense_category?: string | null
  service_date?: string | null
  deductible_applied?: number | null
  user_coinsurance_payment?: number | null
  insurance_reimbursement?: number | null
}

type PetRow = {
  id: string
  name: string
  species: string
  monthly_premium?: number | null
  deductible_per_claim?: number | null
  coverage_start_date?: string | null
  insurance_pays_percentage?: number | null
  annual_coverage_limit?: number | null
}

export default function FinancialSummary({ userId }: { userId: string | null }) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [claims, setClaims] = useState<ClaimRow[]>([])
  const [pets, setPets] = useState<PetRow[]>([])

  useEffect(() => {
    if (!userId) return
    setLoading(true)
    setError(null)
    Promise.all([
      supabase
        .from('claims')
        .select('id, pet_id, total_amount, reimbursed_amount, filing_status, expense_category, service_date, deductible_applied, user_coinsurance_payment, insurance_reimbursement')
        .eq('user_id', userId),
      supabase
        .from('pets')
        .select('id, name, species, monthly_premium, deductible_per_claim, coverage_start_date, insurance_pays_percentage, annual_coverage_limit')
        .eq('user_id', userId)
    ])
      .then(([cl, pe]) => {
        if (cl.error) throw cl.error
        if (pe.error) throw pe.error
        // eslint-disable-next-line no-console
        console.log('[FinancialSummary] claims fetched:', cl.data)
        // eslint-disable-next-line no-console
        console.log('[FinancialSummary] pets fetched:', pe.data)
        setClaims((cl.data || []) as any)
        setPets((pe.data || []) as any)
      })
      .catch((e: any) => setError(e?.message || 'Failed to load financial data'))
      .finally(() => setLoading(false))
  }, [userId])

  const petById = useMemo(() => {
    const m: Record<string, PetRow> = {}
    for (const p of pets) m[p.id] = p
    return m
  }, [pets])

  const monthsYTD = (startIso: string | null | undefined): number => {
    if (!startIso) return 0
    const start = new Date(startIso)
    if (isNaN(start.getTime())) return 0
    const now = new Date()
    const y = now.getFullYear()
    const sYear = start.getFullYear()
    const sMonth = start.getMonth() // 0-11
    const sDay = start.getDate()
    // Determine starting month index for YTD counting
    // If coverage started in a previous year, start counting from January (0)
    // If coverage started this year, start counting from the month AFTER the start month (exclude partial start month)
    const startIndex = (sYear < y) ? 0 : (sMonth + 1)
    // Determine ending month index (inclusive). If the current day is before the billing day (sDay), exclude current month
    let endIndex = now.getMonth()
    if (now.getDate() < sDay) endIndex -= 1
    let months = endIndex - startIndex + 1
    if (months < 0) months = 0
    // Debug
    // eslint-disable-next-line no-console
    console.log('[FinancialSummary] monthsYTD', { startIso, now: now.toISOString().slice(0,10), startIndex, endIndex, months })
    return months
  }

  const getCoverageYearBounds = (startIso: string | null | undefined): { start: Date | null; end: Date | null } => {
    if (!startIso) return { start: null, end: null }
    const startDate = new Date(startIso)
    if (isNaN(startDate.getTime())) return { start: null, end: null }
    const now = new Date()
    const anniversaryThisYear = new Date(now.getFullYear(), startDate.getMonth(), startDate.getDate())
    const coverageYearStart = (now >= anniversaryThisYear) ? anniversaryThisYear : new Date(now.getFullYear() - 1, startDate.getMonth(), startDate.getDate())
    const coverageYearEnd = new Date(coverageYearStart.getFullYear() + 1, coverageYearStart.getMonth(), coverageYearStart.getDate())
    return { start: coverageYearStart, end: coverageYearEnd }
  }

  const isFiledLike = (status: string | null | undefined): boolean => {
    const s = String(status || '').toLowerCase()
    return s === 'filed' || s === 'submitted' || s === 'approved' || s === 'paid'
  }

  const overall = useMemo(() => {
    // Initialize per-pet accumulators
    const perPetAcc: Record<string, {
      claimed: number
      reimbursed: number
      premiums: number
      deductibles: number
      coinsurancePaid: number
      remainingLimit: number | null
      deductibleRemaining: number
      yearStart: Date | null
      yearEnd: Date | null
    }> = {}
    for (const p of pets) {
      const monthly = Number(p.monthly_premium) || 0
      const premiums = monthly * monthsYTD(p.coverage_start_date || null)
      const limit = Number(p.annual_coverage_limit)
      const deductibleAnnual = Math.max(0, Number(p.deductible_per_claim) || 0)
      const { start, end } = getCoverageYearBounds(p.coverage_start_date || null)
      perPetAcc[p.id] = {
        claimed: 0,
        reimbursed: 0,
        premiums,
        deductibles: 0,
        coinsurancePaid: 0,
        remainingLimit: Number.isFinite(limit) && limit > 0 ? limit : null,
        deductibleRemaining: deductibleAnnual,
        yearStart: start,
        yearEnd: end,
      }
    }

    // Sort claims chronologically by service date for proper deductible application
    const sortedClaims = [...claims].sort((a, b) => {
      const da = a.service_date ? new Date(a.service_date).getTime() : 0
      const db = b.service_date ? new Date(b.service_date).getTime() : 0
      return da - db
    })

    // Process insured claims only, applying annual deductible, co-insurance and annual cap
    for (const c of sortedClaims) {
      const category = String(c.expense_category || '').toLowerCase()
      if (category !== 'insured') continue
      const pid = c.pet_id || ''
      const p = petById[pid]
      if (!p || !perPetAcc[pid]) continue
      const acc = perPetAcc[pid]
      const bill = Number(c.total_amount) || 0
      if (bill <= 0) continue
      const svcDate = c.service_date ? new Date(c.service_date) : null
      if (!svcDate || isNaN(svcDate.getTime())) continue
      if (acc.yearStart && acc.yearEnd && !(svcDate >= acc.yearStart && svcDate < acc.yearEnd)) {
        continue
      }

      const deductibleApplied = Math.min(bill, Math.max(0, acc.deductibleRemaining))
      const remainingAfterDeductible = Math.max(0, bill - deductibleApplied)
      const insurancePct = Math.max(0, Math.min(100, Number(p.insurance_pays_percentage) || 0)) / 100
      const potentialReimb = remainingAfterDeductible * insurancePct
      const allowedReimb = acc.remainingLimit == null ? potentialReimb : Math.min(potentialReimb, acc.remainingLimit)
      const userCoins = remainingAfterDeductible - allowedReimb

      acc.claimed += bill
      acc.deductibles += deductibleApplied
      acc.coinsurancePaid += userCoins
      acc.reimbursed += allowedReimb
      acc.deductibleRemaining = Math.max(0, acc.deductibleRemaining - deductibleApplied)
      if (acc.remainingLimit != null) acc.remainingLimit = Math.max(0, acc.remainingLimit - allowedReimb)
    }

    const totalClaimed = Object.values(perPetAcc).reduce((s, v) => s + v.claimed, 0)
    const totalReimbursed = Object.values(perPetAcc).reduce((s, v) => s + v.reimbursed, 0)
    const premiumsYTD = Object.values(perPetAcc).reduce((s, v) => s + v.premiums, 0)
    const deductiblesPaid = Object.values(perPetAcc).reduce((s, v) => s + v.deductibles, 0)
    const coinsurancePaid = Object.values(perPetAcc).reduce((s, v) => s + v.coinsurancePaid, 0)
    const netCost = premiumsYTD + deductiblesPaid + coinsurancePaid - totalReimbursed

    // eslint-disable-next-line no-console
    console.log('[FinancialSummary] overall calc (insured only, annual deductible & caps)', {
      totalClaimed,
      totalReimbursed,
      premiumsYTD,
      deductiblesPaid,
      coinsurancePaid,
      netCost,
    })
    return { totalClaimed, totalReimbursed, premiumsYTD, deductiblesPaid, netCost }
  }, [claims, pets, petById])

  const perPet = useMemo(() => {
    const byPet: Record<string, { claimed: number; reimbursed: number; premiums: number; deductibles: number; coinsurance: number }> = {}
    // Prime with premiums per pet
    for (const p of pets) {
      byPet[p.id] = {
        claimed: 0,
        reimbursed: 0,
        premiums: (Number(p.monthly_premium) || 0) * monthsYTD(p.coverage_start_date || null),
        deductibles: 0,
        coinsurance: 0,
      }
    }

    // Track coverage-year bounds, deductible and remaining annual coverage limit per pet
    const remainingLimitByPet: Record<string, number | null> = {}
    const deductibleRemainingByPet: Record<string, number> = {}
    const yearBoundsByPet: Record<string, { start: Date | null; end: Date | null }> = {}

    for (const p of pets) {
      const lim = Number(p.annual_coverage_limit)
      remainingLimitByPet[p.id] = Number.isFinite(lim) && lim > 0 ? lim : null
      deductibleRemainingByPet[p.id] = Math.max(0, Number(p.deductible_per_claim) || 0)
      yearBoundsByPet[p.id] = getCoverageYearBounds(p.coverage_start_date || null)
    }

    // Process claims sorted by service date
    const sorted = [...claims].sort((a, b) => {
      const da = a.service_date ? new Date(a.service_date).getTime() : 0
      const db = b.service_date ? new Date(b.service_date).getTime() : 0
      return da - db
    })

    for (const c of sorted) {
      const category = String(c.expense_category || '').toLowerCase()
      if (category !== 'insured') continue
      const pid = c.pet_id || ''
      if (!byPet[pid]) continue
      const p = petById[pid]
      const bill = Number(c.total_amount) || 0
      if (bill <= 0) continue
      const bounds = yearBoundsByPet[pid]
      const svcDate = c.service_date ? new Date(c.service_date) : null
      if (!svcDate || isNaN(svcDate.getTime())) continue
      if (bounds.start && bounds.end && !(svcDate >= bounds.start && svcDate < bounds.end)) continue

      const deductibleRemaining = deductibleRemainingByPet[pid]
      const deductibleApplied = Math.min(bill, Math.max(0, deductibleRemaining))
      const remainingAfterDeductible = Math.max(0, bill - deductibleApplied)
      const insurancePct = Math.max(0, Math.min(100, p ? (Number(p.insurance_pays_percentage) || 0) : 0)) / 100
      const potentialReimb = remainingAfterDeductible * insurancePct
      const remainingLimit = remainingLimitByPet[pid]
      const allowedReimb = remainingLimit == null ? potentialReimb : Math.min(potentialReimb, remainingLimit)
      const userCoins = remainingAfterDeductible - allowedReimb

      byPet[pid].claimed += bill
      byPet[pid].reimbursed += allowedReimb
      byPet[pid].deductibles += deductibleApplied
      byPet[pid].coinsurance += userCoins
      deductibleRemainingByPet[pid] = Math.max(0, deductibleRemaining - deductibleApplied)
      if (remainingLimit != null) remainingLimitByPet[pid] = Math.max(0, remainingLimit - allowedReimb)
    }
    // eslint-disable-next-line no-console
    console.log('[FinancialSummary] perPet calc (insured only, annual deductible & caps)', byPet)
    return byPet
  }, [claims, pets, petById])

  if (!userId) return null

  return (
    <section className="mt-6">
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
        <div className="text-lg font-semibold">Financial Summary</div>
        {loading && <div className="mt-2 text-sm text-slate-500">Loading…</div>}
        {error && <div className="mt-2 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-rose-800 text-sm">{error}</div>}
        {!loading && !error && (
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 text-sm">
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
              <div className="text-emerald-700">Total Claimed</div>
              <div className="mt-1 text-xl font-bold text-emerald-800">${overall.totalClaimed.toFixed(2)}</div>
            </div>
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
              <div className="text-emerald-700">Total Reimbursed</div>
              <div className="mt-1 text-xl font-bold text-emerald-800">${overall.totalReimbursed.toFixed(2)}</div>
            </div>
            <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
              <div className="text-blue-700">Premiums Paid YTD</div>
              <div className="mt-1 text-xl font-bold text-blue-800">${overall.premiumsYTD.toFixed(2)}</div>
            </div>
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
              <div className="text-amber-700">Deductibles Paid</div>
              <div className="mt-1 text-xl font-bold text-amber-800">${overall.deductiblesPaid.toFixed(2)}</div>
            </div>
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-4">
              <div className="text-rose-700">NET COST</div>
              <div className="mt-1 text-xl font-bold text-rose-800">${overall.netCost.toFixed(2)}</div>
            </div>
          </div>
        )}
      </div>

      <div className="mt-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
        <div className="text-base font-semibold">Per-Pet Breakdown</div>
        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {pets.map((p) => {
            const s = perPet[p.id] || { claimed: 0, reimbursed: 0, premiums: 0, deductibles: 0 }
            const effective = (s.premiums + s.deductibles) - s.reimbursed
            const color = p.species === 'cat' ? '#F97316' : p.species === 'dog' ? '#3B82F6' : '#6B7280'
            const icon = p.species === 'cat' ? '🐱' : p.species === 'dog' ? '🐶' : '🐾'
            return (
              <div key={p.id} className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
                <div className="flex items-center gap-2 text-slate-800 dark:text-slate-100">
                  <span>{icon}</span>
                  <span className="font-semibold">{p.name} ({p.species})</span>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <div className="text-slate-500">Total Claimed</div>
                    <div className="font-semibold">${s.claimed.toFixed(2)}</div>
                  </div>
                  <div>
                    <div className="text-slate-500">Total Reimbursed</div>
                    <div className="font-semibold">${s.reimbursed.toFixed(2)}</div>
                  </div>
                  <div>
                    <div className="text-slate-500">Premiums YTD</div>
                    <div className="font-semibold">${s.premiums.toFixed(2)}</div>
                  </div>
                  <div>
                    <div className="text-slate-500">Deductibles</div>
                    <div className="font-semibold">${s.deductibles.toFixed(2)}</div>
                  </div>
                </div>
                <div className="mt-3 rounded-lg border border-slate-200 dark:border-slate-800 p-3 text-sm">
                  <div className="text-slate-500">Effective Cost</div>
                  <div className="font-semibold">${effective.toFixed(2)}</div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}


