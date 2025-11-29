import React, { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { PetProfile } from '../types'

type Frequency = '1x daily' | '2x daily' | '3x daily'

export default function AddMedicationForm({
  open,
  onClose,
  onSaved,
  userId,
  pets,
  defaultPetId,
  medicationId,
  editMode = false,
}: {
  open: boolean
  onClose: () => void
  onSaved?: (newMedicationId?: string) => void
  userId: string | null
  pets: PetProfile[]
  defaultPetId?: string | null
  medicationId?: string | null
  editMode?: boolean
}) {
  const [petId, setPetId] = useState<string>('')
  const [medicationName, setMedicationName] = useState('')
  const [dosage, setDosage] = useState('')
  const [frequency, setFrequency] = useState<Frequency>('1x daily')
  const [times, setTimes] = useState<string[]>(['07:00'])
  const [duration, setDuration] = useState<'7' | '10' | '14' | '30' | 'custom'>('7')
  const [customDays, setCustomDays] = useState<number>(7)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [userTimezone, setUserTimezone] = useState<string>(Intl.DateTimeFormat().resolvedOptions().timeZone)

  // Track previous open state to only reset form when modal first opens
  const prevOpenRef = useRef(false)

  useEffect(() => {
    // Only reset form fields when modal transitions from closed to open (false -> true)
    // This prevents form data loss when validation fails and component re-renders
    if (open && !prevOpenRef.current) {
      if (editMode && medicationId) {
        // Load existing medication data
        setLoading(true)
        supabase.from('medications').select('*').eq('id', medicationId).single().then(({ data, error }) => {
          if (error || !data) {
            setError('Failed to load medication data')
            setLoading(false)
            return
          }
          setPetId(data.pet_id || '')
          setMedicationName(data.medication_name || '')
          setDosage(data.dosage || '')
          setFrequency(data.frequency || '1x daily')
          setTimes(Array.isArray(data.reminder_times) && data.reminder_times.length > 0 ? data.reminder_times : ['07:00'])

          // Calculate duration from start_date and end_date
          if (data.start_date && data.end_date) {
            const start = new Date(data.start_date)
            const end = new Date(data.end_date)
            const days = Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1
            if ([7, 10, 14, 30].includes(days)) {
              setDuration(String(days) as any)
            } else {
              setDuration('custom')
              setCustomDays(days)
            }
          }

          setLoading(false)
          setError(null)
        }).catch(() => {
          setError('Failed to load medication')
          setLoading(false)
        })
      } else {
        // New medication - reset to defaults
        setPetId(defaultPetId || (pets[0]?.id ?? ''))
        setMedicationName('')
        setDosage('')
        setFrequency('1x daily')
        setTimes(['07:00'])
        setDuration('7')
        setCustomDays(7)
        setLoading(false)
        setError(null)
      }

      // Debug: log initial detected timezone when form opens
      try {
        console.log('[AddMedicationForm] Form opened. Initial timezone (from Intl):', userTimezone)
      } catch {}
      // Fetch user's timezone from profile
      if (userId) {
        supabase.from('profiles').select('timezone').eq('id', userId).single().then(({ data }) => {
          const tz = (data && (data as any).timezone) ? String((data as any).timezone) : ''
          try {
            console.log('[AddMedicationForm] Profile timezone loaded:', tz || '(empty)')
          } catch {}
          if (tz) setUserTimezone(tz)
        }).catch(() => {})
      }
    }
    // Update the ref to track current open state
    prevOpenRef.current = open
  }, [open, defaultPetId, pets, userId, userTimezone, editMode, medicationId])

  // Prevent body scroll and handle escape key when modal is open
  useEffect(() => {
    if (!open) return
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
  }, [open, onClose])

  useEffect(() => {
    if (frequency === '1x daily') setTimes(['07:00'])
    if (frequency === '2x daily') setTimes(['07:00', '19:00'])
    if (frequency === '3x daily') setTimes(['08:00', '14:00', '20:00'])
  }, [frequency])

  const requiredTimes = useMemo(() => (frequency === '1x daily' ? 1 : frequency === '2x daily' ? 2 : 3), [frequency])

  const handleTimeChange = (idx: number, val: string) => {
    const v = (val || '').slice(0, 5)
    const next = [...times]
    next[idx] = v
    setTimes(next)
  }

  const computeDates = (): { start: string; end: string | null } => {
    // Use local date, not UTC date, to prevent timezone bugs
    // When it's 8 PM PST on Nov 14, we want "2025-11-14" not "2025-11-15" (UTC)
    const today = new Date()
    const year = today.getFullYear()
    const month = String(today.getMonth() + 1).padStart(2, '0')
    const day = String(today.getDate()).padStart(2, '0')
    const start = `${year}-${month}-${day}`

    let days = duration === 'custom' ? Math.max(1, Number(customDays || 1)) : Number(duration)
    if (!Number.isFinite(days) || days < 1) days = 1
    const endDate = new Date(today.getTime())
    endDate.setDate(endDate.getDate() + (days - 1))
    const endYear = endDate.getFullYear()
    const endMonth = String(endDate.getMonth() + 1).padStart(2, '0')
    const endDay = String(endDate.getDate()).padStart(2, '0')
    const end = `${endYear}-${endMonth}-${endDay}`

    return { start, end }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!userId) { setError('You must be logged in.'); return }
    if (!petId) { setError('Please select a pet.'); return }
    if (!medicationName.trim()) { setError('Enter medication name.'); return }
    if (times.some(t => !/^\d{2}:\d{2}$/.test(t))) { setError('Please select valid reminder times.'); return }
    if (times.length !== requiredTimes) { setError('Reminder times do not match selected frequency.'); return }
    setLoading(true)
    setError(null)
    try {
      const { start, end } = computeDates()
      const tz = userTimezone || Intl.DateTimeFormat().resolvedOptions().timeZone
      try {
        console.log('[AddMedicationForm] Submitting. Detected timezone:', tz)
        console.log('[AddMedicationForm] Times selected (will store as PST, no UTC conversion):', times)
      } catch {}
      // Store times as-is in PST format (HH:mm), no UTC conversion
      const timesPst = times.filter(Boolean)
      try {
        console.log('[AddMedicationForm] Times to store in PST:', timesPst)
      } catch {}

      if (editMode && medicationId) {
        // Update existing medication
        const updatePayload = {
          medication_name: medicationName.trim(),
          dosage: dosage.trim() || null,
          frequency,
          reminder_times: timesPst,
          end_date: end,
        }
        const { error: updateError } = await supabase.from('medications').update(updatePayload).eq('id', medicationId).eq('user_id', userId)
        if (updateError) throw updateError
        if (onSaved) onSaved(medicationId)
      } else {
        // Insert new medication
        const payload = {
          user_id: userId,
          pet_id: petId,
          claim_id: null as string | null,
          medication_name: medicationName.trim(),
          dosage: dosage.trim() || null,
          frequency,
          reminder_times: timesPst,
          start_date: start,
          end_date: end,
        } as const
        try {
          console.log('[AddMedicationForm] Payload.reminder_times (storing in PST):', payload.reminder_times)
        } catch {}

        const { data: insertData, error: insertError } = await supabase.from('medications').insert(payload).select('id').single()
        try {
          console.log('[AddMedicationForm] Supabase insert completed. Error:', insertError || null)
        } catch {}
        if (insertError) throw insertError
        const newMedicationId = insertData?.id
        if (onSaved) onSaved(newMedicationId)
      }
      onClose()
    } catch (err: any) {
      setError(err?.message || 'Failed to save medication')
    } finally {
      setLoading(false)
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="relative mx-4 w-full max-w-md rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">{editMode ? 'Edit Medication' : 'Add Medication'}</h2>
          <button type="button" className="text-sm" onClick={onClose}>Close</button>
        </div>
        {error && <div className="mt-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</div>}
        <form className="mt-4 space-y-4" onSubmit={handleSubmit}>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">Pet{editMode && <span className="text-xs text-slate-500 ml-2">(cannot be changed)</span>}</label>
            <select
              value={petId}
              onChange={(e) => setPetId(e.target.value)}
              className="mt-2 w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white/90 dark:bg-slate-900 px-3 py-3"
              disabled={editMode}
            >
              <option value="">— Select —</option>
              {pets.map((p) => (
                <option key={p.id} value={p.id}>{p.name} ({p.species})</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">Medication name</label>
            <input
              value={medicationName}
              onChange={(e) => setMedicationName(e.target.value)}
              className="mt-2 w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white/90 dark:bg-slate-900 px-3 py-3"
              placeholder="Amoxicillin"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">Dosage</label>
            <input
              value={dosage}
              onChange={(e) => setDosage(e.target.value)}
              className="mt-2 w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white/90 dark:bg-slate-900 px-3 py-3"
              placeholder="1 pill"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">Frequency</label>
              <select
                value={frequency}
                onChange={(e) => setFrequency(e.target.value as Frequency)}
                className="mt-2 w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white/90 dark:bg-slate-900 px-3 py-3"
              >
                <option>1x daily</option>
                <option>2x daily</option>
                <option>3x daily</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">Duration</label>
              <select
                value={duration}
                onChange={(e) => setDuration(e.target.value as any)}
                className="mt-2 w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white/90 dark:bg-slate-900 px-3 py-3"
              >
                <option value="7">7 days</option>
                <option value="10">10 days</option>
                <option value="14">14 days</option>
                <option value="30">30 days</option>
                <option value="custom">Custom</option>
              </select>
            </div>
          </div>
          {duration === 'custom' && (
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">Custom days</label>
              <input
                type="number"
                min={1}
                value={customDays}
                onChange={(e) => setCustomDays(Number(e.target.value))}
                className="mt-2 w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white/90 dark:bg-slate-900 px-3 py-3"
              />
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">Reminder times</label>
            <div className="mt-2 grid grid-cols-1 sm:grid-cols-3 gap-3">
              {Array.from({ length: requiredTimes }).map((_, idx) => (
                <input
                  key={idx}
                  type="time"
                  value={times[idx] || ''}
                  onChange={(e) => handleTimeChange(idx, e.target.value)}
                  className="w-full min-w-[140px] rounded-md border border-slate-300 dark:border-slate-700 bg-white/90 dark:bg-slate-900 px-3 py-3"
                />
              ))}
            </div>
          </div>
          <div className="pt-2 border-t border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row gap-3 sm:justify-end">
            <button type="button" onClick={onClose} className="h-12 rounded-lg border border-slate-300 dark:border-slate-700 px-4">Cancel</button>
            <button
              type="submit"
              disabled={loading}
              className="h-12 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white px-4 disabled:opacity-60"
            >
              {loading ? 'Saving…' : editMode ? 'Update Medication' : 'Save Medication'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}


