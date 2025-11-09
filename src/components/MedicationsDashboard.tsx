import React, { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { convertUTCToLocal } from '../utils/timezoneUtils'
import type { PetProfile } from '../types'
import AddMedicationForm from './AddMedicationForm'
import DoseTrackingPage from './DoseTrackingPage'

type MedicationRow = {
  id: string
  user_id: string
  pet_id: string
  claim_id: string | null
  medication_name: string
  dosage: string | null
  frequency: '1x daily' | '2x daily' | '3x daily'
  reminder_times: string[]
  start_date: string
  end_date: string | null
  created_at?: string
  updated_at?: string
}

type DoseRow = {
  id: string
  medication_id: string
  user_id: string
  scheduled_time: string
  given_time: string | null
  status: 'pending' | 'given'
}

export default function MedicationsDashboard({ userId, pets }: { userId: string | null; pets: PetProfile[] }) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [medications, setMedications] = useState<MedicationRow[]>([])
  const [dosesGivenByMed, setDosesGivenByMed] = useState<Record<string, number>>({})
  const [showAdd, setShowAdd] = useState(false)
  const [expandedPets, setExpandedPets] = useState<Record<string, boolean>>({})
  const [selectedMedicationId, setSelectedMedicationId] = useState<string | null>(null)
  const [userTimezone, setUserTimezone] = useState<string>(Intl.DateTimeFormat().resolvedOptions().timeZone)

  const petMap = useMemo(() => {
    const m: Record<string, PetProfile> = {}
    for (const p of pets) m[p.id] = p
    return m
  }, [pets])

  const refresh = async () => {
    if (!userId) return
    setLoading(true)
    setError(null)
    try {
      // Load user timezone
      try {
        const { data } = await supabase.from('profiles').select('timezone').eq('id', userId).single()
        const tz = (data && (data as any).timezone) ? String((data as any).timezone) : ''
        if (tz) setUserTimezone(tz)
      } catch {}
      const { data: meds, error: medsErr } = await supabase
        .from('medications')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
      if (medsErr) throw medsErr
      const normalized: MedicationRow[] = (meds || []).map((m: any) => ({
        ...m,
        reminder_times: Array.isArray(m.reminder_times) ? m.reminder_times : [],
      }))
      setMedications(normalized)

      const ids = normalized.map(m => m.id)
      if (ids.length > 0) {
        const { data: doseRows, error: doseErr } = await supabase
          .from('medication_doses')
          .select('id, medication_id, user_id, scheduled_time, given_time, status')
          .in('medication_id', ids)
          .eq('user_id', userId)
          .eq('status', 'given')
        if (doseErr) throw doseErr
        const byMed: Record<string, number> = {}
        for (const d of (doseRows || []) as DoseRow[]) {
          byMed[d.medication_id] = (byMed[d.medication_id] || 0) + 1
        }
        setDosesGivenByMed(byMed)
      } else {
        setDosesGivenByMed({})
      }
    } catch (e: any) {
      setError(e?.message || 'Failed to load medications')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId])

  // Always show all medications; no expand/collapse needed

  const grouped = useMemo(() => {
    const g: Record<string, MedicationRow[]> = {}
    for (const m of medications) {
      if (!g[m.pet_id]) g[m.pet_id] = []
      g[m.pet_id].push(m)
    }
    return g
  }, [medications])

  const timesPerDay = (m: MedicationRow) => (Array.isArray(m.reminder_times) && m.reminder_times.length > 0)
    ? m.reminder_times.length
    : (m.frequency === '1x daily' ? 1 : m.frequency === '2x daily' ? 2 : 3)

  const formatClock = (hhmm: string) => {
    const [hStr, mStr] = hhmm.split(':')
    let h = Number(hStr)
    const ampm = h >= 12 ? 'PM' : 'AM'
    h = h % 12
    if (h === 0) h = 12
    return `${h}:${mStr} ${ampm}`
  }

  const formatRelativeNext = (dt: Date, today: Date) => {
    const dDate = new Date(dt.getFullYear(), dt.getMonth(), dt.getDate())
    const tDate = new Date(today.getFullYear(), today.getMonth(), today.getDate())
    const diffDays = Math.round((dDate.getTime() - tDate.getTime()) / (1000 * 60 * 60 * 24))
    const label = diffDays === 0 ? 'Today' : diffDays === 1 ? 'Tomorrow' : dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    const time = dt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
    return `${label} ${time}`
  }

  const computeStats = (m: MedicationRow) => {
    const start = new Date(m.start_date)
    const end = m.end_date ? new Date(m.end_date) : null
    const today = new Date()
    const startDay = new Date(start.getFullYear(), start.getMonth(), start.getDate())
    const endDay = end ? new Date(end.getFullYear(), end.getMonth(), end.getDate()) : null
    const todayDay = new Date(today.getFullYear(), today.getMonth(), today.getDate())

    const totalDays = endDay ? Math.max(1, Math.round((endDay.getTime() - startDay.getTime()) / (1000 * 60 * 60 * 24)) + 1) : 1
    const tpd = timesPerDay(m)
    const totalDoses = totalDays * tpd
    const given = dosesGivenByMed[m.id] || 0
    const pct = totalDoses > 0 ? Math.round((given / totalDoses) * 100) : 0

    const daysRemaining = endDay ? Math.max(0, Math.round((endDay.getTime() - todayDay.getTime()) / (1000 * 60 * 60 * 24)) + 1) : 0

    // Next dose (compute from schedule rather than doses, in case doses aren't pre-generated)
    // Convert stored UTC schedule to local schedule for display and next-dose calc
    const schedule = (m.reminder_times && m.reminder_times.length > 0)
      ? m.reminder_times.map((t) => convertUTCToLocal(t, userTimezone)).filter(Boolean)
      : (m.frequency === '1x daily' ? ['07:00'] : m.frequency === '2x daily' ? ['07:00', '19:00'] : ['08:00', '14:00', '20:00'])
    let next: Date | null = null
    const cursor = new Date(today)
    // Search up to 7 days ahead to find the next scheduled time within the course
    for (let i = 0; i < 7; i++) {
      const curDate = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate())
      if (curDate < startDay) { cursor.setDate(cursor.getDate() + 1); continue }
      if (endDay && curDate > endDay) break
      for (const t of schedule) {
        const [hh, mm] = t.split(':').map(n => Number(n))
        const candidate = new Date(curDate.getFullYear(), curDate.getMonth(), curDate.getDate(), hh, mm, 0)
        if (candidate.getTime() > today.getTime()) { next = candidate; break }
      }
      if (next) break
      cursor.setDate(cursor.getDate() + 1)
    }

    return {
      totalDoses,
      given,
      pct,
      daysRemaining,
      nextDoseLabel: next ? formatRelativeNext(next, today) : (endDay && todayDay > endDay ? 'Completed' : '—'),
      endLabel: endDay ? endDay.toISOString().slice(0, 10) : '—'
    }
  }

  return (
    <section className="mt-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Medications</h2>
        <button
          type="button"
          onClick={() => setShowAdd(true)}
          className="inline-flex items-center rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 text-sm"
          disabled={!userId}
        >
          + ADD MEDICATION
        </button>
      </div>

      {loading && (
        <div className="mt-4 text-sm text-slate-500">Loading medications…</div>
      )}
      {error && (
        <div className="mt-4 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-rose-800 text-sm">{error}</div>
      )}

      {!loading && medications.length === 0 && (
        <div className="mt-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 text-sm text-slate-600">
          No medications yet. Click "+ ADD MEDICATION" to create one.
        </div>
      )}

      <div className="mt-4 space-y-6">
        {Object.entries(grouped).map(([petId, meds]) => {
          const pet = petMap[petId]
          return (
            <div key={petId}>
              <button
                type="button"
                onClick={() => setExpandedPets((prev) => ({ ...prev, [petId]: !prev[petId] }))}
                className="group w-full text-left text-base font-semibold mb-2 flex items-center justify-between gap-2 h-12 px-4 rounded-lg cursor-pointer hover:bg-blue-50 dark:hover:bg-slate-800 hover:shadow-sm transition transform hover:scale-[1.01]"
                title="Click to toggle medications"
              >
                <div className="flex items-center gap-3">
                  <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: pet?.color || (pet?.species === 'dog' ? '#3B82F6' : pet?.species === 'cat' ? '#F97316' : '#6B7280') }} />
                  <span className="font-semibold">{pet ? `${pet.name} (${pet.species})` : 'Unknown Pet'}</span>
                </div>
                <div className="flex items-center gap-2 text-slate-600">
                  <svg className={[ 'h-4 w-4 transition-transform duration-150', expandedPets[petId] ? 'rotate-90' : '' ].join(' ')} viewBox="0 0 20 20" fill="currentColor" aria-hidden>
                    <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 0 1-.02-1.06L10.17 10 7.2 6.3a.75.75 0 1 1 1.1-1.02l3.5 3.75c.27.29.27.74 0 1.03l-3.5 3.75a.75.75 0 0 1-1.09.01Z" clipRule="evenodd" />
                  </svg>
                  <span className="text-sm text-slate-600 font-medium">{expandedPets[petId] ? 'Hide medications' : 'Show medications'}</span>
                </div>
              </button>
              {expandedPets[petId] !== false && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {meds.map(m => {
                  const stats = computeStats(m)
                  return (
                    <div
                      key={m.id}
                      className="relative rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-sm cursor-pointer hover:shadow-md"
                      onClick={() => setSelectedMedicationId(m.id)}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="text-lg font-semibold">{m.medication_name}</div>
                      </div>
                      <button
                        type="button"
                        className="absolute top-2 right-2 text-xs text-red-600 hover:text-red-700 cursor-pointer"
                        onClick={async (e) => {
                          e.stopPropagation()
                          if (!confirm(`Are you sure you want to delete ${m.medication_name}?`)) return
                          try {
                            // Prefer API route if available
                            let ok = false
                            try {
                              const resp = await fetch(`/api/medications/${m.id}`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' } })
                              ok = resp.ok
                            } catch {}
                            if (!ok) {
                              // Fallback to direct Supabase delete
                              const { error: delErr } = await supabase.from('medications').delete().eq('id', m.id).eq('user_id', userId)
                              if (delErr) throw delErr
                            }
                            setMedications(prev => prev.filter(x => x.id !== m.id))
                            try { alert('Medication deleted successfully') } catch {}
                          } catch (err) {
                            console.error('[medications] delete error', err)
                            try { alert('Failed to delete medication') } catch {}
                          }
                        }}
                        title="Delete medication"
                        aria-label="Delete medication"
                      >
                        Delete
                      </button>
                      {m.dosage && <div className="text-sm text-slate-600 mt-0.5">{m.dosage}</div>}
                      <div className="mt-3 space-y-1.5 text-sm">
                        <div><span className="text-slate-500">Progress:</span> {`${stats.given}/${stats.totalDoses} doses (${stats.pct}%)`}</div>
                        <div><span className="text-slate-500">Next dose:</span> {stats.nextDoseLabel}</div>
                        <div><span className="text-slate-500">Days remaining:</span> {stats.daysRemaining}</div>
                        <div><span className="text-slate-500">End date:</span> {stats.endLabel}</div>
                      </div>
                    </div>
                  )
                })}
              </div>
              )}
            </div>
          )
        })}
      </div>

      <AddMedicationForm
        open={showAdd}
        onClose={() => setShowAdd(false)}
        onSaved={() => { setShowAdd(false); refresh() }}
        userId={userId}
        pets={pets}
      />
      {selectedMedicationId && (
        <DoseTrackingPage
          medicationId={selectedMedicationId}
          userId={userId}
          onClose={() => setSelectedMedicationId(null)}
          onDoseRecorded={() => refresh()}
        />
      )}
    </section>
  )
}


