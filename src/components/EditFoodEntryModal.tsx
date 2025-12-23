import React, { useState } from 'react'
import { supabase } from '../lib/supabase'

type FoodEntry = {
  id: string
  food_name: string
  food_type: 'dry' | 'wet' | 'freeze-dried'
  bag_size_lbs: number
  bag_cost: number
  cups_per_day: number
  start_date: string
}

type Props = {
  entry: FoodEntry
  petName: string
  onClose: () => void
  onComplete: () => void
}

const CUPS_PER_LB = {
  dry: 4,
  wet: 2,
  'freeze-dried': 9
}

export default function EditFoodEntryModal({ entry, petName, onClose, onComplete }: Props) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [foodName, setFoodName] = useState(entry.food_name)
  const [foodType, setFoodType] = useState<'dry' | 'wet' | 'freeze-dried'>(entry.food_type)
  const [bagSize, setBagSize] = useState(entry.bag_size_lbs.toString())
  const [bagCost, setBagCost] = useState(entry.bag_cost.toString())
  const [cupsPerDay, setCupsPerDay] = useState(entry.cups_per_day.toString())
  const [startDate, setStartDate] = useState(entry.start_date)

  const handleSubmit = async () => {
    setError(null)

    if (!foodName.trim()) {
      setError('Please enter a food name')
      return
    }
    if (!bagSize || parseFloat(bagSize) <= 0) {
      setError('Please enter a valid bag size')
      return
    }
    if (!bagCost || parseFloat(bagCost) <= 0) {
      setError('Please enter a valid cost')
      return
    }
    if (!cupsPerDay || parseFloat(cupsPerDay) <= 0) {
      setError('Please enter valid cups per day')
      return
    }

    setSaving(true)

    try {
      const { error: updateError } = await supabase
        .from('food_entries')
        .update({
          food_name: foodName.trim(),
          food_type: foodType,
          bag_size_lbs: parseFloat(bagSize),
          bag_cost: parseFloat(bagCost),
          cups_per_day: parseFloat(cupsPerDay),
          start_date: startDate
        })
        .eq('id', entry.id)

      if (updateError) throw updateError

      onComplete()
    } catch (e: any) {
      setError(e?.message || 'Failed to update food entry')
      setSaving(false)
    }
  }

  // Calculate preview stats
  const calculatePreview = () => {
    const size = parseFloat(bagSize)
    const cost = parseFloat(bagCost)
    const cups = parseFloat(cupsPerDay)

    if (!size || !cost || !cups) return null

    const totalCups = size * CUPS_PER_LB[foodType]
    const daysPerBag = totalCups / cups
    const costPerDay = cost / daysPerBag

    return {
      daysPerBag: Math.floor(daysPerBag),
      costPerDay,
      costPerMonth: costPerDay * 30,
      costPerYear: costPerDay * 365
    }
  }

  const preview = calculatePreview()

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="relative w-full max-w-2xl rounded-2xl bg-white dark:bg-slate-900 shadow-2xl border border-slate-200 dark:border-slate-800 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 bg-white dark:bg-slate-900 p-6 pb-4 border-b border-slate-200 dark:border-slate-700 z-10">
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Edit Food Entry</h2>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
            {petName}
          </p>
        </div>

        <div className="p-6">
          {error && (
            <div className="mb-4 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 px-4 py-3 text-sm text-red-700 dark:text-red-400">
              {error}
            </div>
          )}

          <div className="space-y-5">
            {/* Food Name */}
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                Food Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                placeholder="e.g., Purina Pro Plan 30lb"
                value={foodName}
                onChange={(e) => setFoodName(e.target.value)}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-3 text-slate-900 dark:text-white placeholder-slate-400"
              />
            </div>

            {/* Food Type */}
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                Food Type <span className="text-red-500">*</span>
              </label>
              <select
                value={foodType}
                onChange={(e) => setFoodType(e.target.value as 'dry' | 'wet' | 'freeze-dried')}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-3 text-slate-900 dark:text-white"
              >
                <option value="dry">Dry kibble ({CUPS_PER_LB.dry} cups/lb)</option>
                <option value="wet">Wet food ({CUPS_PER_LB.wet} cups/lb)</option>
                <option value="freeze-dried">Freeze-dried ({CUPS_PER_LB['freeze-dried']} cups/lb)</option>
              </select>
            </div>

            {/* Bag Size (lbs only for editing) */}
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                Bag Size (lbs) <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                step="0.1"
                min="0.1"
                placeholder="30"
                value={bagSize}
                onChange={(e) => setBagSize(e.target.value)}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-3 text-slate-900 dark:text-white placeholder-slate-400"
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
                  placeholder="45.00"
                  value={bagCost}
                  onChange={(e) => setBagCost(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 pl-8 pr-4 py-3 text-slate-900 dark:text-white placeholder-slate-400"
                />
              </div>
            </div>

            {/* Cups Per Day */}
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                Cups Per Day <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                step="0.25"
                min="0.25"
                placeholder="2.5"
                value={cupsPerDay}
                onChange={(e) => setCupsPerDay(e.target.value)}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-3 text-slate-900 dark:text-white placeholder-slate-400"
              />
            </div>

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

            {/* Preview */}
            {preview && (
              <div className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-lg p-4">
                <div className="text-sm font-semibold text-emerald-900 dark:text-emerald-400 mb-3">
                  Preview
                </div>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <div className="text-emerald-700 dark:text-emerald-400">Days per bag</div>
                    <div className="font-bold text-emerald-900 dark:text-emerald-300">{preview.daysPerBag} days</div>
                  </div>
                  <div>
                    <div className="text-emerald-700 dark:text-emerald-400">Cost per day</div>
                    <div className="font-bold text-emerald-900 dark:text-emerald-300">${preview.costPerDay.toFixed(2)}</div>
                  </div>
                  <div>
                    <div className="text-emerald-700 dark:text-emerald-400">Cost per month</div>
                    <div className="font-bold text-emerald-900 dark:text-emerald-300">${preview.costPerMonth.toFixed(2)}</div>
                  </div>
                  <div>
                    <div className="text-emerald-700 dark:text-emerald-400">Cost per year</div>
                    <div className="font-bold text-emerald-900 dark:text-emerald-300">${preview.costPerYear.toFixed(2)}</div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex gap-3 mt-6">
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
    </div>
  )
}
