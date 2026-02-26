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
  created_at?: string | null
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

type HeroTotals = { total: number; reimbursed: number; netCost: number }

type FinancialSummaryProps = {
  userId: string | null
  refreshToken?: number
  period?: string
  // Callback with hero-level totals so parent can render them
  onTotalsReady?: (t: HeroTotals) => void
  // Collapsible section controls (Summary card removed — hero is now in parent)
  outOfPocketCollapsed?: boolean
  onOutOfPocketToggle?: () => void
  perPetCollapsed?: boolean
  onPerPetToggle?: () => void
}

export default function FinancialSummary({
  userId,
  refreshToken,
  period,
  onTotalsReady,
  outOfPocketCollapsed = false,
  onOutOfPocketToggle,
  perPetCollapsed = false,
  onPerPetToggle
}: FinancialSummaryProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [claims, setClaims] = useState<ClaimRow[]>([])
  const [pets, setPets] = useState<PetRow[]>([])
  // All pet_expenses rows — source of truth for hero total (vet_medical, food, grooming, etc.)
  const [allPetExpenses, setAllPetExpenses] = useState<{ amount: number; expense_date: string }[]>([])

  useEffect(() => {
    if (!userId) return
    setLoading(true)
    setError(null)
    Promise.all([
      supabase
        .from('claims')
        .select('id, pet_id, total_amount, reimbursed_amount, filing_status, expense_category, service_date, created_at, deductible_applied, user_coinsurance_payment, insurance_reimbursement')
        .eq('user_id', userId),
      supabase
        .from('pets')
        .select('id, name, species, monthly_premium, deductible_per_claim, coverage_start_date, insurance_pays_percentage, annual_coverage_limit')
        .eq('user_id', userId),
      // All pet_expenses for hero total (includes vet_medical, food, grooming, etc.)
      supabase
        .from('pet_expenses')
        .select('amount, expense_date')
        .eq('user_id', userId)
    ])
      .then(([cl, pe, nv]) => {
        if (cl.error) throw cl.error
        if (pe.error) throw pe.error
        if (nv.error) throw nv.error
        setClaims((cl.data || []) as any)
        setPets((pe.data || []) as any)
        setAllPetExpenses((nv.data || []) as any)
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

  const isNonInsuredCategory = (val: string | null | undefined): boolean => {
    const v = String(val || '').trim().toLowerCase()
    return v === 'not_insured' || v === 'not insured'
  }

  // Calculate premiums for a specific pet for the current filter period
  const calculatePremiumsForPet = (pet: PetRow, filterYear: number | null): { total: number; monthsCount: number; context: string } => {
    const monthly = Number(pet.monthly_premium) || 0
    if (monthly === 0) {
      return { total: 0, monthsCount: 0, context: 'No insurance' }
    }

    const coverageStart = parseYmdLocal(pet.coverage_start_date || null)
    if (!coverageStart) {
      return { total: 0, monthsCount: 0, context: 'No coverage start date' }
    }

    const today = new Date()
    const currentYear = today.getFullYear()
    const currentMonth = today.getMonth() // 0-11

    // Determine the year we're calculating for
    const targetYear = filterYear !== null ? filterYear : null // null means "All Time"

    // If filtering by a specific year
    if (targetYear !== null) {
      // If coverage starts after the target year, return $0
      if (coverageStart.getFullYear() > targetYear) {
        return { total: 0, monthsCount: 0, context: `coverage started ${coverageStart.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}` }
      }

      // If target year is in the future, return $0
      if (targetYear > currentYear) {
        return { total: 0, monthsCount: 0, context: 'future year' }
      }

      // Calculate months for the target year
      const yearStart = new Date(targetYear, 0, 1) // Jan 1 of target year
      const yearEnd = new Date(targetYear, 11, 31) // Dec 31 of target year

      // Coverage started this year or earlier
      const effectiveStart = coverageStart > yearStart ? coverageStart : yearStart

      // If target year is current year, end at current month; otherwise end at Dec 31
      const effectiveEnd = targetYear === currentYear
        ? new Date(currentYear, currentMonth, today.getDate())
        : yearEnd

      // Calculate months between effectiveStart and effectiveEnd
      // Count billing cycles: how many 1st-of-month dates have passed since coverage start
      // If coverage starts Nov 30 and today is Dec 2, only 1 billing cycle (Dec 1) has passed
      const monthsDiff = (effectiveEnd.getFullYear() - effectiveStart.getFullYear()) * 12
        + (effectiveEnd.getMonth() - effectiveStart.getMonth())

      // Add 1 only if we've passed the start day in the current month, OR if start day > today's day
      // This ensures we count the first month, and only add subsequent months when a new billing cycle starts
      const startDay = effectiveStart.getDate()
      const endDay = effectiveEnd.getDate()
      const additionalMonth = endDay >= startDay ? 1 : 0

      const months = Math.max(0, monthsDiff + additionalMonth)
      const total = monthly * months

      // Build context string
      let context = ''
      if (coverageStart.getFullYear() === targetYear && coverageStart.getMonth() > 0) {
        // Started mid-year
        const startMonth = coverageStart.toLocaleDateString('en-US', { month: 'short' })
        const endMonth = effectiveEnd.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
        context = `${startMonth} - ${endMonth}`
      } else if (targetYear === currentYear && months < 12) {
        // Current year, not full year yet
        const endMonth = effectiveEnd.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
        context = `Jan - ${endMonth}`
      } else {
        // Full year
        context = `${targetYear}`
      }

      return { total, monthsCount: months, context }
    }

    // "All Time" calculation
    // Count billing cycles: how many 1st-of-month dates have passed since coverage start
    const monthsDiff = (today.getFullYear() - coverageStart.getFullYear()) * 12
      + (today.getMonth() - coverageStart.getMonth())

    // Add 1 only if we've passed the start day in the current month
    // Example: Start Nov 30, Today Dec 2 → monthsDiff=1, startDay=30, todayDay=2 → additionalMonth=0 → total=1
    // Example: Start Nov 1, Today Dec 2 → monthsDiff=1, startDay=1, todayDay=2 → additionalMonth=1 → total=2
    const startDay = coverageStart.getDate()
    const todayDay = today.getDate()
    const additionalMonth = todayDay >= startDay ? 1 : 0

    const months = Math.max(0, monthsDiff + additionalMonth)
    const total = monthly * months
    const context = `since ${coverageStart.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}`

    return { total, monthsCount: months, context }
  }

  // ─── Period helpers ────────────────────────────────────────────────────────
  // Parses 'YYYY-MM' period string
  const isMonthPeriod = /^\d{4}-\d{2}$/.test(period || '')
  const viewMonthYear = isMonthPeriod
    ? { year: Number((period || '').slice(0, 4)), month: Number((period || '').slice(5, 7)) - 1 }
    : null
  const isLast12 = String(period || '').toLowerCase() === 'last12'

  // Returns true if a date falls within the selected period
  const inPeriod = (svc: Date): boolean => {
    const today = new Date()
    if (svc > today) return false
    if (viewMonthYear) {
      return svc.getFullYear() === viewMonthYear.year && svc.getMonth() === viewMonthYear.month
    }
    if (isLast12) {
      const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 365)
      return svc >= cutoff
    }
    const p = String(period || '').toLowerCase()
    if (p === 'all') return true
    if (/^\d{4}$/.test(p)) return svc.getFullYear() === Number(p)
    return svc.getFullYear() === new Date().getFullYear() // default: current year
  }

  const overall = useMemo(() => {
    const nowYear = new Date().getFullYear()
    const viewYear = (() => {
      if (isMonthPeriod || isLast12) return null
      const p = String(period || '').toLowerCase()
      if (p === '2024' || p === '2025' || p === '2026') return Number(p)
      if (p === 'all') return null
      return nowYear
    })()

    const premiumsYTD = pets.reduce((sum, p) => {
      // For month period: 1 month if coverage was active that month
      if (viewMonthYear) {
        const start = parseYmdLocal(p.coverage_start_date || null)
        if (!start) return sum
        const monthly = Number(p.monthly_premium) || 0
        if (monthly === 0) return sum
        const targetMonth = new Date(viewMonthYear.year, viewMonthYear.month, 1)
        if (start > targetMonth) return sum // coverage not started yet
        const futureMonth = viewMonthYear.year > new Date().getFullYear() ||
          (viewMonthYear.year === new Date().getFullYear() && viewMonthYear.month > new Date().getMonth())
        if (futureMonth) return sum
        return sum + monthly
      }
      const calc = calculatePremiumsForPet(p, viewYear)
      return sum + calc.total
    }, 0)

    let nonInsuredTotal = 0
    let insurancePaidBack = 0
    let userShareCoveredClaims = 0
    let insuredBillsTotal = 0
    let pendingTotal = 0

    for (const c of claims) {
      const svc = c.service_date ? (parseYmdLocal(c.service_date) || new Date(c.service_date as any)) : null
      if (!svc || isNaN(svc.getTime())) continue
      if (!inPeriod(svc)) continue
      const category = String(c.expense_category || '').toLowerCase()
      const status = String(c.filing_status || '').toLowerCase()
      const amount = Number(c.total_amount) || 0
      const reimb = Math.max(0, Number(c.reimbursed_amount) || 0)

      if (category === 'not_insured' || category === 'not insured') {
        nonInsuredTotal += amount
      } else if (category === 'insured' && status === 'paid') {
        insurancePaidBack += reimb
        insuredBillsTotal += amount
        userShareCoveredClaims += Math.max(0, amount - reimb)
      } else if (category === 'insured') {
        insuredBillsTotal += amount
        userShareCoveredClaims += Math.max(0, amount - reimb)
      }
      if (status === 'submitted') pendingTotal += amount
    }

    // All pet_expenses for hero total (food, grooming, supplies, boarding, vet_medical, other)
    let petExpensesTotal = 0
    for (const e of allPetExpenses) {
      const d = parseYmdLocal(e.expense_date) || (e.expense_date ? new Date(e.expense_date) : null)
      if (!d || isNaN(d.getTime()) || !inPeriod(d)) continue
      petExpensesTotal += Number(e.amount) || 0
    }

    // Hero totals: pet_expenses is the source of truth for all spending.
    // Claims are already mirrored in pet_expenses, so don't add them again.
    const heroTotal = petExpensesTotal
    const heroNetCost = heroTotal - insurancePaidBack

    const definiteTotal = premiumsYTD + nonInsuredTotal + userShareCoveredClaims
    return {
      premiumsYTD, nonInsuredTotal, insurancePaidBack, userShareCoveredClaims,
      insuredBillsTotal, definiteTotal, pendingTotal,
      heroTotal, heroNetCost, petExpensesTotal,
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [claims, pets, allPetExpenses, period])

  // Notify parent with hero totals whenever they change
  useEffect(() => {
    onTotalsReady?.({
      total: overall.heroTotal,
      reimbursed: overall.insurancePaidBack,
      netCost: overall.heroNetCost,
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [overall.heroTotal, overall.insurancePaidBack, overall.heroNetCost])

  const perPet = useMemo(() => {
    const nowYear = new Date().getFullYear()
    const viewYear = (() => {
      if (isMonthPeriod || isLast12) return null
      const p = String(period || '').toLowerCase()
      if (p === '2024' || p === '2025' || p === '2026') return Number(p)
      if (p === 'all') return null
      return nowYear
    })()
    const byPet: Record<string, {
      claimed: number
      reimbursed: number
      premiums: number
      nonInsured: number
      pendingBills: number
      filedClaims: number
    }> = {}
    for (const p of pets) {
      let premiums = 0
      if (viewMonthYear) {
        const start = parseYmdLocal(p.coverage_start_date || null)
        const monthly = Number(p.monthly_premium) || 0
        if (start && monthly > 0) {
          const targetMonth = new Date(viewMonthYear.year, viewMonthYear.month, 1)
          const futureMonth = viewMonthYear.year > new Date().getFullYear() ||
            (viewMonthYear.year === new Date().getFullYear() && viewMonthYear.month > new Date().getMonth())
          if (start <= targetMonth && !futureMonth) premiums = monthly
        }
      } else {
        premiums = calculatePremiumsForPet(p, viewYear).total
      }
      byPet[p.id] = { claimed: 0, reimbursed: 0, premiums, nonInsured: 0, pendingBills: 0, filedClaims: 0 }
    }

    const sorted = [...claims].sort((a, b) => {
      const da = a.service_date ? (parseYmdLocal(a.service_date)?.getTime() || new Date(a.service_date as any).getTime() || 0) : 0
      const db = b.service_date ? (parseYmdLocal(b.service_date)?.getTime() || new Date(b.service_date as any).getTime() || 0) : 0
      return da - db
    })

    for (const c of sorted) {
      const category = String(c.expense_category || '').toLowerCase()
      const pid = c.pet_id || ''
      if (!byPet[pid]) continue
      const bill = Number(c.total_amount) || 0
      if (bill <= 0) continue
      const svcDate = c.service_date ? (parseYmdLocal(c.service_date) || new Date(c.service_date as any)) : null
      if (!svcDate || isNaN(svcDate.getTime())) continue
      if (!inPeriod(svcDate)) continue

      if (category === 'insured') {
        const stRaw = String(c.filing_status || 'not_submitted').toLowerCase()
        const st = stRaw === 'filed' ? 'submitted' : stRaw
        if (st === 'not_submitted' || st === 'not_filed') byPet[pid].pendingBills += 1
        else if (st === 'submitted' || st === 'paid' || st === 'denied' || st === 'approved') byPet[pid].filedClaims += 1
      }

      if (category === 'not_insured' || category === 'not insured') {
        byPet[pid].nonInsured += bill
      } else {
        byPet[pid].claimed += bill
        const reimb = Math.max(0, Number(c.reimbursed_amount) || 0)
        byPet[pid].reimbursed += reimb
      }
    }
    return byPet
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [claims, pets, petById, period])

  if (!userId) return null

  // Collapsible section header component
  const CollapsibleHeader = ({
    title,
    subtitle,
    collapsed,
    onToggle,
    icon
  }: {
    title: string
    subtitle?: string
    collapsed: boolean
    onToggle?: () => void
    icon?: string
  }) => (
    <button
      type="button"
      onClick={onToggle}
      className="w-full flex items-center justify-between p-4 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors rounded-xl"
    >
      <div className="flex items-center gap-3">
        {icon && <span className="text-xl">{icon}</span>}
        <div className="text-left">
          <div className="font-bold text-slate-800 dark:text-slate-100">{title}</div>
          {subtitle && <div className="text-sm text-slate-500 dark:text-slate-400">{subtitle}</div>}
        </div>
      </div>
      <svg
        className={`w-5 h-5 text-slate-400 transition-transform duration-200 ${collapsed ? '' : 'rotate-180'}`}
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
      </svg>
    </button>
  )

  // Human-readable label for the current period
  const periodLabel = (() => {
    const p = String(period || '')
    if (isMonthPeriod) {
      const [y, m] = p.split('-')
      return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    }
    if (p.toLowerCase() === 'all') return 'All Time'
    if (p.toLowerCase() === 'last12') return 'Last 12 Months'
    return p
  })()

  return (
    <section className="space-y-3">
      {error && (
        <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-rose-800 text-sm mx-1">{error}</div>
      )}

      {/* Out-of-Pocket Breakdown - Collapsible */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm shadow-[0_4px_20px_rgba(0,0,0,0.08)] overflow-hidden">
        <CollapsibleHeader
          title="Out-of-Pocket Breakdown"
          subtitle={!loading && !error ? `${periodLabel} · $${overall.definiteTotal.toFixed(2)}` : undefined}
          collapsed={outOfPocketCollapsed}
          onToggle={onOutOfPocketToggle}
          icon="💰"
        />
        <div
          className={`transition-all duration-300 ease-in-out overflow-hidden ${
            outOfPocketCollapsed ? 'max-h-0 opacity-0' : 'max-h-[800px] opacity-100'
          }`}
        >
          <div className="px-5 pb-5 text-sm space-y-2">
            <div>
              <div className="flex items-center justify-between">
                <div className="text-slate-600 dark:text-slate-400">Insurance Premiums <span className="text-xs text-slate-500">(Monthly insurance cost)</span></div>
                <div className="font-mono font-semibold">${overall.premiumsYTD.toFixed(2)}</div>
              </div>
              {/* Per-pet premium breakdown */}
              {(() => {
                const nowYear = new Date().getFullYear()
                const viewYear = (() => {
                  if (isMonthPeriod || isLast12) return null
                  const p = String(period || '').toLowerCase()
                  if (p === '2024' || p === '2025' || p === '2026') return Number(p)
                  if (p === 'all') return null
                  return nowYear
                })()

                // Calculate premiums for each pet
                const petPremiums = pets.map(p => {
                  let total = 0, monthsCount = 0, context = ''
                  if (viewMonthYear) {
                    const start = parseYmdLocal(p.coverage_start_date || null)
                    const monthly = Number(p.monthly_premium) || 0
                    if (start && monthly > 0) {
                      const targetMonth = new Date(viewMonthYear.year, viewMonthYear.month, 1)
                      const futureMonth = viewMonthYear.year > new Date().getFullYear() ||
                        (viewMonthYear.year === new Date().getFullYear() && viewMonthYear.month > new Date().getMonth())
                      if (start <= targetMonth && !futureMonth) { total = monthly; monthsCount = 1; context = periodLabel }
                    }
                  } else {
                    const calc = calculatePremiumsForPet(p, viewYear)
                    total = calc.total; monthsCount = calc.monthsCount; context = calc.context
                  }
                  return { pet: p, total, monthsCount, context }
                }).filter(p => p.total > 0 || Number(p.pet.monthly_premium) > 0)

                if (petPremiums.length === 0) return null

                return (
                  <div className="ml-4 mt-2 space-y-1 text-xs text-slate-500">
                    {petPremiums.map(({ pet, total, monthsCount, context }) => {
                      const monthly = Number(pet.monthly_premium) || 0
                      if (monthly === 0) {
                        return (
                          <div key={pet.id} className="flex items-center justify-between">
                            <div>• {pet.name}: No insurance</div>
                            <div></div>
                          </div>
                        )
                      }
                      if (total === 0) {
                        return (
                          <div key={pet.id} className="flex items-center justify-between">
                            <div>• {pet.name}: $0 ({context})</div>
                            <div></div>
                          </div>
                        )
                      }
                      return (
                        <div key={pet.id} className="flex items-center justify-between">
                          <div>• {pet.name}: ${monthly.toFixed(2)}/mo × {monthsCount} = ${total.toFixed(2)} ({context})</div>
                          <div></div>
                        </div>
                      )
                    })}
                  </div>
                )
              })()}
            </div>
            <div className="flex items-center justify-between">
              <div className="text-slate-600 dark:text-slate-400">Non-Insured Vet Visits <span className="text-xs text-slate-500">(Not covered by insurance)</span></div>
              <div className="font-mono font-semibold">${overall.nonInsuredTotal.toFixed(2)}</div>
            </div>
            <div className="flex items-center justify-between">
              <div className="text-slate-600 dark:text-slate-400">Amount You Paid (for covered claims)</div>
              <div className="font-mono font-semibold">${overall.userShareCoveredClaims.toFixed(2)}</div>
            </div>
            <div className="pt-2 border-t border-slate-200 dark:border-slate-700 flex items-center justify-between">
              <div className="text-slate-800 dark:text-slate-100 font-semibold">Total You Paid</div>
              <div className="text-xl sm:text-2xl font-bold font-mono">${overall.definiteTotal.toFixed(2)}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Per-Pet Breakdown - Collapsible */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm shadow-[0_4px_20px_rgba(0,0,0,0.08)] overflow-hidden">
        <CollapsibleHeader
          title="Per-Pet Breakdown"
          subtitle={`${pets.length} pet${pets.length !== 1 ? 's' : ''} · ${periodLabel}`}
          collapsed={perPetCollapsed}
          onToggle={onPerPetToggle}
          icon="🐕"
        />
        <div
          className={`transition-all duration-300 ease-in-out overflow-hidden ${
            perPetCollapsed ? 'max-h-0 opacity-0' : 'max-h-[2000px] opacity-100'
          }`}
        >
          <div className="px-5 pb-5">
            {pets.length === 0 && (
              <div className="text-sm text-slate-600 dark:text-slate-400">No pets yet. Add a pet to see per-pet costs.</div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {pets.map((p) => {
            const s = perPet[p.id] || { claimed: 0, reimbursed: 0, premiums: 0, nonInsured: 0, pendingBills: 0, filedClaims: 0 }
            const color = p.species === 'cat' ? '#F97316' : p.species === 'dog' ? '#3B82F6' : '#6B7280'
            const icon = p.species === 'cat' ? '🐱' : p.species === 'dog' ? '🐶' : '🐾'
            const outOfPocket = s.premiums + (s.nonInsured || 0) + s.claimed - s.reimbursed
            const hasActivity = ((s.nonInsured || 0) + s.reimbursed + s.claimed) > 0
            return (
              <div key={p.id} className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
                <div className="flex items-center gap-2 text-slate-800 dark:text-slate-100 min-w-0">
                  <span>{icon}</span>
                  <span className="font-semibold truncate" title={`${p.name} (${p.species})`}>{p.name} ({p.species})</span>
                </div>
                <div className="mt-3 text-sm">
                  {!hasActivity ? (
                    <>
                      <div className="flex items-center justify-between">
                        <div className="text-slate-800 dark:text-slate-100 font-bold">YOUR OUT-OF-POCKET COST</div>
                        <div className="font-mono font-bold text-lg">${outOfPocket.toFixed(2)}</div>
                      </div>
                      <div className="mt-2 text-xs text-slate-500">(No vet bills this year)</div>
                    </>
                  ) : (
                    <div className="space-y-1">
                      <div className="text-xs font-semibold text-slate-500">YOUR COSTS</div>
                      <div className="flex items-center justify-between"><span className="text-slate-600">Premiums (attributed)</span><span className="font-mono font-semibold">${s.premiums.toFixed(2)}</span></div>
                      <div className="flex items-center justify-between"><span className="text-slate-600">Vet Bills (insured + non-insured)</span><span className="font-mono font-semibold">${(s.claimed + (s.nonInsured || 0)).toFixed(2)}</span></div>
                      <div className="pt-2 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between"><span className="text-slate-600">Subtotal Paid</span><span className="font-mono font-semibold">${(s.premiums + s.claimed + (s.nonInsured || 0)).toFixed(2)}</span></div>
                      <div className="pt-3 text-xs font-semibold text-slate-500">INSURANCE COVERAGE</div>
                      <div className="flex items-center justify-between"><span className="text-slate-600">Reimbursements Received</span><span className="font-mono font-semibold">${s.reimbursed.toFixed(2)}</span></div>
                      <div className="pt-3 border-t-2 border-slate-300 dark:border-slate-700 flex items-center justify-between"><span className="text-slate-800 dark:text-slate-100 font-bold">YOUR OUT-OF-POCKET COST</span><span className="font-mono font-bold text-lg">${outOfPocket.toFixed(2)}</span></div>
                      <div className="text-xs text-slate-500">
                        {s.pendingBills > 0
                          ? `(${s.pendingBills} bill${s.pendingBills === 1 ? '' : 's'} pending submission)`
                          : (s.filedClaims > 0
                            ? `(${s.filedClaims} claim${s.filedClaims === 1 ? '' : 's'} filed)`
                            : '')}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}


