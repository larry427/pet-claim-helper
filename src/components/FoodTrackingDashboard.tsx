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
}

const CUPS_PER_LB = {
  dry: 4,
  wet: 2,
  'freeze-dried': 9,
  raw: 2,
  cooked: 2.5
}

export default function FoodTrackingDashboard({ userId }: { userId: string }) {
  const [loading, setLoading] = useState(true)
  const [foodEntries, setFoodEntries] = useState<FoodEntry[]>([])
  const [pets, setPets] = useState<Pet[]>([])
  const [showAddFood, setShowAddFood] = useState(false)
  const [editingEntry, setEditingEntry] = useState<{ entry: FoodEntry; petName: string } | null>(null)
  const [refillingEntry, setRefillingEntry] = useState<{ entryId: string; petName: string; foodName: string; currentCost: number } | null>(null)

  const loadData = async () => {
    setLoading(true)
    try {
      const [entriesRes, petsRes] = await Promise.all([
        supabase.from('food_entries').select('*').order('created_at', { ascending: false }),
        supabase.from('pets').select('id, name, species, photo_url').eq('user_id', userId)
      ])

      if (entriesRes.error) throw entriesRes.error
      if (petsRes.error) throw petsRes.error

      setFoodEntries((entriesRes.data || []) as FoodEntry[])
      setPets((petsRes.data || []) as Pet[])
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

      // Status color
      let statusColor: '🟢' | '🟡' | '🔴' = '🟢'
      if (daysLeft <= 7) statusColor = '🔴'
      else if (daysLeft <= 14) statusColor = '🟡'

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
        statusColor
      })
    })

    return stats
  }, [foodEntries, pets])

  const householdTotal = useMemo(() => {
    return petFoodStats.reduce((sum, stat) => sum + stat.costPerMonth, 0)
  }, [petFoodStats])

  const alertCount = useMemo(() => {
    return petFoodStats.filter(stat => stat.statusColor === '🟡' || stat.statusColor === '🔴').length
  }, [petFoodStats])

  const availablePets = useMemo(() => {
    return pets.filter(pet => !foodEntries.some(entry => entry.pet_id === pet.id))
  }, [pets, foodEntries])

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
    if (days > 14) return 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 border-green-200 dark:border-green-800'
    if (days >= 7) return 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800'
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
      {/* Header */}
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
              <div>
                <div className="text-xs font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400 mb-1">
                  Action Needed
                </div>
                <div className="font-bold text-slate-900 dark:text-white">
                  {alertCount} {alertCount === 1 ? 'pet needs' : 'pets need'} food reordered soon
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Pet Food Cards */}
      {petFoodStats.length === 0 ? (
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
        <div className="grid gap-4 md:grid-cols-2">
          {petFoodStats.map((stat) => (
            <div
              key={stat.entry.id}
              className="relative bg-white dark:bg-slate-800 rounded-2xl p-6 shadow-lg border border-slate-200 dark:border-slate-700 hover:shadow-xl transition-all duration-300 hover:scale-[1.02] overflow-hidden"
            >
              {/* Subtle gradient background */}
              <div className="absolute inset-0 bg-gradient-to-br from-emerald-50/30 via-transparent to-transparent dark:from-emerald-900/10 pointer-events-none" />
              {/* Pet Header with Edit/Delete buttons */}
              <div className="relative flex items-center gap-3 mb-4">
                {stat.pet.photo_url ? (
                  <img
                    src={stat.pet.photo_url}
                    alt={stat.pet.name}
                    className="w-12 h-12 rounded-full object-cover"
                  />
                ) : (
                  <div className="w-12 h-12 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center text-2xl">
                    {stat.pet.species === 'dog' ? '🐕' : '🐈'}
                  </div>
                )}
                <div className="flex-1">
                  <h3 className="font-semibold text-slate-900 dark:text-white">{stat.pet.name}</h3>
                  <p className="text-sm text-slate-600 dark:text-slate-400">
                    {stat.entry.food_name}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setRefillingEntry({
                      entryId: stat.entry.id,
                      petName: stat.pet.name,
                      foodName: stat.entry.food_name,
                      currentCost: stat.entry.bag_cost
                    })}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white text-xs font-semibold shadow-sm hover:shadow-md transition-all duration-200"
                  >
                    <span>🛒</span>
                    <span>Bought More</span>
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
                        {stat.daysLeft <= 7 && (
                          <span className="absolute -top-1 -right-1 flex h-3 w-3">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
                          </span>
                        )}
                      </div>
                      <div>
                        <div className="text-xs font-bold uppercase tracking-wider mb-1 opacity-75">
                          {stat.daysLeft <= 7 ? '⚠️ Urgent' : stat.daysLeft <= 14 ? '⏰ Soon' : '✓ Stocked'}
                        </div>
                        <div className="text-sm font-semibold">
                          {stat.daysLeft <= 7 ? 'Reorder Now' : stat.daysLeft <= 14 ? 'Reorder Soon' : 'Good Stock'}
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

                  <div className="flex items-center gap-2 text-sm opacity-90">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    <span>Reorder by <strong>{stat.reorderDate}</strong></span>
                  </div>
                </div>
              </div>

              {/* Cost Breakdown - Premium Grid */}
              <div className="relative grid grid-cols-4 gap-2 mb-3">
                <div className="relative bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-700/50 dark:to-slate-700/30 rounded-xl p-3 text-center shadow-sm">
                  <div className="text-xs text-slate-600 dark:text-slate-400 mb-1 font-medium">Per Day</div>
                  <div className="text-sm font-bold text-slate-900 dark:text-white">
                    ${stat.costPerDay.toFixed(2)}
                  </div>
                </div>
                <div className="relative bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-700/50 dark:to-slate-700/30 rounded-xl p-3 text-center shadow-sm">
                  <div className="text-xs text-slate-600 dark:text-slate-400 mb-1 font-medium">Per Week</div>
                  <div className="text-sm font-bold text-slate-900 dark:text-white">
                    ${stat.costPerWeek.toFixed(2)}
                  </div>
                </div>
                <div className="relative bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-xl p-3 text-center shadow-md">
                  <div className="text-xs text-emerald-50 mb-1 font-semibold">Per Month</div>
                  <div className="text-sm font-bold text-white">
                    ${stat.costPerMonth.toFixed(2)}
                  </div>
                </div>
                <div className="relative bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-700/50 dark:to-slate-700/30 rounded-xl p-3 text-center shadow-sm">
                  <div className="text-xs text-slate-600 dark:text-slate-400 mb-1 font-medium">Per Year</div>
                  <div className="text-sm font-bold text-slate-900 dark:text-white">
                    ${stat.costPerYear.toFixed(0)}
                  </div>
                </div>
              </div>

              {/* Details */}
              <div className="text-xs text-slate-500 dark:text-slate-400 pt-3 border-t border-slate-200 dark:border-slate-700">
                {stat.entry.cups_per_day} cups/day • {stat.daysPerBag} days per bag • {stat.entry.food_type} food
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Household Total - Premium Card */}
      {petFoodStats.length > 0 && (
        <div className="relative bg-gradient-to-br from-emerald-500 via-emerald-600 to-teal-600 rounded-2xl p-[2px] shadow-2xl hover:shadow-emerald-500/50 transition-all duration-300">
          <div className="relative bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-2xl p-8 overflow-hidden">
            {/* Decorative pattern */}
            <div className="absolute inset-0 opacity-10">
              <div className="absolute top-0 right-0 w-64 h-64 bg-white rounded-full -translate-y-1/2 translate-x-1/2" />
              <div className="absolute bottom-0 left-0 w-48 h-48 bg-white rounded-full translate-y-1/2 -translate-x-1/2" />
            </div>

            <div className="relative flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <svg className="w-5 h-5 text-emerald-100" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3" />
                  </svg>
                  <div className="text-sm font-bold text-emerald-100 uppercase tracking-wider">
                    Household Food Budget
                  </div>
                </div>
                <div className="text-5xl font-black text-white mb-1">
                  ${householdTotal.toFixed(2)}
                  <span className="text-2xl font-semibold text-emerald-100 ml-2">/month</span>
                </div>
                <div className="text-sm text-emerald-100 font-medium">
                  {petFoodStats.length} {petFoodStats.length === 1 ? 'pet' : 'pets'} • ${(householdTotal / 30).toFixed(2)}/day
                </div>
              </div>
              <div className="text-7xl opacity-30 hidden md:block">🍽️</div>
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
