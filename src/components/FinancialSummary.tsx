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

export default function FinancialSummary({ userId, refreshToken }: { userId: string | null; refreshToken?: number }) {
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
  }, [userId, refreshToken])

  const petById = useMemo(() => {
    const m: Record<string, PetRow> = {}
    for (const p of pets) m[p.id] = p
    return m
  }, [pets])

  // Parse YYYY-MM-DD safely as a local Date (no timezone shift)
  const parseYmdLocal = (iso: string | null | undefined): Date | null => {
    if (!iso) return null
    const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})$/)
    if (!m) return null
    const y = Number(m[1])
    const mo = Number(m[2]) - 1
    const d = Number(m[3])
    const dt = new Date(y, mo, d)
    if (isNaN(dt.getTime())) return null
    return dt
  }

  const monthsYTD = (startIso: string | null | undefined): number => {
    if (!startIso) return 0
    const start = parseYmdLocal(startIso)
    if (isNaN(start.getTime())) return 0
    const now = new Date()
    const currentYear = now.getFullYear()
    const startYear = (start as Date).getFullYear()
    if (startYear > currentYear) return 0
    const startMonthForYear = startYear < currentYear ? 0 : (start as Date).getMonth() // inclusive of start month
    const endMonth = now.getMonth() // inclusive of current month
    const months = (endMonth - startMonthForYear + 1)
    return Math.max(0, months)
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
    const viewYear = new Date().getFullYear()
    const today = new Date()

    // Premiums paid YTD (current year) from pets
    const premiumsYTD = pets.reduce((sum, p) => sum + ((Number(p.monthly_premium) || 0) * monthsYTD(p.coverage_start_date || null)), 0)

    // Non-insured visits up to today (current year)
    let nonInsuredTotal = 0
    // Insurance reimbursed (paid only) up to today (current year)
    let insurancePaidBack = 0
    // User share for paid insured claims (bill - reimbursed)
    let userSharePaidInsured = 0
    // Pending claims (submitted only) totals
    let pendingTotal = 0

    for (const c of claims) {
      const svc = c.service_date ? parseYmdLocal(c.service_date) : null
      if (!svc || isNaN(svc.getTime())) continue
      if (svc.getFullYear() !== viewYear) continue
      if (svc > today) continue
      const category = String(c.expense_category || '').toLowerCase()
      const status = String(c.filing_status || '').toLowerCase()
      const amount = Number(c.total_amount) || 0
      const reimb = Math.max(0, Number(c.reimbursed_amount) || 0)

      if (category !== 'insured') {
        nonInsuredTotal += amount
      } else if (status === 'paid') {
        insurancePaidBack += reimb
        userSharePaidInsured += Math.max(0, amount - reimb)
      } else if (status === 'submitted') {
        pendingTotal += amount
      }
    }

    const definiteTotal = premiumsYTD + nonInsuredTotal + userSharePaidInsured
    return { premiumsYTD, nonInsuredTotal, insurancePaidBack, userSharePaidInsured, definiteTotal, pendingTotal }
  }, [claims, pets])

  const perPet = useMemo(() => {
    const viewYear = new Date().getFullYear()
    const today = new Date()
    const byPet: Record<string, { claimed: number; reimbursed: number; premiums: number; deductibles: number; coinsurance: number; nonInsured?: number }> = {}
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

    // Track remaining annual coverage limit per pet (if needed)
    const remainingLimitByPet: Record<string, number | null> = {}
    for (const p of pets) {
      const lim = Number(p.annual_coverage_limit)
      remainingLimitByPet[p.id] = Number.isFinite(lim) && lim > 0 ? lim : null
    }

    // Process claims sorted by service date
    const sorted = [...claims].sort((a, b) => {
      const da = a.service_date ? (parseYmdLocal(a.service_date)?.getTime() || 0) : 0
      const db = b.service_date ? (parseYmdLocal(b.service_date)?.getTime() || 0) : 0
      return da - db
    })

    for (const c of sorted) {
      const category = String(c.expense_category || '').toLowerCase()
      const pid = c.pet_id || ''
      if (!byPet[pid]) continue
      const bill = Number(c.total_amount) || 0
      if (bill <= 0) continue
      const svcDate = c.service_date ? parseYmdLocal(c.service_date) : null
      if (!svcDate || isNaN(svcDate.getTime())) continue
      if (svcDate.getFullYear() !== viewYear) continue
      if (category !== 'insured') {
        if (svcDate <= today) byPet[pid].nonInsured = (byPet[pid].nonInsured || 0) + bill
        continue
      }
      const status = String(c.filing_status || '').toLowerCase()
      if (status !== 'paid') continue

      const deductibleApplied = Math.max(0, Number(c.deductible_applied) || 0)
      const allowedReimb = Math.max(0, Number(c.reimbursed_amount) || 0)
      const userCoins = Math.max(0, bill - deductibleApplied - allowedReimb)

      byPet[pid].claimed += bill
      byPet[pid].reimbursed += allowedReimb
      byPet[pid].deductibles += deductibleApplied
      byPet[pid].coinsurance += userCoins
      const remainingLimit = remainingLimitByPet[pid]
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
          <>
            {/* Year Total (calculation view) */}
            <div className="mt-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
              <div className="text-sm font-semibold">{`📊 ${new Date().getFullYear()} TOTAL`}</div>
              <div className="mt-3 text-sm space-y-2">
                <div className="flex items-center justify-between">
                  <div className="text-slate-600">Spent on all pets (including premiums)</div>
                  <div className="text-xl font-bold">${(overall.premiumsYTD + overall.nonInsuredTotal + overall.userSharePaidInsured + overall.insurancePaidBack).toFixed(2)}</div>
                </div>
                <div className="flex items-center justify-between">
                  <div className="text-slate-600">- Insurance Reimbursed</div>
                  <div className="text-xl font-bold">${overall.insurancePaidBack.toFixed(2)}</div>
                </div>
                <div className="pt-2 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between">
                  <div className="text-slate-800 font-semibold">= Your Net Cost</div>
                  <div className="text-2xl font-bold">${overall.definiteTotal.toFixed(2)}</div>
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      <div className="mt-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5">
        <div className="text-sm sm:text-base font-semibold">YOUR OUT-OF-POCKET BREAKDOWN</div>
        <div className="mt-3 text-sm space-y-2">
          <div className="flex items-center justify-between">
            <div className="text-slate-600">Insurance Premiums <span className="text-xs text-slate-500">(Monthly insurance cost)</span></div>
            <div className="font-mono font-semibold">${overall.premiumsYTD.toFixed(2)}</div>
          </div>
          <div className="flex items-center justify-between">
            <div className="text-slate-600">Non-Insured Vet Visits <span className="text-xs text-slate-500">(Not covered by insurance)</span></div>
            <div className="font-mono font-semibold">${overall.nonInsuredTotal.toFixed(2)}</div>
          </div>
          <div className="flex items-center justify-between">
            <div className="text-slate-600">Amount You Paid (for covered claims)</div>
            <div className="font-mono font-semibold">${overall.userSharePaidInsured.toFixed(2)}</div>
          </div>
          <div className="pt-2 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <div className="text-slate-800 font-semibold">Total You Paid</div>
            <div className="text-xl sm:text-2xl font-bold font-mono">${overall.definiteTotal.toFixed(2)}</div>
          </div>
        </div>
      </div>

      <div className="mt-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5">
        <div className="text-sm sm:text-base font-semibold">Per-Pet Breakdown</div>
        {pets.length === 0 && (
          <div className="mt-3 text-sm text-slate-600">No pets yet. Add a pet to see per-pet costs.</div>
        )}
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {pets.map((p) => {
            const s = perPet[p.id] || { claimed: 0, reimbursed: 0, premiums: 0, deductibles: 0, coinsurance: 0, nonInsured: 0 }
            const color = p.species === 'cat' ? '#F97316' : p.species === 'dog' ? '#3B82F6' : '#6B7280'
            const icon = p.species === 'cat' ? '🐱' : p.species === 'dog' ? '🐶' : '🐾'
            const outOfPocket = s.premiums + (s.nonInsured || 0) + (s.deductibles + s.coinsurance)
            const hasActivity = ((s.nonInsured || 0) + s.deductibles + s.coinsurance + s.reimbursed + s.claimed) > 0
            return (
              <div key={p.id} className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
                <div className="flex items-center gap-2 text-slate-800 dark:text-slate-100 min-w-0">
                  <span>{icon}</span>
                  <span className="font-semibold truncate" title={`${p.name} (${p.species})`}>{p.name} ({p.species})</span>
                </div>
                <div className="mt-3 text-sm">
                  <div className="flex items-center justify-between">
                    <div className="text-slate-600">Your Out-of-Pocket Cost</div>
                    <div className="font-mono font-semibold">${outOfPocket.toFixed(2)}</div>
                  </div>
                  {!hasActivity ? (
                    <div className="mt-2 text-xs text-slate-500">(No claims this year)</div>
                  ) : (
                    <div className="mt-3 space-y-1">
                      <div className="text-xs font-semibold text-slate-500">YOUR COSTS</div>
                      <div className="flex items-center justify-between"><span className="text-slate-600">Premiums (attributed)</span><span className="font-mono font-semibold">${s.premiums.toFixed(2)}</span></div>
                      <div className="flex items-center justify-between"><span className="text-slate-600">Non-Insured Visits</span><span className="font-mono font-semibold">${(s.nonInsured || 0).toFixed(2)}</span></div>
                      <div className="flex items-center justify-between"><span className="text-slate-600">Amount You Paid (for covered claims)</span><span className="font-mono font-semibold">${(s.deductibles + s.coinsurance).toFixed(2)}</span></div>
                      <div className="pt-2 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between"><span className="text-slate-700 font-semibold">= Total You Paid</span><span className="font-mono font-bold">${outOfPocket.toFixed(2)}</span></div>
                      <div className="pt-2 text-xs font-semibold text-slate-500">INSURANCE COVERAGE</div>
                      <div className="flex items-center justify-between"><span className="text-slate-600">Paid Back</span><span className="font-mono font-semibold">${s.reimbursed.toFixed(2)}</span></div>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}


