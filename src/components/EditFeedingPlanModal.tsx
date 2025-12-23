import React, { useState } from 'react'
import { supabase } from '../lib/supabase'

type FeedingPlan = {
  id: string
  servings_per_meal: number
  meals_per_day: number
}

type Props = {
  plan: FeedingPlan
  petName: string
  foodName: string
  servingUnit: string
  onClose: () => void
  onComplete: () => void
}

export default function EditFeedingPlanModal({ plan, petName, foodName, servingUnit, onClose, onComplete }: Props) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [servingsPerMeal, setServingsPerMeal] = useState(plan.servings_per_meal.toString())
  const [mealsPerDay, setMealsPerDay] = useState(plan.meals_per_day.toString())

  const handleSubmit = async () => {
    setError(null)

    if (!servingsPerMeal || parseFloat(servingsPerMeal) <= 0) {
      setError('Please enter valid servings per meal')
      return
    }
    if (!mealsPerDay || parseInt(mealsPerDay) <= 0) {
      setError('Please enter valid meals per day')
      return
    }

    setSaving(true)

    try {
      const { error: updateError } = await supabase
        .from('feeding_plans')
        .update({
          servings_per_meal: parseFloat(servingsPerMeal),
          meals_per_day: parseInt(mealsPerDay)
        })
        .eq('id', plan.id)

      if (updateError) throw updateError

      onComplete()
    } catch (e: any) {
      setError(e?.message || 'Failed to update feeding plan')
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
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Edit Feeding Plan</h2>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
            {petName} • {foodName}
          </p>
        </div>

        {error && (
          <div className="mb-4 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 px-4 py-3 text-sm text-red-700 dark:text-red-400">
            {error}
          </div>
        )}

        {/* Feeding Schedule */}
        <div className="space-y-4 mb-6">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                {servingUnit}s per meal <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                step="0.5"
                min="0.5"
                value={servingsPerMeal}
                onChange={(e) => setServingsPerMeal(e.target.value)}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-3 text-slate-900 dark:text-white"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                Meals per day <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                min="1"
                value={mealsPerDay}
                onChange={(e) => setMealsPerDay(e.target.value)}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-3 text-slate-900 dark:text-white"
              />
            </div>
          </div>

          {/* Preview */}
          {servingsPerMeal && mealsPerDay && (
            <div className="rounded-lg bg-slate-50 dark:bg-slate-800/50 p-3">
              <div className="text-sm text-slate-600 dark:text-slate-400">
                Total per day:{' '}
                <span className="font-semibold text-slate-900 dark:text-white">
                  {(parseFloat(servingsPerMeal || '0') * parseInt(mealsPerDay || '0')).toFixed(1)} {servingUnit}s
                </span>
              </div>
            </div>
          )}
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
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  )
}
