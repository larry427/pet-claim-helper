import React, { useEffect, useMemo, useState } from 'react'
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
}: {
  open: boolean
  onClose: () => void
  onSaved?: () => void
  userId: string | null
  pets: PetProfile[]
  defaultPetId?: string | null
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

  useEffect(() => {
    if (open) {
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
  }, [open, defaultPetId, pets])

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
    const today = new Date()
    const start = today.toISOString().slice(0, 10)
    let days = duration === 'custom' ? Math.max(1, Number(customDays || 1)) : Number(duration)
    if (!Number.isFinite(days) || days < 1) days = 1
    const endDate = new Date(today.getTime())
    endDate.setDate(endDate.getDate() + (days - 1))
    const end = endDate.toISOString().slice(0, 10)
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
      const payload = {
        user_id: userId,
        pet_id: petId,
        claim_id: null as string | null,
        medication_name: medicationName.trim(),
        dosage: dosage.trim() || null,
        frequency,
        reminder_times: times,
        start_date: start,
        end_date: end,
      } as const

      const { error: insertError } = await supabase.from('medications').insert(payload)
      if (insertError) throw insertError
      if (onSaved) onSaved()
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
          <h2 className="text-lg font-semibold">Add Medication</h2>
          <button type="button" className="text-sm" onClick={onClose}>Close</button>
        </div>
        {error && <div className="mt-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</div>}
        <form className="mt-4 space-y-4" onSubmit={handleSubmit}>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">Pet</label>
            <select
              value={petId}
              onChange={(e) => setPetId(e.target.value)}
              className="mt-2 w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white/90 dark:bg-slate-900 px-3 py-3"
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
                  className="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white/90 dark:bg-slate-900 px-3 py-3"
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
              {loading ? 'Saving…' : 'Save Medication'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}


