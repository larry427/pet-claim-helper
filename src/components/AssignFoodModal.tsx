import React, { useState } from 'react'
import { supabase } from '../lib/supabase'

type FoodItem = {
  id: string
  name: string
  brand: string | null
  serving_unit: string
}

type Pet = {
  id: string
  name: string
  species: string
  photo_url: string | null
}

type Props = {
  foodItem: FoodItem
  pets: Pet[]
  onClose: () => void
  onComplete: () => void
}

export default function AssignFoodModal({ foodItem, pets, onClose, onComplete }: Props) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedPetId, setSelectedPetId] = useState<string>(pets[0]?.id || '')
  const [servingsPerMeal, setServingsPerMeal] = useState('2')
  const [mealsPerDay, setMealsPerDay] = useState('2')

  const handleSubmit = async () => {
    setError(null)

    if (!selectedPetId) {
      setError('Please select a pet')
      return
    }
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
      const { error: insertError } = await supabase
        .from('feeding_plans')
        .insert({
          pet_id: selectedPetId,
          food_item_id: foodItem.id,
          servings_per_meal: parseFloat(servingsPerMeal),
          meals_per_day: parseInt(mealsPerDay)
        })

      if (insertError) throw insertError

      onComplete()
    } catch (e: any) {
      setError(e?.message || 'Failed to create feeding plan')
      setSaving(false)
    }
  }

  if (pets.length === 0) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
        <div
          className="relative w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 p-6 shadow-2xl border border-slate-200 dark:border-slate-800"
          onClick={(e) => e.stopPropagation()}
        >
          <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-4">No Pets Found</h2>
          <p className="text-slate-600 dark:text-slate-400 mb-6">
            You need to add a pet before you can create a feeding plan.
          </p>
          <button
            onClick={onComplete}
            className="w-full px-4 py-3 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold transition-colors"
          >
            OK
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="relative w-full max-w-lg rounded-2xl bg-white dark:bg-slate-900 p-6 shadow-2xl border border-slate-200 dark:border-slate-800"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Assign to Pet</h2>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
            {foodItem.brand ? `${foodItem.brand} ` : ''}{foodItem.name}
          </p>
        </div>

        {error && (
          <div className="mb-4 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 px-4 py-3 text-sm text-red-700 dark:text-red-400">
            {error}
          </div>
        )}

        <div className="space-y-5">
          {/* Pet Selection */}
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-3">
              Select Pet <span className="text-red-500">*</span>
            </label>
            <div className="space-y-2">
              {pets.map((pet) => (
                <button
                  key={pet.id}
                  type="button"
                  onClick={() => setSelectedPetId(pet.id)}
                  className={`w-full flex items-center gap-3 p-4 rounded-lg border-2 transition-all ${
                    selectedPetId === pet.id
                      ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20'
                      : 'border-slate-300 dark:border-slate-700 hover:border-slate-400 dark:hover:border-slate-600'
                  }`}
                >
                  {pet.photo_url ? (
                    <img
                      src={pet.photo_url}
                      alt={pet.name}
                      className="w-12 h-12 rounded-full object-cover"
                    />
                  ) : (
                    <div className="w-12 h-12 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-2xl">
                      {pet.species === 'dog' ? '🐕' : '🐈'}
                    </div>
                  )}
                  <div className="text-left">
                    <div className={`font-semibold ${selectedPetId === pet.id ? 'text-emerald-700 dark:text-emerald-400' : 'text-slate-900 dark:text-white'}`}>
                      {pet.name}
                    </div>
                    <div className="text-sm text-slate-600 dark:text-slate-400 capitalize">
                      {pet.species}
                    </div>
                  </div>
                  {selectedPetId === pet.id && (
                    <div className="ml-auto text-emerald-600 dark:text-emerald-400 text-xl">✓</div>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Feeding Schedule */}
          <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-4 space-y-4">
            <div className="text-sm font-semibold text-slate-700 dark:text-slate-300">
              Feeding Schedule
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-slate-600 dark:text-slate-400 mb-2">
                  {foodItem.serving_unit}s per meal <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  step="0.5"
                  min="0.5"
                  value={servingsPerMeal}
                  onChange={(e) => setServingsPerMeal(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-3 text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-sm text-slate-600 dark:text-slate-400 mb-2">
                  Meals per day <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  min="1"
                  value={mealsPerDay}
                  onChange={(e) => setMealsPerDay(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-3 text-slate-900 dark:text-white"
                />
              </div>
            </div>

            {/* Preview */}
            {servingsPerMeal && mealsPerDay && (
              <div className="pt-3 border-t border-slate-200 dark:border-slate-700">
                <div className="text-sm text-slate-600 dark:text-slate-400">
                  Total per day:{' '}
                  <span className="font-semibold text-slate-900 dark:text-white">
                    {(parseFloat(servingsPerMeal || '0') * parseInt(mealsPerDay || '0')).toFixed(1)} {foodItem.serving_unit}s
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="mt-6 flex gap-3">
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
            {saving ? 'Creating...' : 'Create Feeding Plan'}
          </button>
        </div>
      </div>
    </div>
  )
}
