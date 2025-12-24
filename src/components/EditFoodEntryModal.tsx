import React, { useState } from 'react'
import { supabase } from '../lib/supabase'

type FoodEntry = {
  id: string
  food_name: string
  food_type: 'dry' | 'wet' | 'freeze-dried' | 'raw' | 'cooked'
  bag_size_lbs: number
  bag_cost: number
  cups_per_day: number
  start_date: string
  is_subscription: boolean
  subscription_frequency_days: number | null
  next_delivery_date: string | null
  reorder_url: string | null
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
  'freeze-dried': 9,
  raw: 2,
  cooked: 2.5
}

export default function EditFoodEntryModal({ entry, petName, onClose, onComplete }: Props) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [foodName, setFoodName] = useState(entry.food_name)
  const [foodType, setFoodType] = useState<'dry' | 'wet' | 'freeze-dried' | 'raw' | 'cooked'>(entry.food_type)
  const [weightEntryType, setWeightEntryType] = useState<'lbs' | 'oz' | 'cans' | 'bags'>('lbs')
  const [bagSize, setBagSize] = useState(entry.bag_size_lbs.toString())
  const [canQty, setCanQty] = useState('')
  const [canOz, setCanOz] = useState('')
  const [bagQty, setBagQty] = useState('')
  const [bagLbs, setBagLbs] = useState('')
  const [bagCost, setBagCost] = useState(entry.bag_cost.toString())
  const [cupsPerDay, setCupsPerDay] = useState(entry.cups_per_day.toString())
  const [startDate, setStartDate] = useState(entry.start_date)
  const [isSubscription, setIsSubscription] = useState(entry.is_subscription)
  const [subscriptionFrequency, setSubscriptionFrequency] = useState(entry.subscription_frequency_days?.toString() || '28')
  const [nextDeliveryDate, setNextDeliveryDate] = useState(entry.next_delivery_date || '')
  const [reorderUrl, setReorderUrl] = useState(entry.reorder_url || '')

  // Calculate total lbs based on entry type
  const calculateTotalLbs = () => {
    switch (weightEntryType) {
      case 'lbs':
        return parseFloat(bagSize) || 0
      case 'oz':
        return (parseFloat(bagSize) || 0) / 16
      case 'cans':
        return ((parseFloat(canQty) || 0) * (parseFloat(canOz) || 0)) / 16
      case 'bags':
        return (parseFloat(bagQty) || 0) * (parseFloat(bagLbs) || 0)
      default:
        return 0
    }
  }

  const totalLbs = calculateTotalLbs()

  const handleSubmit = async () => {
    setError(null)

    if (!foodName.trim()) {
      setError('Please enter a food name')
      return
    }
    if (totalLbs <= 0) {
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
          bag_size_lbs: totalLbs,
          bag_cost: parseFloat(bagCost),
          cups_per_day: parseFloat(cupsPerDay),
          start_date: startDate,
          is_subscription: isSubscription,
          subscription_frequency_days: isSubscription ? parseInt(subscriptionFrequency) : null,
          next_delivery_date: isSubscription && nextDeliveryDate ? nextDeliveryDate : null,
          reorder_url: reorderUrl.trim() || null
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
    const cost = parseFloat(bagCost)
    const cups = parseFloat(cupsPerDay)

    if (totalLbs <= 0 || !cost || !cups) return null

    const totalCups = totalLbs * CUPS_PER_LB[foodType]
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
                onChange={(e) => setFoodType(e.target.value as 'dry' | 'wet' | 'freeze-dried' | 'raw' | 'cooked')}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-3 text-slate-900 dark:text-white"
              >
                <option value="dry">Dry Kibble ({CUPS_PER_LB.dry} cups/lb)</option>
                <option value="wet">Wet/Canned ({CUPS_PER_LB.wet} cups/lb)</option>
                <option value="freeze-dried">Freeze-Dried ({CUPS_PER_LB['freeze-dried']} cups/lb)</option>
                <option value="raw">Raw ({CUPS_PER_LB.raw} cups/lb)</option>
                <option value="cooked">Cooked - Ollie, JustFoodForDogs, etc. ({CUPS_PER_LB.cooked} cups/lb)</option>
              </select>
            </div>

            {/* Bag Size - Flexible Entry */}
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                Bag Size <span className="text-red-500">*</span>
              </label>

              {/* Entry Type Selector */}
              <select
                value={weightEntryType}
                onChange={(e) => setWeightEntryType(e.target.value as 'lbs' | 'oz' | 'cans' | 'bags')}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-3 text-slate-900 dark:text-white mb-3"
              >
                <option value="lbs">Pounds</option>
                <option value="oz">Ounces</option>
                <option value="cans">Cans (quantity × oz per can)</option>
                <option value="bags">Bags/Boxes (quantity × lbs per bag)</option>
              </select>

              {/* Input Fields Based on Type */}
              {weightEntryType === 'lbs' && (
                <input
                  type="number"
                  step="0.1"
                  min="0.1"
                  placeholder="30"
                  value={bagSize}
                  onChange={(e) => setBagSize(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-3 text-slate-900 dark:text-white placeholder-slate-400"
                />
              )}

              {weightEntryType === 'oz' && (
                <input
                  type="number"
                  step="0.1"
                  min="0.1"
                  placeholder="12"
                  value={bagSize}
                  onChange={(e) => setBagSize(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-3 text-slate-900 dark:text-white placeholder-slate-400"
                />
              )}

              {weightEntryType === 'cans' && (
                <div className="flex gap-3">
                  <input
                    type="number"
                    step="1"
                    min="1"
                    placeholder="24"
                    value={canQty}
                    onChange={(e) => setCanQty(e.target.value)}
                    className="flex-1 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-3 text-slate-900 dark:text-white placeholder-slate-400"
                  />
                  <span className="flex items-center text-slate-600 dark:text-slate-400">×</span>
                  <input
                    type="number"
                    step="0.1"
                    min="0.1"
                    placeholder="5.5"
                    value={canOz}
                    onChange={(e) => setCanOz(e.target.value)}
                    className="flex-1 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-3 text-slate-900 dark:text-white placeholder-slate-400"
                  />
                  <span className="flex items-center text-slate-600 dark:text-slate-400 text-sm">oz</span>
                </div>
              )}

              {weightEntryType === 'bags' && (
                <div className="flex gap-3">
                  <input
                    type="number"
                    step="1"
                    min="1"
                    placeholder="3"
                    value={bagQty}
                    onChange={(e) => setBagQty(e.target.value)}
                    className="flex-1 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-3 text-slate-900 dark:text-white placeholder-slate-400"
                  />
                  <span className="flex items-center text-slate-600 dark:text-slate-400">×</span>
                  <input
                    type="number"
                    step="0.1"
                    min="0.1"
                    placeholder="2"
                    value={bagLbs}
                    onChange={(e) => setBagLbs(e.target.value)}
                    className="flex-1 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-3 text-slate-900 dark:text-white placeholder-slate-400"
                  />
                  <span className="flex items-center text-slate-600 dark:text-slate-400 text-sm">lbs</span>
                </div>
              )}

              {/* Calculated Total */}
              {totalLbs > 0 && (
                <div className="mt-2 text-sm text-emerald-600 dark:text-emerald-400 font-medium">
                  = {totalLbs.toFixed(2)} lbs total
                </div>
              )}
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

            {/* Subscription Toggle */}
            <div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isSubscription}
                  onChange={(e) => setIsSubscription(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-300 dark:border-slate-700 text-emerald-600 focus:ring-emerald-500"
                />
                <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                  This is a subscription
                </span>
              </label>
            </div>

            {/* Subscription Details (conditional) */}
            {isSubscription && (
              <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-4 space-y-4 border border-slate-200 dark:border-slate-700">
                <div className="grid grid-cols-2 gap-4">
                  {/* Delivery Frequency */}
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                      Delivery Frequency
                    </label>
                    <select
                      value={subscriptionFrequency}
                      onChange={(e) => setSubscriptionFrequency(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2.5 text-slate-900 dark:text-white text-sm"
                    >
                      <option value="14">Every 2 weeks</option>
                      <option value="21">Every 3 weeks</option>
                      <option value="28">Every 4 weeks</option>
                      <option value="42">Every 6 weeks</option>
                      <option value="56">Every 8 weeks</option>
                    </select>
                  </div>

                  {/* Next Delivery Date */}
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                      Next Delivery
                    </label>
                    <input
                      type="date"
                      value={nextDeliveryDate}
                      onChange={(e) => setNextDeliveryDate(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2.5 text-slate-900 dark:text-white text-sm"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Reorder/Account Link */}
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                {isSubscription ? 'Subscription Account Link' : 'Reorder Link'} (optional)
              </label>
              <input
                type="url"
                placeholder={isSubscription ? "https://www.chewy.com/app/account/autoship" : "https://www.chewy.com/brand/product-name"}
                value={reorderUrl}
                onChange={(e) => setReorderUrl(e.target.value)}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-3 text-slate-900 dark:text-white placeholder-slate-400 text-sm"
              />
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5">
                {isSubscription
                  ? "Link to your Chewy/Amazon subscription page for easy management"
                  : "Direct link to product page for easy reordering"}
              </p>
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
