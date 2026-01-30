import React, { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'

type MedicationRow = {
  id: string
  user_id: string
  pet_id: string
  medication_name: string
  dosage: string | null
  frequency: '1x daily' | '2x daily' | '3x daily'
  reminder_times: string[] | any
  start_date: string
  end_date: string | null
}

export default function DoseTrackingPage({
  medicationId,
  userId,
  onClose,
  onDoseRecorded,
}: {
  medicationId: string
  userId: string | null
  onClose: () => void
  onDoseRecorded?: () => void
}) {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const savingRef = useRef(false) // Synchronous guard against duplicate submissions
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [showCompletionModal, setShowCompletionModal] = useState(false)
  const [med, setMed] = useState<MedicationRow | null>(null)
  const [petName, setPetName] = useState<string>('')
  const [givenCount, setGivenCount] = useState<number>(0)
  const [lastDoseGiven, setLastDoseGiven] = useState<string | null>(null)

  const timesPerDay = useMemo(() => {
    if (!med) return 0
    if (Array.isArray(med.reminder_times) && med.reminder_times.length > 0) return med.reminder_times.length
    return med.frequency === '1x daily' ? 1 : med.frequency === '2x daily' ? 2 : 3
  }, [med])

  const totalDoses = useMemo(() => {
    if (!med) return 0
    const start = new Date(med.start_date)
    const end = med.end_date ? new Date(med.end_date) : null
    const startDay = new Date(start.getFullYear(), start.getMonth(), start.getDate())
    const endDay = end ? new Date(end.getFullYear(), end.getMonth(), end.getDate()) : null
    const days = endDay ? Math.max(1, Math.round((endDay.getTime() - startDay.getTime()) / (1000 * 60 * 60 * 24)) + 1) : 1
    return days * timesPerDay
  }, [med, timesPerDay])

  const dosesLeft = useMemo(() => Math.max(0, totalDoses - givenCount), [totalDoses, givenCount])

  const fetchAll = async () => {
    setLoading(true)
    setError(null)
    try {
      // Medication
      const { data: m, error: mErr } = await supabase
        .from('medications')
        .select('*')
        .eq('id', medicationId)
        .single()
      if (mErr) throw mErr
      const normalized: MedicationRow = {
        id: m.id,
        user_id: m.user_id,
        pet_id: m.pet_id,
        medication_name: m.medication_name,
        dosage: m.dosage ?? null,
        frequency: m.frequency,
        reminder_times: Array.isArray(m.reminder_times) ? m.reminder_times : [],
        start_date: m.start_date,
        end_date: m.end_date ?? null,
      }
      setMed(normalized)

      // Pet name
      if (m.pet_id) {
        const { data: pet, error: pErr } = await supabase
          .from('pets')
          .select('name')
          .eq('id', m.pet_id)
          .single()
        if (!pErr && pet?.name) setPetName(pet.name)
      }

      // Given count
      const { count, error: dErr } = await supabase
        .from('medication_doses')
        .select('*', { count: 'exact', head: true })
        .eq('medication_id', medicationId)
        .eq('status', 'given')
      if (dErr) throw dErr
      setGivenCount(count || 0)

      // Last dose given
      const { data: lastDose, error: lastDoseErr } = await supabase
        .from('medication_doses')
        .select('given_time')
        .eq('medication_id', medicationId)
        .eq('status', 'given')
        .order('given_time', { ascending: false })
        .limit(1)
        .single()
      if (!lastDoseErr && lastDose?.given_time) {
        setLastDoseGiven(lastDose.given_time)
      } else {
        setLastDoseGiven(null)
      }
    } catch (e: any) {
      setError(e?.message || 'Failed to load medication')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchAll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [medicationId])

  // Prevent body scroll and handle escape key when modal is open
  useEffect(() => {
    // Prevent body scroll
    const originalOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    // Handle escape key
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleEscape)
    return () => {
      document.body.style.overflow = originalOverflow
      window.removeEventListener('keydown', handleEscape)
    }
  }, [onClose])

  // Format time for display (no timezone conversion - times are already stored in PST)
  const formatClock = (timeString: string) => {
    const [hh, mm] = timeString.split(':').map(n => parseInt(n, 10))
    if (!Number.isFinite(hh) || !Number.isFinite(mm)) return timeString
    const hour12 = hh === 0 ? 12 : hh > 12 ? hh - 12 : hh
    const ampm = hh >= 12 ? 'PM' : 'AM'
    return `${hour12}:${String(mm).padStart(2, '0')} ${ampm}`
  }

  const formatLastDose = (timestamp: string | null) => {
    if (!timestamp) return 'No doses recorded yet'

    // given_time is stored in local time format (e.g., "2026-01-18T13:26:00")
    // We need to parse it WITHOUT any timezone conversion
    // Remove 'Z' suffix if present, and strip milliseconds
    let timeStr = timestamp.endsWith('Z') ? timestamp.slice(0, -1) : timestamp
    if (timeStr.includes('.')) {
      timeStr = timeStr.split('.')[0] // Remove milliseconds like .000
    }

    // Manually parse the ISO string to avoid timezone interpretation issues
    const match = timeStr.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):?(\d{2})?$/)
    if (!match) {
      // Fallback if format doesn't match
      return timestamp
    }

    const [, yearStr, monthStr, dayStr, hourStr, minStr] = match
    const year = parseInt(yearStr)
    const month = parseInt(monthStr) - 1 // JS months are 0-indexed
    const day = parseInt(dayStr)
    const hour = parseInt(hourStr)
    const minute = parseInt(minStr)

    // Create date using local components (no timezone conversion)
    const date = new Date(year, month, day, hour, minute)

    const today = new Date()
    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)

    // Get date-only representations
    const dateDay = new Date(year, month, day)
    const todayDay = new Date(today.getFullYear(), today.getMonth(), today.getDate())
    const yesterdayDay = new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate())

    let dayLabel = ''
    if (dateDay.getTime() === todayDay.getTime()) {
      dayLabel = 'Today'
    } else if (dateDay.getTime() === yesterdayDay.getTime()) {
      dayLabel = 'Yesterday'
    } else {
      dayLabel = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    }

    // Format time
    const hour12 = hour % 12 || 12
    const ampm = hour >= 12 ? 'PM' : 'AM'
    const time = `${hour12}:${String(minute).padStart(2, '0')} ${ampm}`

    return `${dayLabel} ${time}`
  }

  const handleMarkGiven = async () => {
    // Prevent duplicate submissions with ref (synchronous check)
    if (savingRef.current) {
      return
    }
    savingRef.current = true
    setSaving(true)

    if (!userId) {
      savingRef.current = false
      setSaving(false)
      setError('You must be logged in to record a dose.')
      return
    }

    // VALIDATION: Prevent over-dosing
    if (givenCount >= totalDoses) {
      savingRef.current = false
      setSaving(false)
      setError('All doses have been recorded for this medication')
      return
    }

    // Check if this will complete the medication
    const willComplete = (givenCount + 1) >= totalDoses

    setError(null)
    try {
      const now = new Date()
      // Use local ISO format (no 'Z' suffix) to match scheduled_time storage format
      const pad = (n: number) => String(n).padStart(2, '0')
      const localIsoNow = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`

      // First, check for existing pending dose for today
      const todayStart = new Date()
      todayStart.setHours(0, 0, 0, 0)
      const todayEnd = new Date()
      todayEnd.setHours(23, 59, 59, 999)

      const { data: pendingDose } = await supabase
        .from('medication_doses')
        .select('id')
        .eq('medication_id', medicationId)
        .eq('status', 'pending')
        .gte('scheduled_time', todayStart.toISOString())
        .lte('scheduled_time', todayEnd.toISOString())
        .limit(1)
        .single()

      if (pendingDose) {
        // Update existing pending dose
        const { error: updErr } = await supabase
          .from('medication_doses')
          .update({ status: 'given', given_time: localIsoNow })
          .eq('id', pendingDose.id)
        if (updErr) throw updErr
      } else {
        // No pending dose - create new one
        const { error: insErr } = await supabase.from('medication_doses').insert({
          medication_id: medicationId,
          user_id: userId,
          scheduled_time: localIsoNow,
          given_time: localIsoNow,
          status: 'given',
        })
        if (insErr) throw insErr
      }
      setGivenCount((g) => g + 1)
      setLastDoseGiven(localIsoNow)

      if (willComplete) {
        // Show completion celebration modal
        setShowCompletionModal(true)
      } else {
        setSuccess('Dose recorded ✓')
        setTimeout(() => {
          onClose()
        }, 2000)
      }

      if (onDoseRecorded) onDoseRecorded()
    } catch (e: any) {
      setError(e?.message || 'Failed to record dose')
    } finally {
      savingRef.current = false
      setSaving(false)
    }
  }

  // Completion celebration modal
  if (showCompletionModal && med) {
    return (
      <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50" onClick={() => {}}>
        <div className="relative mx-4 w-full max-w-md rounded-2xl border border-emerald-200 dark:border-emerald-800 bg-white dark:bg-slate-900 p-8 shadow-2xl" onClick={(e) => e.stopPropagation()}>
          <div className="text-center">
            <div className="text-6xl mb-4">🎉</div>
            <h2 className="text-2xl font-bold text-emerald-800 dark:text-emerald-200 mb-2">Great job!</h2>
            <p className="text-lg text-slate-700 dark:text-slate-300 mb-1">You've completed <span className="font-semibold">{med.medication_name}</span></p>
            <p className="text-lg text-slate-700 dark:text-slate-300 mb-4">for <span className="font-semibold">{petName}</span>!</p>
            <div className="mt-6 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 p-4 text-sm text-blue-800 dark:text-blue-200">
              💡 Consider following up with your vet if needed.
            </div>
            <button
              type="button"
              onClick={() => {
                setShowCompletionModal(false)
                onClose()
              }}
              className="mt-6 w-full h-12 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold"
            >
              Got it
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="relative mx-4 w-full max-w-md rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Track Dose</h2>
          <button type="button" className="text-sm" onClick={onClose}>Close</button>
        </div>

        {loading && <div className="mt-4 text-sm text-slate-600">Loading…</div>}
        {error && <div className="mt-4 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-rose-800 text-sm">{error}</div>}
        {!loading && med && (
          <div className="mt-4 space-y-3">
            <div className="text-sm text-slate-600 dark:text-slate-400">Pet: <span className="font-medium text-slate-800 dark:text-slate-100">{petName || '—'}</span></div>
            <div className="text-lg font-semibold">{med.medication_name}</div>
            {med.dosage && <div className="text-sm text-slate-600 dark:text-slate-400">{med.dosage}</div>}
            <div className="text-sm text-slate-600 dark:text-slate-400">Frequency: <span className="font-medium text-slate-800 dark:text-slate-100">{med.frequency}</span></div>

            <div className="mt-2 rounded-lg border border-slate-200 dark:border-slate-800 p-3 text-sm space-y-1.5">
              <div className="font-medium text-slate-800 dark:text-slate-200">
                {dosesLeft === 0 ? 'Complete' : dosesLeft === 1 ? 'Last dose!' : `${dosesLeft} doses left`}
              </div>
              <div><span className="text-slate-500">Last dose given:</span> {formatLastDose(lastDoseGiven)}</div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-slate-500">Reminder times:</span>
                <div className="flex flex-wrap gap-2">
                  {(Array.isArray(med.reminder_times) ? med.reminder_times : []).map((t: string, idx: number) => (
                    <span key={idx} className="inline-flex items-center rounded-full border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2 py-0.5 text-xs text-slate-700 dark:text-slate-300">{formatClock(t)}</span>
                  ))}
                </div>
              </div>
            </div>

            {success && <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-emerald-800 text-sm">{success}</div>}

            {givenCount >= totalDoses ? (
              <div className="pt-2">
                <div className="rounded-lg bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 p-4 text-center">
                  <div className="text-2xl mb-2">🎉</div>
                  <div className="font-semibold text-emerald-800 dark:text-emerald-200">All doses completed!</div>
                  <div className="text-sm text-emerald-700 dark:text-emerald-300 mt-1">This medication course is finished.</div>
                </div>
              </div>
            ) : (
              <div className="pt-2 flex flex-col sm:flex-row gap-3 sm:justify-end">
                <button
                  type="button"
                  disabled={saving || !userId}
                  onClick={handleMarkGiven}
                  className="h-12 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white px-4 disabled:opacity-60"
                >
                  {saving ? 'Saving…' : '✓ MARK AS GIVEN'}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}


