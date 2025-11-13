import React, { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { formatTimeForDisplay } from '../utils/timezoneUtils'

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
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [med, setMed] = useState<MedicationRow | null>(null)
  const [petName, setPetName] = useState<string>('')
  const [givenCount, setGivenCount] = useState<number>(0)
  const [userTimezone, setUserTimezone] = useState<string>(Intl.DateTimeFormat().resolvedOptions().timeZone)

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

  const pct = useMemo(() => (totalDoses > 0 ? Math.round((givenCount / totalDoses) * 100) : 0), [givenCount, totalDoses])

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
      // Load user timezone
      if (userId) {
        try {
          const { data } = await supabase.from('profiles').select('timezone').eq('id', userId).single()
          const tz = (data && (data as any).timezone) ? String((data as any).timezone) : ''
          if (tz) setUserTimezone(tz)
        } catch {}
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

  const formatClock = (utcHHMM: string) => formatTimeForDisplay(utcHHMM, userTimezone)

  const handleMarkGiven = async () => {
    if (!userId) { setError('You must be logged in to record a dose.'); return }
    setSaving(true)
    setError(null)
    try {
      const now = new Date()
      const isoNow = now.toISOString()
      const { error: insErr } = await supabase.from('medication_doses').insert({
        medication_id: medicationId,
        user_id: userId,
        scheduled_time: isoNow,
        given_time: isoNow,
        status: 'given',
      })
      if (insErr) throw insErr
      setGivenCount((g) => g + 1)
      setSuccess('Dose recorded ✓')
      if (onDoseRecorded) onDoseRecorded()
      setTimeout(() => {
        onClose()
      }, 4000)
    } catch (e: any) {
      setError(e?.message || 'Failed to record dose')
    } finally {
      setSaving(false)
    }
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
            <div className="text-sm text-slate-600">Pet: <span className="font-medium text-slate-800 dark:text-slate-100">{petName || '—'}</span></div>
            <div className="text-lg font-semibold">{med.medication_name}</div>
            {med.dosage && <div className="text-sm text-slate-600">{med.dosage}</div>}

            <div className="mt-2 rounded-lg border border-slate-200 dark:border-slate-800 p-3 text-sm space-y-1.5">
              <div><span className="text-slate-500">Progress:</span> {`${givenCount}/${totalDoses} doses (${pct}%)`}</div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-slate-500">Reminder times:</span>
                <div className="flex flex-wrap gap-2">
                  {(Array.isArray(med.reminder_times) ? med.reminder_times : []).map((t: string, idx: number) => (
                    <span key={idx} className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs text-slate-700">{formatClock(t)}</span>
                  ))}
                </div>
              </div>
            </div>

            {success && <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-emerald-800 text-sm">{success}</div>}

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
          </div>
        )}
      </div>
    </div>
  )
}


