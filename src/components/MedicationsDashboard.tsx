import React, { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
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

export default function MedicationsDashboard({ userId, pets, refreshKey }: { userId: string | null; pets: PetProfile[]; refreshKey?: number }) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [medications, setMedications] = useState<MedicationRow[]>([])
  const [dosesGivenByMed, setDosesGivenByMed] = useState<Record<string, number>>({})
  const [showAdd, setShowAdd] = useState(false)
  const [editMedicationId, setEditMedicationId] = useState<string | null>(null)
  const [selectedMedicationId, setSelectedMedicationId] = useState<string | null>(null)
  const [showCompleted, setShowCompleted] = useState(false)
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
  }, [userId, refreshKey])

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

    // CRITICAL FIX: If the time is in the past today, treat it as tomorrow
    // This prevents showing "Today 11:01 PM" when it's already 11:21 PM
    let label: string
    if (diffDays === 0) {
      // Same day - but check if time has passed
      if (dt.getTime() <= today.getTime()) {
        // Time is in the past, this shouldn't happen but handle it gracefully
        label = 'Tomorrow'
      } else {
        label = 'Today'
      }
    } else if (diffDays === 1) {
      label = 'Tomorrow'
    } else {
      label = dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    }

    // Format time in local timezone with explicit 12-hour format
    const time = dt.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    })
    return `${label} ${time}`
  }

  const computeStats = (m: MedicationRow) => {
    const start = new Date(m.start_date)
    const end = m.end_date ? new Date(m.end_date) : null
    const today = new Date()
    const startDay = new Date(start.getFullYear(), start.getMonth(), start.getDate())
    const endDay = end ? new Date(end.getFullYear(), end.getMonth(), end.getDate()) : null
    const todayDay = new Date(today.getFullYear(), today.getMonth(), today.getDate())

    // CRITICAL FIX: Use date-only comparison to avoid off-by-one errors from timestamps
    const totalDays = endDay ? Math.max(1, Math.round((endDay.getTime() - startDay.getTime()) / 86400000) + 1) : 1
    const tpd = timesPerDay(m)
    const totalDoses = totalDays * tpd
    const given = dosesGivenByMed[m.id] || 0
    const pct = totalDoses > 0 ? Math.min(Math.round((given / totalDoses) * 100), 100) : 0

    const daysRemaining = endDay ? Math.max(0, Math.round((endDay.getTime() - todayDay.getTime()) / (1000 * 60 * 60 * 24)) + 1) : 0

    // Next dose (compute from schedule rather than doses, in case doses aren't pre-generated)
    // Times are now stored in PST format (HH:mm), no conversion needed
    const schedule = (m.reminder_times && m.reminder_times.length > 0)
      ? m.reminder_times.filter(Boolean)
      : (m.frequency === '1x daily' ? ['07:00'] : m.frequency === '2x daily' ? ['07:00', '19:00'] : ['08:00', '14:00', '20:00'])
    let next: Date | null = null

    // Create a fresh reference time for comparison
    const now = new Date()

    // Start searching from today
    let searchDate = new Date(now.getFullYear(), now.getMonth(), now.getDate())

    // Search up to 7 days ahead to find the next scheduled time within the course
    for (let i = 0; i < 7; i++) {
      if (searchDate < startDay) {
        searchDate.setDate(searchDate.getDate() + 1)
        continue
      }
      if (endDay && searchDate > endDay) break

      for (const t of schedule) {
        const [hh, mm] = t.split(':').map(n => Number(n))
        const candidate = new Date(searchDate.getFullYear(), searchDate.getMonth(), searchDate.getDate(), hh, mm, 0)

        // CRITICAL FIX: Ensure candidate is strictly in the future
        if (candidate.getTime() > now.getTime()) {
          next = candidate
          break
        }
      }

      if (next) break
      searchDate.setDate(searchDate.getDate() + 1)
    }

    return {
      totalDoses,
      given,
      pct,
      daysRemaining,
      nextDoseLabel: next ? formatRelativeNext(next, now) : (endDay && todayDay > endDay ? 'Completed' : '—'),
      endLabel: endDay ? endDay.toISOString().slice(0, 10) : '—'
    }
  }

  // Split medications into active and completed
  const { active, completed } = useMemo(() => {
    const today = new Date()
    const todayDay = new Date(today.getFullYear(), today.getMonth(), today.getDate())

    const activeList: MedicationRow[] = []
    const completedList: MedicationRow[] = []

    for (const m of medications) {
      // Parse dates as local date, not UTC (to avoid timezone shift bugs)
      const [startYear, startMonth, startDay] = m.start_date.split('-').map(Number)
      const startDate = new Date(startYear, startMonth - 1, startDay)

      const endDate = m.end_date
        ? (() => {
            const [endYear, endMonth, endDay] = m.end_date.split('-').map(Number)
            return new Date(endYear, endMonth - 1, endDay)
          })()
        : null

      const stats = computeStats(m)

      // Medication is completed if all doses are given OR end date has passed
      const isCompleted = stats.given >= stats.totalDoses || (endDate && todayDay > endDate)

      // Medication is active if it has started AND (not completed)
      const isActive = todayDay >= startDate && !isCompleted

      if (isCompleted) {
        completedList.push(m)
      } else if (isActive) {
        activeList.push(m)
      }
    }

    return { active: activeList, completed: completedList }
  }, [medications, dosesGivenByMed])

  // Group active medications by pet
  const grouped = useMemo(() => {
    const g: Record<string, MedicationRow[]> = {}
    for (const m of active) {
      if (!g[m.pet_id]) g[m.pet_id] = []
      g[m.pet_id].push(m)
    }
    return g
  }, [active])

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
              <div className="text-base font-semibold mb-2 flex items-center gap-3 h-12 px-4">
                <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: pet?.color || (pet?.species === 'dog' ? '#3B82F6' : pet?.species === 'cat' ? '#F97316' : '#6B7280') }} />
                <span className="font-semibold">{pet ? `${pet.name} (${pet.species})` : 'Unknown Pet'}</span>
              </div>
              {meds.length === 0 ? (
                <div className="ml-4 text-sm text-slate-500 dark:text-slate-400">No active medications</div>
              ) : (
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
                      <div className="absolute top-2 right-2 flex items-center gap-2">
                        <button
                          type="button"
                          className="text-xs text-blue-600 hover:text-blue-700 cursor-pointer"
                          onClick={(e) => {
                            e.stopPropagation()
                            setEditMedicationId(m.id)
                          }}
                          title="Edit medication"
                          aria-label="Edit medication"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          className="text-xs text-red-600 hover:text-red-700 cursor-pointer"
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
                      </div>
                      {m.dosage && <div className="text-sm text-slate-600 dark:text-slate-400 mt-0.5">{m.dosage}</div>}
                      <div className="text-sm text-slate-600 dark:text-slate-400 mt-0.5">{m.frequency}</div>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {(Array.isArray(m.reminder_times) ? m.reminder_times : []).map((t: string, idx: number) => (
                          <span key={idx} className="inline-flex items-center rounded-full border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2 py-0.5 text-xs text-slate-700 dark:text-slate-300">{formatClock(t)}</span>
                        ))}
                      </div>
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

      {/* Completed Medications Section */}
      {completed.length > 0 && (
        <div className="mt-8">
          <button
            type="button"
            onClick={() => setShowCompleted(!showCompleted)}
            className="flex items-center gap-2 text-base font-semibold hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors"
          >
            <svg className={`w-4 h-4 transition-transform ${showCompleted ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
            <span>Completed Medications ({completed.length})</span>
          </button>

          {showCompleted && (
            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {completed.map(m => {
                const stats = computeStats(m)
                const pet = petMap[m.pet_id]
                const completionDate = m.end_date || new Date().toISOString().slice(0, 10)

                return (
                  <div
                    key={m.id}
                    className="relative rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 p-4 shadow-sm opacity-75"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="text-lg font-semibold">{m.medication_name}</div>
                      <span className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">✓ Completed</span>
                    </div>
                    {m.dosage && <div className="text-sm text-slate-600 dark:text-slate-400 mt-0.5">{m.dosage}</div>}
                    <div className="mt-3 space-y-1.5 text-sm">
                      <div><span className="text-slate-500">Pet:</span> {pet?.name || 'Unknown'}</div>
                      <div><span className="text-slate-500">Progress:</span> {`${stats.given}/${stats.totalDoses} doses`}</div>
                      <div><span className="text-slate-500">Completed:</span> {completionDate}</div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      <AddMedicationForm
        open={showAdd || !!editMedicationId}
        onClose={() => { setShowAdd(false); setEditMedicationId(null) }}
        onSaved={() => { setShowAdd(false); setEditMedicationId(null); refresh() }}
        userId={userId}
        pets={pets}
        medicationId={editMedicationId}
        editMode={!!editMedicationId}
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


