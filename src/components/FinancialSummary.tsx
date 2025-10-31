import React, { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'

type ClaimRow = {
  id: string
  pet_id: string | null
  total_amount: number | null
  reimbursed_amount: number | null
  filing_status: string | null
}

type PetRow = {
  id: string
  name: string
  species: string
  monthly_premium?: number | null
  deductible_per_claim?: number | null
  coverage_start_date?: string | null
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
        .select('id, pet_id, total_amount, reimbursed_amount, filing_status')
        .eq('user_id', userId),
      supabase
        .from('pets')
        .select('id, name, species, monthly_premium, deductible_per_claim, coverage_start_date')
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

  const isFiledLike = (status: string | null | undefined): boolean => {
    const s = String(status || '').toLowerCase()
    return s === 'filed' || s === 'submitted' || s === 'approved' || s === 'paid'
  }

  const overall = useMemo(() => {
    const totalClaimed = claims.reduce((sum, c) => sum + (Number(c.total_amount) || 0), 0)
    const totalReimbursed = claims.reduce((sum, c) => sum + (Number(c.reimbursed_amount) || 0), 0)
    const premiumsYTD = pets.reduce((sum, p) => sum + ((Number(p.monthly_premium) || 0) * monthsYTD(p.coverage_start_date || null)), 0)
    const deductiblesPaid = claims.reduce((sum, c) => {
      if (!isFiledLike(c.filing_status)) return sum
      const p = c.pet_id ? petById[c.pet_id] : undefined
      const d = p ? Number(p.deductible_per_claim) || 0 : 0
      return sum + d
    }, 0)
    const netCost = (premiumsYTD + deductiblesPaid) - totalReimbursed
    // eslint-disable-next-line no-console
    console.log('[FinancialSummary] overall calc', {
      totalClaimed,
      totalReimbursed,
      premiumsYTD,
      deductiblesPaid,
      netCost,
      pets,
      claims,
    })
    return { totalClaimed, totalReimbursed, premiumsYTD, deductiblesPaid, netCost }
  }, [claims, pets, petById])

  const perPet = useMemo(() => {
    const byPet: Record<string, { claimed: number; reimbursed: number; premiums: number; deductibles: number }> = {}
    for (const p of pets) {
      byPet[p.id] = {
        claimed: 0,
        reimbursed: 0,
        premiums: (Number(p.monthly_premium) || 0) * monthsYTD(p.coverage_start_date || null),
        deductibles: 0,
      }
    }
    for (const c of claims) {
      const pid = c.pet_id || ''
      if (!byPet[pid]) continue
      byPet[pid].claimed += (Number(c.total_amount) || 0)
      byPet[pid].reimbursed += (Number(c.reimbursed_amount) || 0)
      if (isFiledLike(c.filing_status)) {
        const p = petById[pid]
        byPet[pid].deductibles += p ? (Number(p.deductible_per_claim) || 0) : 0
      }
    }
    // eslint-disable-next-line no-console
    console.log('[FinancialSummary] perPet calc', byPet)
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


