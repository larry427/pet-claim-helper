import React, { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { fetchOdiePolicy } from '../lib/odieApi'
import type { OdiePolicy } from '../lib/odieApi'
import type { PetProfile } from '../types'
import { getDeadlineDays } from '../lib/insuranceOptions'
import OdieConnectButton from './OdieConnectButton'
import { ChevronDown, ChevronLeft, Clock, AlertTriangle, FileText, Stethoscope, TrendingUp, Shield, Pill, Upload, Pencil } from 'lucide-react'
import EditClaimModal from './EditClaimModal'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type PetPageProps = {
  pet: PetProfile
  claims: any[]
  userId: string
  onBack: () => void
  onRefreshPets: () => void
  onRefreshClaims: () => Promise<void>
  onUploadForPet: (petId: string) => void
}

type MedicationRow = {
  id: string
  medication_name: string
  dosage: string | null
  frequency: string
  start_date: string
  end_date: string | null
  pets?: { name: string; species: string } | null
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CATEGORY_COLORS: Record<string, string> = {
  food_treats: '#10b981',
  grooming: '#8b5cf6',
  supplies_gear: '#f97316',
  training_boarding: '#f59e0b',
  vet_medical: '#f43f5e',
  other: '#64748b',
}

const CATEGORY_LABELS: Record<string, string> = {
  food_treats: 'Food & Treats',
  supplies_gear: 'Supplies',
  grooming: 'Grooming',
  training_boarding: 'Boarding',
  other: 'Other',
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseLocalDate(iso?: string | null): Date | null {
  if (!iso) return null
  const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return null
  const dt = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  return Number.isNaN(dt.getTime()) ? null : dt
}

function getClaimDeadlineDays(c: any): number {
  const ins = c.pets?.insurance_company || ''
  const lookup = getDeadlineDays(ins)
  if (lookup) return lookup
  const petDeadline = c.pets?.filing_deadline_days
  return typeof petDeadline === 'number' && petDeadline > 0 ? petDeadline : 90
}

function getDaysRemaining(c: any): number | null {
  const svc = parseLocalDate(c.service_date)
  if (!svc) return null
  const deadline = new Date(svc.getTime())
  deadline.setDate(deadline.getDate() + getClaimDeadlineDays(c))
  const now = new Date()
  return Math.ceil((deadline.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
}

function computeAge(dob: string | null | undefined): string | null {
  if (!dob) return null
  const birth = parseLocalDate(dob)
  if (!birth) return null
  const now = new Date()
  let years = now.getFullYear() - birth.getFullYear()
  const mDiff = now.getMonth() - birth.getMonth()
  if (mDiff < 0 || (mDiff === 0 && now.getDate() < birth.getDate())) years--
  if (years < 1) {
    const months = (now.getFullYear() - birth.getFullYear()) * 12 + now.getMonth() - birth.getMonth()
    return months <= 1 ? '1 month old' : `${months} months old`
  }
  return years === 1 ? '1 year old' : `${years} years old`
}

function fmtMoney(val: number): string {
  return `$${val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function statusBadge(status: string): { text: string; cls: string; borderColor: string } {
  const s = (status || 'not_submitted').toLowerCase()
  switch (s) {
    case 'filed':
    case 'submitted':
      return { text: 'Submitted', cls: 'bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300 border-blue-200 dark:border-blue-800', borderColor: 'border-l-blue-500' }
    case 'approved':
      return { text: 'Approved', cls: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800', borderColor: 'border-l-emerald-500' }
    case 'paid':
      return { text: 'Paid', cls: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800', borderColor: 'border-l-emerald-500' }
    case 'denied':
      return { text: 'Denied', cls: 'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300 border-red-200 dark:border-red-800', borderColor: 'border-l-red-500' }
    default:
      return { text: 'Pending', cls: 'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300 border-amber-200 dark:border-amber-800', borderColor: 'border-l-amber-500' }
  }
}

// ---------------------------------------------------------------------------
// Accordion section wrapper — with gradient header when expanded
// ---------------------------------------------------------------------------

function AccordionSection({
  title,
  icon,
  defaultOpen = false,
  count,
  delay = 0,
  children,
}: {
  title: string
  icon: React.ReactNode
  defaultOpen?: boolean
  count?: number
  delay?: number
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <div
      className="animate-fade-in-up bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm rounded-2xl border border-white/60 dark:border-slate-800 shadow-xl shadow-slate-200/50 dark:shadow-none overflow-hidden"
      style={{ animationDelay: `${delay}ms` }}
    >
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={`w-full flex items-center justify-between px-5 py-4 text-left group transition-all duration-300 ${
          open ? 'bg-gradient-to-r from-emerald-50/80 via-teal-50/40 to-transparent dark:from-emerald-950/30 dark:via-teal-950/15 dark:to-transparent' : 'hover:bg-slate-50/80 dark:hover:bg-slate-800/40'
        }`}
      >
        <div className="flex items-center gap-3">
          <span className={`transition-colors duration-300 ${open ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400 dark:text-slate-500'}`}>{icon}</span>
          <span className="font-semibold text-slate-900 dark:text-slate-100 text-lg">{title}</span>
          {typeof count === 'number' && (
            <span className="text-sm font-medium text-slate-400 dark:text-slate-500 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-full">
              {count}
            </span>
          )}
        </div>
        <ChevronDown
          size={18}
          className={`text-slate-400 transition-transform duration-300 ${open ? 'rotate-180' : ''}`}
        />
      </button>
      <div
        className={`overflow-hidden transition-all duration-300 ease-in-out ${
          open ? 'max-h-[3000px] opacity-100' : 'max-h-0 opacity-0'
        }`}
      >
        <div className="px-5 pb-5 pt-0">{children}</div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Progress bar (for Odie insurance) — thicker, gradient fills
// ---------------------------------------------------------------------------

function ProgressBar({ label, used, total, color = 'emerald' }: { label: string; used: number; total: number; color?: string }) {
  const pct = total > 0 ? Math.min(100, (used / total) * 100) : 0
  const remaining = Math.max(0, total - used)

  // Dynamic color based on usage
  let barGradient = 'from-emerald-400 to-emerald-600'
  if (pct > 80) barGradient = 'from-red-400 to-red-600'
  else if (pct > 60) barGradient = 'from-amber-400 to-amber-600'
  else if (color === 'teal') barGradient = 'from-teal-400 to-teal-600'

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="text-base font-semibold text-slate-800 dark:text-slate-200">{label}</span>
        <span className="text-base font-bold text-slate-900 dark:text-slate-100">{fmtMoney(remaining)} <span className="font-normal text-slate-500 dark:text-slate-400">remaining</span></span>
      </div>
      <div className="h-3 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden shadow-inner">
        <div
          className={`h-full rounded-full bg-gradient-to-r ${barGradient} transition-all duration-700 shadow-sm`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="flex items-center justify-between mt-1.5">
        <span className="text-base text-slate-500 dark:text-slate-400">{fmtMoney(used)} used</span>
        <span className="text-base text-slate-500 dark:text-slate-400">{fmtMoney(total)} total</span>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main PetPage component
// ---------------------------------------------------------------------------

export default function PetPage({ pet, claims, userId, onBack, onRefreshPets, onRefreshClaims, onUploadForPet }: PetPageProps) {
  // Filter claims for this pet
  const petClaims = useMemo(() =>
    claims
      .filter((c: any) => c.pet_id === pet.id)
      .sort((a: any, b: any) => {
        const da = parseLocalDate(a.service_date)?.getTime() || 0
        const db = parseLocalDate(b.service_date)?.getTime() || 0
        return db - da
      }),
    [claims, pet.id]
  )

  // Odie API data (only for connected Odie pets)
  const [odiePolicy, setOdiePolicy] = useState<OdiePolicy | null>(null)
  const [odieLoading, setOdieLoading] = useState(false)

  useEffect(() => {
    if (!pet.odie_connected || !pet.odie_policy_number) return
    setOdieLoading(true)
    fetchOdiePolicy(pet.odie_policy_number)
      .then((res) => {
        if (res.ok && res.policy) setOdiePolicy(res.policy)
      })
      .catch(() => {})
      .finally(() => setOdieLoading(false))
  }, [pet.odie_connected, pet.odie_policy_number])

  // Medications (fetched from Supabase)
  const [medications, setMedications] = useState<MedicationRow[]>([])
  useEffect(() => {
    const pad = (n: number) => String(n).padStart(2, '0')
    const now = new Date()
    const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
    supabase
      .from('medications')
      .select('id, medication_name, dosage, frequency, start_date, end_date')
      .eq('pet_id', pet.id)
      .eq('user_id', userId)
      .or(`end_date.is.null,end_date.gte.${today}`)
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        if (data) setMedications(data as MedicationRow[])
      })
  }, [pet.id, userId])


  // Expanded claim inline detail
  const [expandedClaimId, setExpandedClaimId] = useState<string | null>(null)
  const [showAllClaims, setShowAllClaims] = useState(false)
  const [editingClaim, setEditingClaim] = useState<any | null>(null)

  // Compute alerts for this pet
  const overdueClaims = petClaims.filter((c: any) => {
    const st = (c.filing_status || 'not_submitted').toLowerCase()
    if (['submitted', 'filed', 'approved', 'paid', 'denied'].includes(st)) return false
    const rem = getDaysRemaining(c)
    return rem !== null && rem < 0
  })
  const expiringSoonClaims = petClaims.filter((c: any) => {
    const st = (c.filing_status || 'not_submitted').toLowerCase()
    if (['submitted', 'filed', 'approved', 'paid', 'denied'].includes(st)) return false
    const rem = getDaysRemaining(c)
    return rem !== null && rem >= 1 && rem <= 14
  })

  const hasAlerts = overdueClaims.length > 0 || expiringSoonClaims.length > 0

  // Insurance tier detection
  const isOdieConnected = !!pet.odie_connected
  const isOdieInsurer = pet.insuranceCompany?.toLowerCase().includes('odie')
  const isInsured = !!pet.insuranceCompany && pet.insuranceCompany !== ''
  const insurerName = pet.insuranceCompany || ''

  // Financial summary computations
  const currentYear = new Date().getFullYear()
  // All-time totals (for Financial Summary — claims may span years)
  const totalBilled = petClaims.reduce((s: number, c: any) => s + (Number(c.total_amount) || 0), 0)
  const totalReimbursed = petClaims
    .filter((c: any) => (c.filing_status || '').toLowerCase() === 'paid')
    .reduce((s: number, c: any) => s + (Number(c.reimbursed_amount) || 0), 0)
  const outOfPocket = totalBilled - totalReimbursed

  // YTD totals (for insurance card overview)
  const ytdClaims = petClaims.filter((c: any) => {
    const d = parseLocalDate(c.service_date)
    return d && d.getFullYear() === currentYear
  })
  const ytdBilled = ytdClaims.reduce((s: number, c: any) => s + (Number(c.total_amount) || 0), 0)
  const ytdReimbursed = ytdClaims
    .filter((c: any) => (c.filing_status || '').toLowerCase() === 'paid')
    .reduce((s: number, c: any) => s + (Number(c.reimbursed_amount) || 0), 0)
  const ytdOutOfPocket = ytdBilled - ytdReimbursed

  // Monthly premiums — total since coverage started
  const premiumMonths = (() => {
    if (!pet.monthly_premium || !pet.coverage_start_date) return 0
    const start = parseLocalDate(pet.coverage_start_date)
    if (!start) return 0
    const now = new Date()
    if (start > now) return 0
    const months = (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth()) + 1
    return Math.max(0, months)
  })()
  const premiumsPaidTotal = (pet.monthly_premium || 0) * premiumMonths
  const grandTotal = premiumsPaidTotal + totalBilled - totalReimbursed

  // Insurance badge colors (same as App.tsx)
  const insuranceBadge = useMemo(() => {
    if (!insurerName) return null
    const lower = insurerName.toLowerCase()
    let bg = 'bg-blue-50 dark:bg-blue-950'
    let text = 'text-blue-600 dark:text-blue-300'
    let border = 'border-blue-200 dark:border-blue-800'
    let emoji: React.ReactNode = null

    if (lower.includes('odie')) { bg = 'bg-teal-50 dark:bg-teal-950'; text = 'text-teal-600 dark:text-teal-300'; border = 'border-teal-200 dark:border-teal-800'; emoji = <img src="/odie-logo.png" alt="Odie" className="inline-block w-4 h-4" /> }
    else if (lower.includes('nationwide')) { emoji = <span>🏛️</span>; bg = 'bg-blue-50 dark:bg-blue-950' }
    else if (lower.includes('healthy')) { emoji = <span>🍀</span>; bg = 'bg-green-50 dark:bg-green-950'; text = 'text-green-600 dark:text-green-300'; border = 'border-green-200 dark:border-green-800' }
    else if (lower.includes('trupanion')) { emoji = <span>💜</span>; bg = 'bg-purple-50 dark:bg-purple-950'; text = 'text-purple-600 dark:text-purple-300'; border = 'border-purple-200 dark:border-purple-800' }
    else if (lower.includes('pumpkin')) { emoji = <span>🎃</span>; bg = 'bg-orange-50 dark:bg-orange-950'; text = 'text-orange-600 dark:text-orange-300'; border = 'border-orange-200 dark:border-orange-800' }
    else if (lower.includes('spot')) { emoji = <span>🐾</span> }
    else if (lower.includes('figo')) { emoji = <span>🐕</span>; bg = 'bg-cyan-50 dark:bg-cyan-950'; text = 'text-cyan-600 dark:text-cyan-300'; border = 'border-cyan-200 dark:border-cyan-800' }
    else if (lower.includes('pets best')) { emoji = <span>🐶</span> }

    return { bg, text, border, emoji }
  }, [insurerName])

  // Pet color
  const petColor = pet.color || (pet.species === 'dog' ? '#3B82F6' : pet.species === 'cat' ? '#F97316' : '#6B7280')

  return (
    <div className="font-body min-h-screen bg-gradient-to-b from-slate-50 via-white to-slate-50 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950">
      {/* Sticky back button */}
      <div className="sticky top-0 z-30 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-b border-slate-100 dark:border-slate-800">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center">
          <button
            type="button"
            onClick={onBack}
            className="flex items-center gap-1.5 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 transition-colors -ml-1"
          >
            <ChevronLeft size={20} strokeWidth={2.5} />
            <span className="text-sm font-medium">Back</span>
          </button>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-5 pb-[calc(env(safe-area-inset-bottom,0px)+32px)]">
        {/* ================================================================
            LAYER 1 — PET HEADER
            ================================================================ */}
        <div className="flex flex-col items-center pt-8 pb-6 animate-fade-in-up">
          {/* Pet photo */}
          {pet.photo_url ? (
            <img
              src={pet.photo_url}
              alt={pet.name}
              className="w-24 h-24 rounded-full object-cover ring-4 ring-white dark:ring-slate-900 shadow-xl"
            />
          ) : (
            <div
              className="w-24 h-24 rounded-full flex items-center justify-center ring-4 ring-white dark:ring-slate-900 shadow-xl text-4xl text-white"
              style={{ backgroundColor: petColor }}
            >
              {pet.species === 'dog' ? '🐕' : pet.species === 'cat' ? '🐱' : '🐾'}
            </div>
          )}

          {/* Pet name */}
          <h1 className="font-display text-4xl text-slate-900 dark:text-white mt-4 tracking-tight">
            {pet.name}
          </h1>

          {/* Age + gender */}
          <div className="flex items-center gap-2 mt-1.5">
            {computeAge(pet.date_of_birth) && (
              <span className="text-lg text-slate-700 dark:text-slate-300">{computeAge(pet.date_of_birth)}</span>
            )}
            {pet.gender && computeAge(pet.date_of_birth) && (
              <span className="text-slate-300 dark:text-slate-600">·</span>
            )}
            {pet.gender && (
              <span className="text-lg text-slate-700 dark:text-slate-300">{pet.gender.charAt(0).toUpperCase() + pet.gender.slice(1).toLowerCase()}</span>
            )}
          </div>

          {/* Insurance badge */}
          {insuranceBadge && (
            <div className="mt-3">
              <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium border ${insuranceBadge.bg} ${insuranceBadge.text} ${insuranceBadge.border}`}>
                {insuranceBadge.emoji}
                {insurerName}
              </span>
            </div>
          )}
        </div>

        {/* ================================================================
            LAYER 2 — NEEDS ATTENTION (conditional)
            ================================================================ */}
        {hasAlerts && (
          <div className="space-y-3 mb-6 animate-fade-in-up" style={{ animationDelay: '50ms' }}>
            {overdueClaims.length > 0 && (
              <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200/60 dark:border-red-800/40">
                <div className="flex-shrink-0 w-9 h-9 rounded-full bg-red-100 dark:bg-red-900/60 flex items-center justify-center">
                  <AlertTriangle size={16} className="text-red-600 dark:text-red-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-base font-semibold text-red-800 dark:text-red-200">
                    {overdueClaims.length} Overdue Claim{overdueClaims.length > 1 ? 's' : ''}
                  </div>
                  <div className="text-base text-red-600 dark:text-red-400">Past filing deadline</div>
                </div>
              </div>
            )}
            {expiringSoonClaims.length > 0 && (
              <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200/60 dark:border-amber-800/40">
                <div className="flex-shrink-0 w-9 h-9 rounded-full bg-amber-100 dark:bg-amber-900/60 flex items-center justify-center">
                  <Clock size={16} className="text-amber-600 dark:text-amber-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-base font-semibold text-amber-800 dark:text-amber-200">
                    {expiringSoonClaims.length} Claim{expiringSoonClaims.length > 1 ? 's' : ''} Expiring Soon
                  </div>
                  <div className="text-base text-amber-600 dark:text-amber-400">Due within 14 days</div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ================================================================
            LAYER 3 — INSURANCE OVERVIEW (Hero card with gradient banner)
            ================================================================ */}
        {(() => {
          // Tier A: Odie API-connected — gradient hero card
          if (isOdieConnected && odiePolicy) {
            const deductibleUsed = odiePolicy.deductibleAmount - odiePolicy.deductibleBalance
            const annualUsed = odiePolicy.standardAnnualLimit - odiePolicy.annualLimitBalance
            return (
              <div className="mb-6 animate-fade-in-up" style={{ animationDelay: '100ms' }}>
                <div className="rounded-3xl overflow-hidden shadow-2xl shadow-emerald-600/20 dark:shadow-none">
                  {/* Gradient banner header */}
                  <div className="relative bg-gradient-to-br from-emerald-500 via-emerald-600 to-teal-600 px-6 py-5">
                    {/* Decorative circles */}
                    <div className="absolute top-0 right-0 w-32 h-32 rounded-full bg-white/10 -translate-y-1/2 translate-x-1/4" />
                    <div className="absolute bottom-0 left-0 w-20 h-20 rounded-full bg-white/5 translate-y-1/3 -translate-x-1/4" />
                    <div className="relative flex items-center gap-3">
                      <img src="/odie-logo.png" alt="Odie" className="w-10 h-10 rounded-xl bg-white/20 p-1" />
                      <div>
                        <div className="font-bold text-white text-xl">Odie Pet Insurance</div>
                        <div className="text-emerald-100 font-mono text-base">{pet.odie_policy_number}</div>
                      </div>
                    </div>
                  </div>

                  {/* Card body */}
                  <div className="bg-white dark:bg-slate-900 p-6">
                    {/* Progress bars */}
                    <div className="space-y-5">
                      <ProgressBar label="Deductible" used={deductibleUsed} total={odiePolicy.deductibleAmount} color="emerald" />
                      <ProgressBar label="Annual Limit" used={annualUsed} total={odiePolicy.standardAnnualLimit} color="teal" />
                    </div>

                    {/* YTD grid */}
                    <div className="grid grid-cols-3 gap-3 mt-6 pt-6 border-t border-slate-100 dark:border-slate-800">
                      <div className="text-center p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50">
                        <div className="text-2xl font-bold text-slate-800 dark:text-slate-100">{fmtMoney(ytdBilled)}</div>
                        <div className="text-base text-slate-500 dark:text-slate-400 mt-0.5">YTD Claimed</div>
                      </div>
                      <div className="text-center p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/30">
                        <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{fmtMoney(ytdReimbursed)}</div>
                        <div className="text-base text-emerald-600/70 dark:text-emerald-400/70 mt-0.5">Reimbursed</div>
                      </div>
                      <div className="text-center p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50">
                        <div className="text-2xl font-bold text-slate-800 dark:text-slate-100">{fmtMoney(ytdOutOfPocket)}</div>
                        <div className="text-base text-slate-500 dark:text-slate-400 mt-0.5">Out of Pocket</div>
                      </div>
                    </div>

                    {/* Monthly premium */}
                    {odiePolicy.monthlyPremium && (
                      <div className="flex items-center justify-between mt-5 pt-5 border-t border-slate-100 dark:border-slate-800">
                        <span className="text-lg text-slate-700 dark:text-slate-400">Monthly Premium</span>
                        <span className="text-lg font-semibold text-slate-900 dark:text-slate-200">{fmtMoney(odiePolicy.monthlyPremium)}/mo</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )
          }

          // Odie insurer but not yet connected → show connect prompt
          if (isOdieInsurer && !isOdieConnected) {
            return (
              <div className="mb-6 animate-fade-in-up" style={{ animationDelay: '100ms' }}>
                <div className="rounded-3xl overflow-hidden shadow-xl shadow-slate-200/50 dark:shadow-none">
                  <div className="relative bg-gradient-to-br from-emerald-500 via-emerald-600 to-teal-600 px-6 py-4">
                    <div className="absolute top-0 right-0 w-24 h-24 rounded-full bg-white/10 -translate-y-1/2 translate-x-1/4" />
                    <div className="relative flex items-center gap-3">
                      <img src="/odie-logo.png" alt="Odie" className="w-8 h-8" />
                      <div className="font-bold text-white text-xl">Odie Pet Insurance</div>
                    </div>
                  </div>
                  <div className="bg-white dark:bg-slate-900 p-6">
                    <p className="text-base text-slate-500 dark:text-slate-400 mb-4">
                      Connect your Odie policy to see live deductible progress, coverage limits, and claim status.
                    </p>
                    <OdieConnectButton pet={pet} onConnect={onRefreshPets} />
                  </div>
                </div>
              </div>
            )
          }

          // Tier B: Non-API insurer — smaller gradient header
          if (isInsured) {
            return (
              <div className="mb-6 animate-fade-in-up" style={{ animationDelay: '100ms' }}>
                <div className="rounded-3xl overflow-hidden shadow-xl shadow-slate-200/50 dark:shadow-none">
                  {/* Gradient header */}
                  <div className="relative bg-gradient-to-br from-blue-500 via-blue-600 to-indigo-600 px-6 py-4">
                    <div className="absolute top-0 right-0 w-24 h-24 rounded-full bg-white/10 -translate-y-1/2 translate-x-1/4" />
                    <div className="relative flex items-center gap-3">
                      {insuranceBadge?.emoji && <span className="text-2xl">{insuranceBadge.emoji}</span>}
                      <div>
                        <div className="font-bold text-white text-xl">{insurerName}</div>
                        {pet.policyNumber && (
                          <div className="text-blue-100 font-mono text-base">{pet.policyNumber}</div>
                        )}
                      </div>
                    </div>
                  </div>
                  {/* Card body */}
                  <div className="bg-white dark:bg-slate-900 p-6">
                    <div className="grid grid-cols-3 gap-3">
                      <div className="text-center p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50">
                        <div className="text-2xl font-bold text-slate-800 dark:text-slate-100">{fmtMoney(ytdBilled)}</div>
                        <div className="text-base text-slate-500 dark:text-slate-400 mt-0.5">YTD Billed</div>
                      </div>
                      <div className="text-center p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/30">
                        <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{fmtMoney(ytdReimbursed)}</div>
                        <div className="text-base text-emerald-600/70 dark:text-emerald-400/70 mt-0.5">Reimbursed</div>
                      </div>
                      <div className="text-center p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50">
                        <div className="text-2xl font-bold text-slate-800 dark:text-slate-100">{fmtMoney(ytdOutOfPocket)}</div>
                        <div className="text-base text-slate-500 dark:text-slate-400 mt-0.5">Out of Pocket</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )
          }

          // Tier C: Uninsured — subtle gradient card
          if (totalBilled > 0) {
            return (
              <div className="mb-6 animate-fade-in-up" style={{ animationDelay: '100ms' }}>
                <div className="relative rounded-3xl overflow-hidden shadow-xl shadow-slate-200/50 dark:shadow-none bg-gradient-to-br from-slate-50 via-white to-slate-100 dark:from-slate-900 dark:via-slate-900 dark:to-slate-800 border border-slate-200/60 dark:border-slate-700 p-8 text-center">
                  <div className="absolute top-0 right-0 w-32 h-32 rounded-full bg-slate-200/30 dark:bg-slate-700/20 -translate-y-1/2 translate-x-1/4" />
                  <div className="relative">
                    <div className="text-base font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">Vet Expenses This Year</div>
                    <div className="text-4xl font-bold text-slate-800 dark:text-slate-100">{fmtMoney(totalBilled)}</div>
                  </div>
                </div>
              </div>
            )
          }

          return null
        })()}

        {/* ================================================================
            LAYER 4 — ACCORDION SECTIONS
            ================================================================ */}
        <div className="space-y-4 pb-8">

          {/* Section 1: Recent Claims — only shown for insured pets */}
          {isInsured && <AccordionSection
            title="Recent Claims"
            icon={<FileText size={18} />}
            defaultOpen={true}
            count={petClaims.length}
            delay={150}
          >
            {/* Upload Vet Bill button */}
            <button
              type="button"
              onClick={() => onUploadForPet(pet.id)}
              className="w-full mb-4 flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white font-semibold shadow-lg shadow-emerald-500/25 hover:shadow-emerald-500/40 transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
            >
              <Upload size={18} />
              Upload Vet Bill
            </button>

            {petClaims.length === 0 ? (
              <div className="text-center py-6">
                <div className="text-slate-500 dark:text-slate-500 text-base">No claims yet</div>
              </div>
            ) : (
              <div className="space-y-2">
                {(showAllClaims ? petClaims : petClaims.slice(0, 5)).map((c: any) => {
                  const badge = statusBadge(c.filing_status)
                  const svcDate = parseLocalDate(c.service_date)
                  const isExpanded = expandedClaimId === c.id
                  const lineItems = Array.isArray(c.line_items) ? c.line_items : []

                  return (
                    <div key={c.id} className="group relative">
                      <button
                        type="button"
                        onClick={() => setExpandedClaimId(isExpanded ? null : c.id)}
                        className={`w-full flex items-center gap-3 py-3 px-4 pr-12 rounded-xl border-l-4 ${badge.borderColor} bg-slate-50/50 dark:bg-slate-800/30 hover:bg-slate-100/80 dark:hover:bg-slate-800/60 transition-all duration-200 text-left hover:-translate-y-0.5 hover:shadow-md`}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-lg font-medium text-slate-900 dark:text-slate-100 truncate">
                              {c.visit_title || c.diagnosis || 'Vet Visit'}
                            </span>
                            <span className={`flex-shrink-0 inline-flex px-2 py-0.5 rounded-full text-[11px] font-medium border ${badge.cls}`}>
                              {badge.text}
                            </span>
                          </div>
                          <div className="text-base text-slate-600 dark:text-slate-400 mt-0.5">
                            {svcDate ? svcDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
                          </div>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <div className="text-lg font-bold text-slate-900 dark:text-slate-100">
                            {c.total_amount ? fmtMoney(Number(c.total_amount)) : '—'}
                          </div>
                          {Number(c.reimbursed_amount || 0) > 0 && (
                            <div className="text-base text-emerald-600 dark:text-emerald-400">
                              +{fmtMoney(Number(c.reimbursed_amount))} reimbursed
                            </div>
                          )}
                        </div>
                      </button>
                      {/* Edit button */}
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setEditingClaim(c) }}
                        className="absolute top-3 right-3 p-2 rounded-lg bg-white/80 dark:bg-slate-800/80 hover:bg-white dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 shadow-sm text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 transition-all duration-200 opacity-0 group-hover:opacity-100"
                        title="Edit claim"
                      >
                        <Pencil size={14} />
                      </button>
                      {/* Expanded line items */}
                      {isExpanded && lineItems.length > 0 && (
                        <div className="ml-6 pl-4 mb-2 border-l-2 border-slate-200 dark:border-slate-700">
                          {lineItems.map((item: any, idx: number) => (
                            <div key={idx} className="flex items-center justify-between py-2 hover:bg-slate-50 dark:hover:bg-slate-800/30 rounded-lg px-2 transition-colors">
                              <span className="text-base text-slate-600 dark:text-slate-400 truncate pr-2">{item.description || 'Item'}</span>
                              <span className="text-base font-medium text-slate-700 dark:text-slate-300 flex-shrink-0">${item.amount || '0.00'}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}
                {petClaims.length > 5 && !showAllClaims && (
                  <button
                    type="button"
                    onClick={() => setShowAllClaims(true)}
                    className="text-base font-medium text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300 transition-colors pt-2"
                  >
                    View all {petClaims.length} claims →
                  </button>
                )}
              </div>
            )}
          </AccordionSection>}

          {/* Section 2: Vet Visits — with VET pill badges and tinted cards */}
          <AccordionSection
            title="Vet Visits"
            icon={<Stethoscope size={18} />}
            count={petClaims.length}
            delay={200}
          >
            {petClaims.length === 0 ? (
              <div className="text-center py-6">
                <div className="text-slate-500 dark:text-slate-500 text-base">No vet visits recorded</div>
              </div>
            ) : (
              <div className="space-y-3">
                {petClaims.slice(0, 10).map((c: any) => {
                  const svcDate = parseLocalDate(c.service_date)
                  return (
                    <div
                      key={c.id}
                      className="p-4 rounded-xl bg-gradient-to-r from-rose-50/60 via-white to-white dark:from-rose-950/20 dark:via-slate-800/40 dark:to-slate-800/40 border border-slate-100 dark:border-slate-800 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            {c.clinic_name && (
                              <span className="text-base font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
                                {c.clinic_name}
                              </span>
                            )}
                            <span className="inline-flex px-2 py-0.5 rounded-md bg-rose-100 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400 text-xs font-bold">VET</span>
                          </div>
                          <div className="text-lg font-medium text-slate-900 dark:text-slate-100">
                            {c.visit_title || c.diagnosis || 'Vet Visit'}
                          </div>
                          <div className="text-base text-slate-600 dark:text-slate-400 mt-1">
                            {svcDate ? svcDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
                          </div>
                        </div>
                        <div className="text-lg font-bold text-slate-900 dark:text-slate-100 flex-shrink-0">
                          {c.total_amount ? fmtMoney(Number(c.total_amount)) : '—'}
                        </div>
                      </div>
                      {c.visit_notes && (
                        <p className="text-base text-slate-500 dark:text-slate-400 mt-2 line-clamp-2">{c.visit_notes}</p>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </AccordionSection>

          {/* Section 3: Financial Summary — gradient banner + large total */}
          <AccordionSection
            title="Financial Summary"
            icon={<TrendingUp size={18} />}
            delay={300}
          >
            {/* Gradient hero banner for total */}
            <div className="relative rounded-2xl overflow-hidden bg-gradient-to-br from-slate-700 via-slate-800 to-slate-900 dark:from-slate-700 dark:via-slate-800 dark:to-slate-900 px-6 py-6 mb-5 shadow-lg">
              <div className="absolute top-0 right-0 w-28 h-28 rounded-full bg-white/5 -translate-y-1/2 translate-x-1/4" />
              <div className="absolute bottom-0 left-0 w-16 h-16 rounded-full bg-white/5 translate-y-1/3 -translate-x-1/4" />
              <div className="relative text-center">
                <div className="text-base font-medium text-slate-300 uppercase tracking-wider mb-1">Net Out-of-Pocket</div>
                <div className="text-4xl sm:text-5xl font-bold text-white">
                  {fmtMoney(grandTotal)}
                </div>
                <div className="text-sm text-slate-400 mt-1">Total cost of ownership</div>
              </div>
            </div>

            {/* Itemized breakdown */}
            <div className="space-y-1">
              {premiumsPaidTotal > 0 && (
                <div className="flex items-center justify-between py-3 px-3 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="w-2.5 h-2.5 rounded-full bg-blue-500 flex-shrink-0" />
                    <span className="text-lg text-slate-700 dark:text-slate-300">Insurance Premiums</span>
                  </div>
                  <span className="text-lg font-semibold text-slate-900 dark:text-slate-100">{fmtMoney(premiumsPaidTotal)}</span>
                </div>
              )}
              <div className="flex items-center justify-between py-3 px-3 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                <div className="flex items-center gap-3">
                  <div className="w-2.5 h-2.5 rounded-full bg-rose-500 flex-shrink-0" />
                  <span className="text-lg text-slate-700 dark:text-slate-300">Total Vet Bills</span>
                </div>
                <span className="text-lg font-semibold text-slate-900 dark:text-slate-100">{fmtMoney(totalBilled)}</span>
              </div>
              {totalReimbursed > 0 && (
                <div className="flex items-center justify-between py-3 px-3 rounded-xl bg-emerald-50/50 dark:bg-emerald-950/20 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 flex-shrink-0" />
                    <span className="text-lg text-emerald-700 dark:text-emerald-300">Reimbursements Received</span>
                  </div>
                  <span className="text-lg font-semibold text-emerald-600 dark:text-emerald-400">−{fmtMoney(totalReimbursed)}</span>
                </div>
              )}
            </div>
          </AccordionSection>

          {/* Section 5: Policy Details (insured pets only) — alternating rows */}
          {isInsured && (
            <AccordionSection
              title="Policy Details"
              icon={<Shield size={18} />}
              delay={350}
            >
              <div className="space-y-0.5">
                <DetailRow label="Insurance Company" value={insurerName} index={0} />
                {pet.policyNumber && <DetailRow label="Policy Number" value={pet.policyNumber} mono index={1} />}
                {pet.deductible_per_claim != null && (
                  <DetailRow label="Deductible (per claim)" value={fmtMoney(pet.deductible_per_claim)} index={2} />
                )}
                {pet.insurance_pays_percentage != null && (
                  <DetailRow label="Coinsurance" value={`Insurer pays ${Math.round(pet.insurance_pays_percentage * 100)}%`} index={3} />
                )}
                {pet.annual_coverage_limit != null && (
                  <DetailRow label="Annual Coverage Limit" value={fmtMoney(pet.annual_coverage_limit)} index={4} />
                )}
                {pet.coverage_start_date && (
                  <DetailRow
                    label="Coverage Start Date"
                    value={parseLocalDate(pet.coverage_start_date)?.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) || pet.coverage_start_date}
                    index={5}
                  />
                )}
                {pet.monthly_premium != null && (
                  <DetailRow label="Monthly Premium" value={`${fmtMoney(pet.monthly_premium)}/mo`} index={6} />
                )}
                {/* Odie-specific extra fields */}
                {isOdieConnected && odiePolicy && (
                  <>
                    {odiePolicy.accidentEffectiveDate && (
                      <DetailRow
                        label="Accident Coverage Effective"
                        value={new Date(odiePolicy.accidentEffectiveDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                        index={7}
                      />
                    )}
                    {odiePolicy.illnessEffectiveDate && (
                      <DetailRow
                        label="Illness Coverage Effective"
                        value={new Date(odiePolicy.illnessEffectiveDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                        index={8}
                      />
                    )}
                    <DetailRow label="Office Visits Covered" value={odiePolicy.office_visits ? 'Yes' : 'No'} index={9} />
                  </>
                )}
              </div>
            </AccordionSection>
          )}

          {/* Section 6: Medications */}
          <AccordionSection
            title="Medications"
            icon={<Pill size={18} />}
            count={medications.length}
            delay={400}
          >
            {medications.length === 0 ? (
              <div className="text-center py-6">
                <div className="text-slate-500 dark:text-slate-500 text-base">No active medications</div>
              </div>
            ) : (
              <div className="space-y-3">
                {medications.map((med) => (
                  <div
                    key={med.id}
                    className="p-4 rounded-xl bg-gradient-to-r from-violet-50/50 via-white to-white dark:from-violet-950/20 dark:via-slate-800/40 dark:to-slate-800/40 border border-slate-100 dark:border-slate-800 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200"
                  >
                    <div className="flex items-center gap-2">
                      <div className="text-lg font-medium text-slate-900 dark:text-slate-100">{med.medication_name}</div>
                      <span className="inline-flex px-2 py-0.5 rounded-md bg-violet-100 dark:bg-violet-900/30 text-violet-600 dark:text-violet-400 text-xs font-bold">Rx</span>
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      {med.dosage && (
                        <span className="text-base text-slate-600 dark:text-slate-400">{med.dosage}</span>
                      )}
                      {med.dosage && <span className="text-slate-300 dark:text-slate-600">·</span>}
                      <span className="text-base text-slate-600 dark:text-slate-400">{med.frequency}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </AccordionSection>

        </div>
      </div>

      {/* Edit Claim Modal */}
      {editingClaim && (
        <EditClaimModal
          claim={editingClaim}
          onClose={() => setEditingClaim(null)}
          onSave={async () => {
            await onRefreshClaims()
            setEditingClaim(null)
          }}
        />
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Detail row helper — with alternating backgrounds
// ---------------------------------------------------------------------------

function DetailRow({ label, value, mono = false, index = 0 }: { label: string; value: string; mono?: boolean; index?: number }) {
  return (
    <div className={`flex items-center justify-between py-3 px-3 rounded-lg ${index % 2 === 0 ? 'bg-slate-50/70 dark:bg-slate-800/30' : ''}`}>
      <span className="text-lg text-slate-600 dark:text-slate-400">{label}</span>
      <span className={`font-medium text-slate-900 dark:text-slate-200 ${mono ? 'font-mono text-sm' : 'text-lg'}`}>{value}</span>
    </div>
  )
}
