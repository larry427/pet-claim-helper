import React, { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { Expense } from '../types/expenses'

type Pet = {
  id: string
  name: string
  species: string
  photo_url: string | null
}

type Props = {
  pets: Pet[]
  userId: string
  editTreat?: Expense | null
  onClose: () => void
  onComplete: () => void
}

export default function AddTreatModal({ pets, userId, editTreat = null, onClose, onComplete }: Props) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [petId, setPetId] = useState<string | null>(editTreat?.pet_id || pets[0]?.id || null)
  const [treatName, setTreatName] = useState(editTreat?.item_name || '')
  const [cost, setCost] = useState(editTreat?.amount.toString() || '')
  const [purchaseDate, setPurchaseDate] = useState(editTreat?.purchase_date || new Date().toISOString().split('T')[0])
  const [vendor, setVendor] = useState(editTreat?.vendor || '')
  const [isSubscription, setIsSubscription] = useState(editTreat?.is_subscription || false)
  const [frequency, setFrequency] = useState<'weekly' | 'bi-weekly' | 'monthly'>(
    editTreat?.subscription_frequency_days === 7
      ? 'weekly'
      : editTreat?.subscription_frequency_days === 14
      ? 'bi-weekly'
      : 'monthly'
  )
  const [reorderUrl, setReorderUrl] = useState(editTreat?.reorder_url || '')

  const handleSubmit = async () => {
    setError(null)

    if (!treatName.trim()) {
      setError('Please enter a treat name')
      return
    }
    if (!cost || parseFloat(cost) <= 0) {
      setError('Please enter a valid cost')
      return
    }
    if (!purchaseDate) {
      setError('Please select a purchase date')
      return
    }

    setSaving(true)

    try {
      const frequencyDays = isSubscription
        ? frequency === 'weekly'
          ? 7
          : frequency === 'bi-weekly'
          ? 14
          : 30
        : null

      const data = {
        user_id: userId,
        pet_id: petId, // null for "All Pets"
        category: 'food' as const,
        subcategory: 'treats',
        item_name: treatName.trim(),
        amount: parseFloat(cost),
        purchase_date: purchaseDate,
        vendor: vendor.trim() || null,
        is_subscription: isSubscription,
        subscription_frequency_days: frequencyDays,
        reorder_url: isSubscription && reorderUrl.trim() ? reorderUrl.trim() : null
      }

      if (editTreat) {
        // Update existing treat
        const { error: updateError } = await supabase
          .from('expenses')
          .update(data)
          .eq('id', editTreat.id)

        if (updateError) throw updateError
      } else {
        // Insert new treat
        const { error: insertError } = await supabase
          .from('expenses')
          .insert(data)

        if (insertError) throw insertError
      }

      onComplete()
    } catch (e: any) {
      setError(e?.message || 'Failed to save treat entry')
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl bg-white dark:bg-slate-900 p-6 shadow-2xl border border-slate-200 dark:border-slate-800"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white">
            {editTreat ? 'Edit Treat Purchase' : 'Add Treat Purchase'}
          </h2>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
            Track treats and consumables
          </p>
        </div>

        {error && (
          <div className="mb-4 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 px-4 py-3 text-sm text-red-700 dark:text-red-400">
            {error}
          </div>
        )}

        <div className="space-y-4 mb-6">
          {/* Pet Selection */}
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Pet <span className="text-red-500">*</span>
            </label>
            <select
              value={petId || 'all'}
              onChange={(e) => setPetId(e.target.value === 'all' ? null : e.target.value)}
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-3 text-slate-900 dark:text-white"
            >
              <option value="all">All Pets / Household</option>
              {pets.map(pet => (
                <option key={pet.id} value={pet.id}>{pet.name}</option>
              ))}
            </select>
          </div>

          {/* Treat Name */}
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Treat Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={treatName}
              onChange={(e) => setTreatName(e.target.value)}
              placeholder="e.g., Bully Sticks, Training Treats"
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
                value={cost}
                onChange={(e) => setCost(e.target.value)}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 pl-8 pr-4 py-3 text-slate-900 dark:text-white"
              />
            </div>
          </div>

          {/* Purchase Date */}
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

          {/* Vendor */}
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Vendor (Optional)
            </label>
            <input
              type="text"
              value={vendor}
              onChange={(e) => setVendor(e.target.value)}
              placeholder="e.g., Amazon, PetSmart, Chewy"
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-3 text-slate-900 dark:text-white"
            />
          </div>

          {/* Subscription */}
          <div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={isSubscription}
                onChange={(e) => setIsSubscription(e.target.checked)}
                className="w-4 h-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
              />
              <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                This is a subscription
              </span>
            </label>
          </div>

          {isSubscription && (
            <>
              {/* Frequency */}
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  Frequency
                </label>
                <select
                  value={frequency}
                  onChange={(e) => setFrequency(e.target.value as 'weekly' | 'bi-weekly' | 'monthly')}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-3 text-slate-900 dark:text-white"
                >
                  <option value="weekly">Weekly</option>
                  <option value="bi-weekly">Every 2 Weeks</option>
                  <option value="monthly">Monthly</option>
                </select>
              </div>

              {/* Reorder URL */}
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  Reorder URL (Optional)
                </label>
                <input
                  type="url"
                  value={reorderUrl}
                  onChange={(e) => setReorderUrl(e.target.value)}
                  placeholder="https://..."
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-3 text-slate-900 dark:text-white"
                />
              </div>
            </>
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
            {saving ? (editTreat ? 'Saving...' : 'Adding...') : (editTreat ? 'Save Changes' : 'Add Treat')}
          </button>
        </div>
      </div>
    </div>
  )
}
