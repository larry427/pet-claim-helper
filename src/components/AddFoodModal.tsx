import React, { useState } from 'react'
import { supabase } from '../lib/supabase'

type FoodItem = {
  id: string
  user_id: string
  name: string
  brand: string | null
  cost: number
  purchase_date: string
  source: string
  total_servings: number
  serving_unit: string
  created_at: string
}

type Props = {
  userId: string
  onClose: () => void
  onComplete: (foodItem: FoodItem) => void
}

export default function AddFoodModal({ userId, onClose, onComplete }: Props) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [name, setName] = useState('')
  const [brand, setBrand] = useState('')
  const [cost, setCost] = useState('')
  const [purchaseDate, setPurchaseDate] = useState(new Date().toISOString().split('T')[0])
  const [source, setSource] = useState<'subscription' | 'online' | 'store'>('online')
  const [totalServings, setTotalServings] = useState('')
  const [servingUnit, setServingUnit] = useState('scoop')

  const handleSubmit = async () => {
    setError(null)

    // Validation
    if (!name.trim()) {
      setError('Please enter a food name')
      return
    }
    if (!cost || parseFloat(cost) <= 0) {
      setError('Please enter a valid cost')
      return
    }
    if (!totalServings || parseInt(totalServings) <= 0) {
      setError('Please enter valid total servings')
      return
    }

    setSaving(true)

    try {
      const { data, error: insertError } = await supabase
        .from('food_items')
        .insert({
          user_id: userId,
          name: name.trim(),
          brand: brand.trim() || null,
          cost: parseFloat(cost),
          purchase_date: purchaseDate,
          source,
          total_servings: parseInt(totalServings),
          serving_unit: servingUnit
        })
        .select()
        .single()

      if (insertError) throw insertError

      onComplete(data as FoodItem)
    } catch (e: any) {
      setError(e?.message || 'Failed to add food item')
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="relative w-full max-w-lg rounded-2xl bg-white dark:bg-slate-900 p-6 shadow-2xl border border-slate-200 dark:border-slate-800 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Add Food Item</h2>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
            Track your pet food purchases
          </p>
        </div>

        {error && (
          <div className="mb-4 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 px-4 py-3 text-sm text-red-700 dark:text-red-400">
            {error}
          </div>
        )}

        <div className="space-y-4">
          {/* Food Name */}
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Food Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Purina Pro Plan 30lb"
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-3 text-slate-900 dark:text-white placeholder-slate-400"
            />
          </div>

          {/* Brand */}
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Brand (Optional)
            </label>
            <input
              type="text"
              value={brand}
              onChange={(e) => setBrand(e.target.value)}
              placeholder="Purina"
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-3 text-slate-900 dark:text-white placeholder-slate-400"
            />
          </div>

          {/* Cost & Purchase Date */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                Cost <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500">$</span>
                <input
                  type="number"
                  step="0.01"
                  value={cost}
                  onChange={(e) => setCost(e.target.value)}
                  placeholder="45.00"
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 pl-8 pr-4 py-3 text-slate-900 dark:text-white placeholder-slate-400"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                Purchase Date <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                value={purchaseDate}
                onChange={(e) => setPurchaseDate(e.target.value)}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-3 text-slate-900 dark:text-white"
              />
            </div>
          </div>

          {/* Source */}
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Purchase Source <span className="text-red-500">*</span>
            </label>
            <div className="grid grid-cols-3 gap-2">
              {(['subscription', 'online', 'store'] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSource(s)}
                  className={`px-4 py-3 rounded-lg border-2 transition-all ${
                    source === s
                      ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 font-semibold'
                      : 'border-slate-300 dark:border-slate-700 hover:border-slate-400 dark:hover:border-slate-600 text-slate-700 dark:text-slate-300'
                  }`}
                >
                  {s.charAt(0).toUpperCase() + s.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {/* Total Servings & Unit */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                Total Servings <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                value={totalServings}
                onChange={(e) => setTotalServings(e.target.value)}
                placeholder="60"
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-3 text-slate-900 dark:text-white placeholder-slate-400"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                Unit <span className="text-red-500">*</span>
              </label>
              <select
                value={servingUnit}
                onChange={(e) => setServingUnit(e.target.value)}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-3 text-slate-900 dark:text-white"
              >
                <option value="scoop">Scoop</option>
                <option value="cup">Cup</option>
                <option value="can">Can</option>
                <option value="portion">Portion</option>
              </select>
            </div>
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
            {saving ? 'Saving...' : 'Next: Assign to Pet'}
          </button>
        </div>
      </div>
    </div>
  )
}
