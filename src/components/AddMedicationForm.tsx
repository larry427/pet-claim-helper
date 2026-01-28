import React, { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { PetProfile, Frequency, ReminderTimes } from '../types'

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
  const [frequency, setFrequency] = useState<Frequency>('Once daily')
  const [times, setTimes] = useState<string[]>(['08:00'])
  const [dayOfWeek, setDayOfWeek] = useState<number>(1) // 0=Sunday, 1=Monday, etc.
  const [dayOfMonth, setDayOfMonth] = useState<number>(1) // 1-28
  const [duration, setDuration] = useState<'7' | '14' | '30' | '90' | 'ongoing' | 'custom'>('7')
  const [customDays, setCustomDays] = useState<number>(7)
  const [originalStartDate, setOriginalStartDate] = useState<string | null>(null)
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
          setFrequency(data.frequency || 'Once daily')
          setOriginalStartDate(data.start_date || null)

          // Handle both old and new reminder_times formats
          const reminderTimes = data.reminder_times
          if (Array.isArray(reminderTimes)) {
            // Old format: array of times
            setTimes(reminderTimes.length > 0 ? reminderTimes : ['08:00'])
          } else if (reminderTimes && typeof reminderTimes === 'object') {
            // New format: object with type
            const rt = reminderTimes as any
            if (rt.type === 'weekly') {
              setDayOfWeek(rt.dayOfWeek ?? 1)
              setTimes([rt.time ?? '08:00'])
            } else if (rt.type === 'monthly' || rt.type === 'quarterly') {
              setDayOfMonth(rt.dayOfMonth ?? 1)
              setTimes([rt.time ?? '08:00'])
            } else if (rt.type === 'as_needed') {
              setTimes([])
            }
          } else {
            setTimes(['08:00'])
          }

          // Calculate duration from start_date and end_date
          if (data.end_date === null) {
            setDuration('ongoing')
          } else if (data.start_date && data.end_date) {
            const start = new Date(data.start_date)
            const end = new Date(data.end_date)
            const days = Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1
            if ([7, 14, 30, 90].includes(days)) {
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
        setFrequency('Once daily')
        setTimes(['08:00'])
        setDayOfWeek(1) // Monday
        setDayOfMonth(1)
        setDuration('7')
        setCustomDays(7)
        setOriginalStartDate(null)
        setLoading(false)
        setError(null)
      }

      // Fetch user's timezone from profile
      if (userId) {
        supabase.from('profiles').select('timezone').eq('id', userId).single().then(({ data }) => {
          const tz = (data && (data as any).timezone) ? String((data as any).timezone) : ''
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
    if (frequency === 'Once daily') setTimes(['08:00'])
    if (frequency === 'Twice daily') setTimes(['08:00', '20:00'])
    if (frequency === 'Three times daily') setTimes(['08:00', '14:00', '20:00'])
    if (frequency === 'Weekly') setTimes(['08:00'])
    if (frequency === 'Monthly') setTimes(['08:00'])
    if (frequency === 'Every 3 months') setTimes(['08:00'])
    if (frequency === 'As needed') setTimes([])
  }, [frequency])

  const requiredTimes = useMemo(() => {
    if (frequency === 'Once daily') return 1
    if (frequency === 'Twice daily') return 2
    if (frequency === 'Three times daily') return 3
    if (frequency === 'Weekly' || frequency === 'Monthly' || frequency === 'Every 3 months') return 1
    if (frequency === 'As needed') return 0
    return 1
  }, [frequency])

  const handleTimeChange = (idx: number, val: string) => {
    const v = (val || '').slice(0, 5)
    const next = [...times]
    next[idx] = v
    setTimes(next)
  }

  const computeDates = (): { start: string; end: string | null } => {
    // Use original start_date if editing, otherwise use today
    // This ensures duration changes are calculated from the original start, not from today
    let startDate: Date
    if (editMode && originalStartDate) {
      // Parse YYYY-MM-DD as local date (not UTC)
      const [y, m, d] = originalStartDate.split('-').map(Number)
      startDate = new Date(y, m - 1, d)
    } else {
      // Use local date, not UTC date, to prevent timezone bugs
      // When it's 8 PM PST on Nov 14, we want "2025-11-14" not "2025-11-15" (UTC)
      startDate = new Date()
    }

    const year = startDate.getFullYear()
    const month = String(startDate.getMonth() + 1).padStart(2, '0')
    const day = String(startDate.getDate()).padStart(2, '0')
    const start = `${year}-${month}-${day}`

    // If duration is "ongoing", return null for end_date
    if (duration === 'ongoing') {
      return { start, end: null }
    }

    let days = duration === 'custom' ? Math.max(1, Number(customDays || 1)) : Number(duration)
    if (!Number.isFinite(days) || days < 1) days = 1
    const endDate = new Date(startDate.getTime())
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
    if (frequency !== 'As needed') {
      if (times.some(t => !/^\d{2}:\d{2}$/.test(t))) { setError('Please select valid reminder times.'); return }
      if (times.length !== requiredTimes) { setError('Reminder times do not match selected frequency.'); return }
    }
    setLoading(true)
    setError(null)
    try {
      const { start, end } = computeDates()
      const tz = userTimezone || Intl.DateTimeFormat().resolvedOptions().timeZone

      // Build reminder_times based on frequency type
      let reminderTimes: ReminderTimes
      if (frequency === 'Once daily' || frequency === 'Twice daily' || frequency === 'Three times daily') {
        // Daily frequencies: store as array
        reminderTimes = times.filter(Boolean)
      } else if (frequency === 'Weekly') {
        // Weekly: store as object with dayOfWeek
        reminderTimes = { type: 'weekly', dayOfWeek, time: times[0] || '08:00' }
      } else if (frequency === 'Monthly') {
        // Monthly: store as object with dayOfMonth
        reminderTimes = { type: 'monthly', dayOfMonth, time: times[0] || '08:00' }
      } else if (frequency === 'Every 3 months') {
        // Quarterly: store as object with dayOfMonth
        reminderTimes = { type: 'quarterly', dayOfMonth, time: times[0] || '08:00' }
      } else if (frequency === 'As needed') {
        // As needed: store as object with type only
        reminderTimes = { type: 'as_needed' }
      } else {
        reminderTimes = times.filter(Boolean)
      }

      if (editMode && medicationId) {
        // Update existing medication
        const updatePayload = {
          medication_name: medicationName.trim(),
          dosage: dosage.trim() || null,
          frequency,
          reminder_times: reminderTimes,
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
          reminder_times: reminderTimes,
          start_date: start,
          end_date: end,
        } as const

        const { data: insertData, error: insertError } = await supabase.from('medications').insert(payload).select('id').single()
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="relative w-full max-w-md max-h-[90vh] flex flex-col rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Fixed Header */}
        <div className="flex-shrink-0 flex items-center justify-between p-6 pb-4 border-b border-slate-200 dark:border-slate-800">
          <h2 className="text-lg font-semibold">{editMode ? 'Edit Medication' : 'Add Medication'}</h2>
          <button type="button" className="text-sm text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200" onClick={onClose}>Close</button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-6 pt-4">
          {error && <div className="mb-4 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</div>}
          <form id="medication-form" className="space-y-4" onSubmit={handleSubmit}>
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
                  <option>Once daily</option>
                  <option>Twice daily</option>
                  <option>Three times daily</option>
                  <option>Weekly</option>
                  <option>Monthly</option>
                  <option>Every 3 months</option>
                  <option>As needed</option>
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
                  <option value="14">14 days</option>
                  <option value="30">30 days</option>
                  <option value="90">90 days</option>
                  <option value="ongoing">Ongoing</option>
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
            {frequency === 'Weekly' && (
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">Day of week</label>
                <select
                  value={dayOfWeek}
                  onChange={(e) => setDayOfWeek(Number(e.target.value))}
                  className="mt-2 w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white/90 dark:bg-slate-900 px-3 py-3"
                >
                  <option value={0}>Sunday</option>
                  <option value={1}>Monday</option>
                  <option value={2}>Tuesday</option>
                  <option value={3}>Wednesday</option>
                  <option value={4}>Thursday</option>
                  <option value={5}>Friday</option>
                  <option value={6}>Saturday</option>
                </select>
              </div>
            )}
            {(frequency === 'Monthly' || frequency === 'Every 3 months') && (
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">Day of month</label>
                <select
                  value={dayOfMonth}
                  onChange={(e) => setDayOfMonth(Number(e.target.value))}
                  className="mt-2 w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white/90 dark:bg-slate-900 px-3 py-3"
                >
                  {Array.from({ length: 28 }, (_, i) => i + 1).map(day => (
                    <option key={day} value={day}>{day}</option>
                  ))}
                </select>
              </div>
            )}
            {frequency !== 'As needed' && (
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">
                  Reminder time{requiredTimes > 1 ? 's' : ''}
                </label>
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
            )}
            {frequency === 'As needed' && (
              <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                <p className="text-sm text-blue-800 dark:text-blue-200">
                  No reminders - log doses manually when needed
                </p>
              </div>
            )}
          </form>
        </div>

        {/* Fixed Footer */}
        <div className="flex-shrink-0 p-6 pt-4 border-t border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row gap-3 sm:justify-end">
          <button type="button" onClick={onClose} className="h-12 rounded-lg border border-slate-300 dark:border-slate-700 px-4">Cancel</button>
          <button
            type="submit"
            form="medication-form"
            disabled={loading}
            className="h-12 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white px-4 disabled:opacity-60"
          >
            {loading ? 'Saving…' : editMode ? 'Update Medication' : 'Save Medication'}
          </button>
        </div>
      </div>
    </div>
  )
}


