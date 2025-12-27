import React, { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

type Props = {
  entryId: string
  petName: string
  foodName: string
  currentCost: number
  onClose: () => void
  onComplete: () => void
}

const CUPS_PER_LB = {
  dry: 4,
  wet: 2,
  'freeze-dried': 9,
  raw: 2,
  cooked: 2.5
}

export default function RefillFoodModal({ entryId, petName, foodName, currentCost, onClose, onComplete }: Props) {
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [bagCost, setBagCost] = useState(currentCost.toString())
  const [calculatedStartDate, setCalculatedStartDate] = useState('')
  const [daysLeftMessage, setDaysLeftMessage] = useState('')

  useEffect(() => {
    const loadAndCalculate = async () => {
      try {
        // Fetch current food entry
        const { data: entry, error: fetchError } = await supabase
          .from('food_entries')
          .select('*')
          .eq('id', entryId)
          .single()

        if (fetchError) throw fetchError
        if (!entry) throw new Error('Food entry not found')

        // Calculate days_per_bag
        const cupsPerLb = CUPS_PER_LB[entry.food_type as keyof typeof CUPS_PER_LB]
        const totalCups = entry.bag_size_lbs * cupsPerLb
        const daysPerBag = totalCups / entry.cups_per_day

        // Calculate current days_left
        const today = new Date()
        const startDate = new Date(entry.start_date)
        const daysSinceStart = Math.floor((today.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24))
        const daysLeft = Math.max(0, Math.floor(daysPerBag - daysSinceStart))

        // Calculate new total days after refill
        const newTotalDays = daysLeft + daysPerBag

        // Calculate new start date (in the future)
        // Formula: start_date = today + daysLeft
        const newStartDate = new Date()
        newStartDate.setDate(newStartDate.getDate() + daysLeft)

        setCalculatedStartDate(newStartDate.toISOString().split('T')[0])
        setDaysLeftMessage(`Current supply: ${daysLeft} days. After refill: ${Math.floor(newTotalDays)} days total.`)
        setLoading(false)
      } catch (e: any) {
        setError(e?.message || 'Failed to load food entry')
        setLoading(false)
      }
    }

    loadAndCalculate()
  }, [entryId])

  const handleSubmit = async () => {
    setError(null)

    if (!bagCost || parseFloat(bagCost) <= 0) {
      setError('Please enter a valid cost')
      return
    }

    setSaving(true)

    try {
      const { error: updateError } = await supabase
        .from('food_entries')
        .update({
          start_date: calculatedStartDate,
          bag_cost: parseFloat(bagCost)
        })
        .eq('id', entryId)

      if (updateError) throw updateError

      onComplete()
    } catch (e: any) {
      setError(e?.message || 'Failed to refill food entry')
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
        <div className="rounded-2xl bg-white dark:bg-slate-900 p-8 shadow-2xl border border-slate-200 dark:border-slate-800">
          <div className="text-slate-600 dark:text-slate-400">Calculating...</div>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="relative w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 p-6 shadow-2xl border border-slate-200 dark:border-slate-800"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Bought more food for {petName}?</h2>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
            {foodName}
          </p>
        </div>

        {error && (
          <div className="mb-4 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 px-4 py-3 text-sm text-red-700 dark:text-red-400">
            {error}
          </div>
        )}

        {/* Supply Calculation Info */}
        {daysLeftMessage && (
          <div className="mb-4 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 px-4 py-3">
            <div className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 mb-1">SUPPLY CALCULATION</div>
            <div className="text-sm text-emerald-900 dark:text-emerald-300">
              {daysLeftMessage}
            </div>
          </div>
        )}

        <div className="space-y-4 mb-6">
          {/* Cost */}
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Cost <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500">$</span>
              <input
                type="number"
                step="0.01"
                min="0.01"
                value={bagCost}
                onChange={(e) => setBagCost(e.target.value)}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 pl-8 pr-4 py-3 text-slate-900 dark:text-white"
              />
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Previous cost: ${currentCost.toFixed(2)}
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-3 rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors text-slate-700 dark:text-slate-300"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="flex-1 px-4 py-3 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold transition-colors disabled:opacity-50"
          >
            {saving ? 'Confirming...' : 'Confirm Refill'}
          </button>
        </div>
      </div>
    </div>
  )
}
