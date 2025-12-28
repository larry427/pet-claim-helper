import React, { useEffect, useState, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import AddFoodEntryModal from './AddFoodEntryModal'
import EditFoodEntryModal from './EditFoodEntryModal'
import RefillFoodModal from './RefillFoodModal'

type FoodEntry = {
  id: string
  pet_id: string
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
  created_at: string
}

type Pet = {
  id: string
  name: string
  species: string
  photo_url: string | null
}

type PetFoodStats = {
  pet: Pet
  entry: FoodEntry
  totalCups: number
  daysPerBag: number
  costPerDay: number
  costPerWeek: number
  costPerMonth: number
  costPerYear: number
  daysLeft: number
  reorderDate: string
  statusColor: '🟢' | '🟡' | '🔴'
  hasGap?: boolean
  gapDays?: number
  daysUntilDelivery?: number
}

const CUPS_PER_LB = {
  dry: 4,
  wet: 2,
  'freeze-dried': 9,
  raw: 2,
  cooked: 2.5
}

type FoodTrackingDashboardProps = {
  userId: string
  // Optional props for when used within CategorySection
  isWrapped?: boolean
  onMonthChange?: (month: Date) => void
  onTotalCalculated?: (total: number, petCount: number, daysInMonth: number) => void
}

export default function FoodTrackingDashboard({
  userId,
  isWrapped = false,
  onMonthChange,
  onTotalCalculated
}: FoodTrackingDashboardProps) {
  const [loading, setLoading] = useState(true)
  const [foodEntries, setFoodEntries] = useState<FoodEntry[]>([])
  const [pets, setPets] = useState<Pet[]>([])
  const [treats, setTreats] = useState<any[]>([])
  const [showAddFood, setShowAddFood] = useState(false)
  const [editingEntry, setEditingEntry] = useState<{ entry: FoodEntry; petName: string } | null>(null)
  const [refillingEntry, setRefillingEntry] = useState<{ entryId: string; petName: string; foodName: string; currentCost: number } | null>(null)

  // Month selection state
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date()
    return new Date(now.getFullYear(), now.getMonth(), 1)
  })

  const loadData = async () => {
    setLoading(true)
    try {
      const [entriesRes, petsRes, treatsRes] = await Promise.all([
        supabase.from('food_entries').select('*').order('created_at', { ascending: false }),
        supabase.from('pets').select('id, name, species, photo_url').eq('user_id', userId),
        supabase
          .from('expenses')
          .select('*')
          .eq('user_id', userId)
          .eq('category', 'food')
          .eq('subcategory', 'treats')
      ])

      if (entriesRes.error) throw entriesRes.error
      if (petsRes.error) throw petsRes.error
      if (treatsRes.error) throw treatsRes.error

      setFoodEntries((entriesRes.data || []) as FoodEntry[])
      setPets((petsRes.data || []) as Pet[])
      setTreats(treatsRes.data || [])
    } catch (error: any) {
      console.error('Error loading food tracking data:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (userId) loadData()
  }, [userId])

  const petFoodStats = useMemo(() => {
    const stats: PetFoodStats[] = []
    const today = new Date()

    foodEntries.forEach(entry => {
      const pet = pets.find(p => p.id === entry.pet_id)
      if (!pet) return

      // Calculations
      const cupsPerLb = CUPS_PER_LB[entry.food_type]
      const totalCups = entry.bag_size_lbs * cupsPerLb
      const daysPerBag = totalCups / entry.cups_per_day
      const costPerDay = entry.bag_cost / daysPerBag
      const costPerWeek = costPerDay * 7
      const costPerMonth = costPerDay * 30
      const costPerYear = costPerDay * 365

      // Days left calculation
      const startDate = new Date(entry.start_date)
      const daysSinceStart = Math.floor((today.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24))
      const daysLeft = Math.max(0, Math.floor(daysPerBag - daysSinceStart))

      // Reorder date (5-day buffer)
      const reorderDays = Math.max(0, daysLeft - 5)
      const reorderDate = new Date()
      reorderDate.setDate(reorderDate.getDate() + reorderDays)

      // Status color - realistic shipping times
      let statusColor: '🟢' | '🟡' | '🔴' = '🟢'
      if (daysLeft < 3) statusColor = '🔴'
      else if (daysLeft < 7) statusColor = '🟡'

      // Gap detection for subscriptions
      let hasGap = false
      let gapDays: number | undefined
      let daysUntilDelivery: number | undefined

      if (entry.is_subscription && entry.next_delivery_date) {
        const deliveryDate = new Date(entry.next_delivery_date)
        daysUntilDelivery = Math.ceil((deliveryDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))

        if (daysLeft < daysUntilDelivery) {
          hasGap = true
          gapDays = daysUntilDelivery - daysLeft
        }
      }

      stats.push({
        pet,
        entry,
        totalCups,
        daysPerBag: Math.floor(daysPerBag),
        costPerDay,
        costPerWeek,
        costPerMonth,
        costPerYear,
        daysLeft,
        reorderDate: reorderDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
        statusColor,
        hasGap,
        gapDays,
        daysUntilDelivery
      })
    })

    return stats
  }, [foodEntries, pets])

  // Group food entries by pet
  const petGroups = useMemo(() => {
    const groups = new Map<string, { pet: Pet; stats: PetFoodStats[]; total: number }>()

    petFoodStats.forEach(stat => {
      const existing = groups.get(stat.pet.id)
      if (existing) {
        existing.stats.push(stat)
        existing.total += stat.costPerMonth
      } else {
        groups.set(stat.pet.id, {
          pet: stat.pet,
          stats: [stat],
          total: stat.costPerMonth
        })
      }
    })

    return Array.from(groups.values())
  }, [petFoodStats])

  const householdTotal = useMemo(() => {
    // Get days in selected month
    const year = selectedMonth.getFullYear()
    const month = selectedMonth.getMonth()
    const daysInMonth = new Date(year, month + 1, 0).getDate()

    // Food cost: consumption-based (cost per day × days in month)
    const foodTotal = petFoodStats.reduce((sum, stat) => sum + (stat.costPerDay * daysInMonth), 0)

    // Treats cost: actual purchases in selected month
    const treatsTotal = treats
      .filter(treat => {
        const purchaseDate = new Date(treat.purchase_date)
        return purchaseDate.getFullYear() === year && purchaseDate.getMonth() === month
      })
      .reduce((sum, treat) => sum + treat.amount, 0)

    const total = foodTotal + treatsTotal

    // Notify parent component of total if callback provided
    if (onTotalCalculated) {
      onTotalCalculated(total, petGroups.length, daysInMonth)
    }

    return total
  }, [petFoodStats, treats, selectedMonth, onTotalCalculated, petGroups.length])

  const alertCount = useMemo(() => {
    return petFoodStats.filter(stat => stat.statusColor === '🟡' || stat.statusColor === '🔴' || stat.hasGap).length
  }, [petFoodStats])

  const gapAlerts = useMemo(() => {
    return petFoodStats.filter(stat => stat.hasGap)
  }, [petFoodStats])

  // All pets are available for adding food (multiple foods per pet allowed)
  const availablePets = pets

  // Month navigation handlers
  const handlePreviousMonth = () => {
    setSelectedMonth(prev => {
      const newDate = new Date(prev)
      newDate.setMonth(newDate.getMonth() - 1)
      if (onMonthChange) onMonthChange(newDate)
      return newDate
    })
  }

  const handleNextMonth = () => {
    setSelectedMonth(prev => {
      const newDate = new Date(prev)
      newDate.setMonth(newDate.getMonth() + 1)
      if (onMonthChange) onMonthChange(newDate)
      return newDate
    })
  }

  const handleDelete = async (entryId: string, petName: string) => {
    if (!confirm(`Remove food entry for ${petName}? This cannot be undone.`)) return

    try {
      const { error } = await supabase
        .from('food_entries')
        .delete()
        .eq('id', entryId)

      if (error) throw error

      loadData()
    } catch (error: any) {
      alert('Failed to delete food entry: ' + (error?.message || 'Unknown error'))
    }
  }

  const getDaysLeftColor = (days: number) => {
    if (days >= 7) return 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 border-green-200 dark:border-green-800'
    if (days >= 3) return 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800'
    return 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 border-red-200 dark:border-red-800'
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-slate-500">Loading food tracking...</div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header - Only show if not wrapped */}
      {!isWrapped && (
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Food Tracking</h2>
            <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
              Know what you're spending. Know when to reorder. Never run out.
            </p>
          </div>
          <button
            onClick={() => setShowAddFood(true)}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-colors"
          >
            <span className="text-xl">+</span>
            Add Food
          </button>
        </div>
      )}

      {/* Alert Summary - Premium Banner */}
      {alertCount > 0 && (
        <div className="relative bg-gradient-to-r from-amber-500 to-orange-500 rounded-2xl p-[2px] shadow-xl">
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-4">
            <div className="flex items-center gap-3">
              <div className="relative">
                <span className="text-3xl">⚠️</span>
                <span className="absolute -top-1 -right-1 flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-amber-500"></span>
                </span>
              </div>
              <div className="flex-1">
                <div className="text-xs font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400 mb-1">
                  Action Needed
                </div>
                <div className="font-bold text-slate-900 dark:text-white mb-2">
                  {alertCount} {alertCount === 1 ? 'alert' : 'alerts'}
                </div>
                {gapAlerts.length > 0 && (
                  <div className="space-y-1">
                    {gapAlerts.map(stat => (
                      <div key={stat.entry.id} className="text-sm text-slate-700 dark:text-slate-300">
                        ⚠️ <strong>{stat.entry.food_name}</strong> for <strong>{stat.pet.name}</strong> will run out {stat.gapDays} {stat.gapDays === 1 ? 'day' : 'days'} before delivery - consider ordering a bridge supply
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Pet Food Cards - Grouped by Pet */}
      {petGroups.length === 0 ? (
        <div className="text-center py-12 bg-slate-50 dark:bg-slate-800/50 rounded-xl border-2 border-dashed border-slate-300 dark:border-slate-700">
          <div className="text-4xl mb-3">🍖</div>
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">No food entries yet</h3>
          <p className="text-slate-600 dark:text-slate-400 mb-4">Start tracking your pet food costs</p>
          <button
            onClick={() => setShowAddFood(true)}
            className="px-6 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-colors"
          >
            Add Your First Food Entry
          </button>
        </div>
      ) : (
        <div className="space-y-8">
          {petGroups.map((group) => (
            <div key={group.pet.id} className="space-y-4">
              {/* Pet Header */}
              <div className="flex items-center gap-3">
                {group.pet.photo_url ? (
                  <img
                    src={group.pet.photo_url}
                    alt={group.pet.name}
                    className="w-16 h-16 rounded-full object-cover border-2 border-slate-200 dark:border-slate-700 shadow-md"
                  />
                ) : (
                  <div className="w-16 h-16 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center text-3xl border-2 border-slate-200 dark:border-slate-700 shadow-md">
                    {group.pet.species === 'dog' ? '🐕' : '🐈'}
                  </div>
                )}
                <div>
                  <h3 className="text-2xl font-bold text-slate-900 dark:text-white">{group.pet.name}</h3>
                  <p className="text-sm text-slate-600 dark:text-slate-400 capitalize">
                    {group.stats.length} food {group.stats.length === 1 ? 'item' : 'items'} • ${group.total.toFixed(2)}/month
                  </p>
                </div>
              </div>

              {/* Food Cards for this Pet */}
              <div className="grid gap-4 md:grid-cols-2 pl-0 sm:pl-20">
                {group.stats.map((stat) => (
            <div
              key={stat.entry.id}
              className="relative bg-white dark:bg-slate-800 rounded-2xl p-6 shadow-lg border border-slate-200 dark:border-slate-700 hover:shadow-xl transition-all duration-300 hover:scale-[1.02] overflow-hidden"
            >
              {/* Subtle gradient background */}
              <div className="absolute inset-0 bg-gradient-to-br from-emerald-50/30 via-transparent to-transparent dark:from-emerald-900/10 pointer-events-none" />

              {/* Food Header with Edit/Delete buttons */}
              <div className="relative flex items-center gap-3 mb-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h4 className="font-semibold text-slate-900 dark:text-white truncate" title={stat.entry.food_name}>
                      {stat.entry.food_name}
                    </h4>
                    {stat.entry.is_subscription && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400 text-xs font-semibold">
                        📦 Sub
                      </span>
                    )}
                    {stat.entry.reorder_url && (
                      <a
                        href={stat.entry.reorder_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300 transition-colors flex-shrink-0"
                        title={stat.entry.is_subscription ? "Manage subscription" : "Reorder"}
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                        </svg>
                      </a>
                    )}
                  </div>
                </div>
                <div className="flex gap-2 flex-shrink-0">
                  <button
                    onClick={() => setRefillingEntry({
                      entryId: stat.entry.id,
                      petName: stat.pet.name,
                      foodName: stat.entry.food_name,
                      currentCost: stat.entry.bag_cost
                    })}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white text-xs font-semibold shadow-sm hover:shadow-md transition-all duration-200"
                    title="Mark as refilled"
                  >
                    <span>🛒</span>
                    <span className="hidden xs:inline sm:inline">Bought More</span>
                    <span className="xs:hidden sm:hidden">Refill</span>
                  </button>
                  <button
                    onClick={() => setEditingEntry({ entry: stat.entry, petName: stat.pet.name })}
                    className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors text-slate-600 dark:text-slate-400"
                    title="Edit food entry"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                    </svg>
                  </button>
                  <button
                    onClick={() => handleDelete(stat.entry.id, stat.pet.name)}
                    className="p-2 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors text-red-600 dark:text-red-400"
                    title="Delete food entry"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              </div>

              {/* Status Light + Days Left - Premium Design */}
              <div className={`relative rounded-xl p-5 mb-4 border-2 ${getDaysLeftColor(stat.daysLeft)} overflow-hidden`}>
                {/* Subtle gradient overlay for depth */}
                <div className="absolute inset-0 bg-gradient-to-br from-white/50 to-transparent dark:from-white/5 pointer-events-none" />

                <div className="relative">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      {/* Pulsing status indicator */}
                      <div className="relative">
                        <span className="text-3xl">{stat.statusColor}</span>
                        {stat.daysLeft < 3 && (
                          <span className="absolute -top-1 -right-1 flex h-3 w-3">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
                          </span>
                        )}
                      </div>
                      <div>
                        <div className="text-xs font-bold uppercase tracking-wider mb-1 opacity-75">
                          {stat.daysLeft < 3 ? '⚠️ Running Out' : stat.daysLeft < 7 ? '⏰ Getting Low' : '✓ All Good'}
                        </div>
                        <div className="text-sm font-semibold">
                          {stat.daysLeft < 3 ? 'Order Now' : stat.daysLeft < 7 ? 'Order Soon' : 'Plenty Left'}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-baseline gap-2 mb-2">
                    <span className="text-4xl font-black tracking-tight">
                      {stat.daysLeft}
                    </span>
                    <span className="text-lg font-medium opacity-75">
                      {stat.daysLeft === 1 ? 'day' : 'days'} left
                    </span>
                  </div>

                  <div className="space-y-1">
                    <div className="flex items-center gap-2 text-xs sm:text-sm opacity-90">
                      <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                      <span className="break-words">Reorder by <strong className="whitespace-nowrap">{stat.reorderDate}</strong></span>
                    </div>
                    {stat.entry.is_subscription && stat.entry.next_delivery_date && (
                      <div className="flex items-center gap-2 text-xs sm:text-sm opacity-90">
                        <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                        </svg>
                        <span className="break-words">Next delivery: <strong className="whitespace-nowrap">{new Date(stat.entry.next_delivery_date).toLocaleDateString()}</strong></span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Gap Alert Banner */}
              {stat.hasGap && stat.gapDays && (
                <div className="relative bg-gradient-to-r from-red-500 to-orange-500 rounded-xl p-[2px] mb-4 shadow-lg">
                  <div className="bg-gradient-to-r from-red-50 to-orange-50 dark:from-red-950 dark:to-orange-950 rounded-xl p-4">
                    <div className="flex items-start gap-3">
                      <div className="relative flex-shrink-0">
                        <span className="text-2xl">⚠️</span>
                        <span className="absolute -top-1 -right-1 flex h-2 w-2">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
                        </span>
                      </div>
                      <div>
                        <div className="text-xs font-bold uppercase tracking-wider text-red-700 dark:text-red-400 mb-1">
                          ORDER SOON
                        </div>
                        <div className="text-sm font-bold text-red-900 dark:text-red-300">
                          You'll run out <strong>{stat.gapDays} {stat.gapDays === 1 ? 'day' : 'days'}</strong> before your delivery arrives
                        </div>
                        <div className="text-xs text-red-700 dark:text-red-400 mt-1">
                          Consider ordering a bridge supply to avoid running out
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Cost Breakdown - Premium Grid */}
              <div className="relative grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
                <div className="relative bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-700/50 dark:to-slate-700/30 rounded-xl p-2.5 sm:p-3 text-center shadow-sm">
                  <div className="text-xs text-slate-600 dark:text-slate-400 mb-1 font-medium">Per Day</div>
                  <div className="text-sm font-bold text-slate-900 dark:text-white">
                    ${stat.costPerDay.toFixed(2)}
                  </div>
                </div>
                <div className="relative bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-700/50 dark:to-slate-700/30 rounded-xl p-2.5 sm:p-3 text-center shadow-sm">
                  <div className="text-xs text-slate-600 dark:text-slate-400 mb-1 font-medium">Per Week</div>
                  <div className="text-sm font-bold text-slate-900 dark:text-white">
                    ${stat.costPerWeek.toFixed(2)}
                  </div>
                </div>
                <div className="relative bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-xl p-2.5 sm:p-3 text-center shadow-md">
                  <div className="text-xs text-emerald-50 mb-1 font-semibold">Per Month</div>
                  <div className="text-sm font-bold text-white">
                    ${stat.costPerMonth.toFixed(2)}
                  </div>
                </div>
                <div className="relative bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-700/50 dark:to-slate-700/30 rounded-xl p-2.5 sm:p-3 text-center shadow-sm">
                  <div className="text-xs text-slate-600 dark:text-slate-400 mb-1 font-medium">Per Year</div>
                  <div className="text-sm font-bold text-slate-900 dark:text-white">
                    ${stat.costPerYear.toFixed(0)}
                  </div>
                </div>
              </div>

            </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Food & Consumables Total - Only show if not wrapped */}
      {!isWrapped && petFoodStats.length > 0 && (
        <div className="relative bg-gradient-to-br from-emerald-500 via-emerald-600 to-teal-600 rounded-2xl p-[2px] shadow-2xl hover:shadow-emerald-500/50 transition-all duration-300">
          <div className="relative bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-2xl p-8">
            <div className="flex items-center justify-between gap-8">
              {/* Left Side: Content */}
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <div className="text-sm font-bold text-emerald-100 uppercase tracking-wider">
                    Food & Consumables
                  </div>
                </div>

                {/* Month Navigation */}
                <div className="flex items-center gap-4 mb-3">
                  <button
                    onClick={handlePreviousMonth}
                    className="p-1 hover:bg-emerald-700/50 rounded transition-colors"
                    aria-label="Previous month"
                  >
                    <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                  </button>
                  <div className="text-xl font-bold text-white min-w-[180px] text-center">
                    {selectedMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                  </div>
                  <button
                    onClick={handleNextMonth}
                    className="p-1 hover:bg-emerald-700/50 rounded transition-colors"
                    aria-label="Next month"
                  >
                    <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                </div>

                <div className="text-5xl font-black text-white mb-1">
                  ${householdTotal.toFixed(2)}
                </div>
                <div className="text-sm text-emerald-100 font-medium">
                  {petGroups.length} {petGroups.length === 1 ? 'pet' : 'pets'} • ${(householdTotal / new Date(selectedMonth.getFullYear(), selectedMonth.getMonth() + 1, 0).getDate()).toFixed(2)}/day
                </div>
              </div>

              {/* Right Side: PCH Logo */}
              <div className="flex-shrink-0 flex items-center">
                <div className="bg-white rounded-2xl p-4 shadow-lg">
                  <img
                    src="/pch-logo.png"
                    alt="Pet Cost Helper"
                    className="w-[180px] h-[180px]"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modals */}
      {showAddFood && (
        <AddFoodEntryModal
          availablePets={availablePets}
          onClose={() => setShowAddFood(false)}
          onComplete={() => {
            setShowAddFood(false)
            loadData()
          }}
        />
      )}

      {editingEntry && (
        <EditFoodEntryModal
          entry={editingEntry.entry}
          petName={editingEntry.petName}
          onClose={() => setEditingEntry(null)}
          onComplete={() => {
            setEditingEntry(null)
            loadData()
          }}
        />
      )}

      {refillingEntry && (
        <RefillFoodModal
          entryId={refillingEntry.entryId}
          petName={refillingEntry.petName}
          foodName={refillingEntry.foodName}
          currentCost={refillingEntry.currentCost}
          onClose={() => setRefillingEntry(null)}
          onComplete={() => {
            setRefillingEntry(null)
            loadData()
          }}
        />
      )}
    </div>
  )
}
