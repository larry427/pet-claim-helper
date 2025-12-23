import React, { useState } from 'react'
import { supabase } from '../lib/supabase'

type Props = {
  entryId: string
  petName: string
  foodName: string
  currentCost: number
  onClose: () => void
  onComplete: () => void
}

export default function RefillFoodModal({ entryId, petName, foodName, currentCost, onClose, onComplete }: Props) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0])
  const [bagCost, setBagCost] = useState(currentCost.toString())

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
          start_date: startDate,
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

        <div className="space-y-4 mb-6">
          {/* Start Date */}
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Start Date <span className="text-red-500">*</span>
            </label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-3 text-slate-900 dark:text-white"
            />
          </div>

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
