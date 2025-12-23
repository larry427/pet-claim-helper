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

      {/* Alert Summary */}
      {alertCount > 0 && (
        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4">
          <div className="flex items-center gap-2">
            <span className="text-xl">⚠️</span>
            <div className="text-sm">
              <span className="font-semibold text-amber-900 dark:text-amber-400">
                {alertCount} {alertCount === 1 ? 'pet needs' : 'pets need'} food reordered soon
              </span>
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
              className="bg-white dark:bg-slate-800 rounded-xl p-6 shadow-sm border border-slate-200 dark:border-slate-700 hover:shadow-md transition-shadow"
            >
              {/* Pet Header with Edit/Delete buttons */}
              <div className="flex items-center gap-3 mb-4">
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
                    className="p-2 rounded-lg hover:bg-emerald-50 dark:hover:bg-emerald-900/20 transition-colors text-emerald-600 dark:text-emerald-400"
                    title="Refill - bought more food"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
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

              {/* Status Light + Days Left */}
              <div className={`rounded-lg p-4 mb-4 border ${getDaysLeftColor(stat.daysLeft)}`}>
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-2xl">{stat.statusColor}</span>
                      <span className="text-xs font-medium uppercase tracking-wide">
                        {stat.daysLeft <= 7 ? 'Reorder Now' : stat.daysLeft <= 14 ? 'Reorder Soon' : 'Good Stock'}
                      </span>
                    </div>
                    <div className="text-3xl font-bold">
                      {stat.daysLeft} {stat.daysLeft === 1 ? 'day' : 'days'} left
                    </div>
                  </div>
                </div>
                <div className="text-sm mt-2 opacity-90">
                  Reorder by {stat.reorderDate}
                </div>
              </div>

              {/* Cost Breakdown */}
              <div className="grid grid-cols-4 gap-2 mb-3">
                <div className="bg-slate-50 dark:bg-slate-700/50 rounded-lg p-3 text-center">
                  <div className="text-xs text-slate-600 dark:text-slate-400 mb-1">Per Day</div>
                  <div className="text-sm font-bold text-slate-900 dark:text-white">
                    ${stat.costPerDay.toFixed(2)}
                  </div>
                </div>
                <div className="bg-slate-50 dark:bg-slate-700/50 rounded-lg p-3 text-center">
                  <div className="text-xs text-slate-600 dark:text-slate-400 mb-1">Per Week</div>
                  <div className="text-sm font-bold text-slate-900 dark:text-white">
                    ${stat.costPerWeek.toFixed(2)}
                  </div>
                </div>
                <div className="bg-emerald-50 dark:bg-emerald-900/20 rounded-lg p-3 text-center">
                  <div className="text-xs text-emerald-700 dark:text-emerald-400 mb-1">Per Month</div>
                  <div className="text-sm font-bold text-emerald-700 dark:text-emerald-400">
                    ${stat.costPerMonth.toFixed(2)}
                  </div>
                </div>
                <div className="bg-slate-50 dark:bg-slate-700/50 rounded-lg p-3 text-center">
                  <div className="text-xs text-slate-600 dark:text-slate-400 mb-1">Per Year</div>
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

      {/* Household Total */}
      {petFoodStats.length > 0 && (
        <div className="bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-xl p-6 text-white shadow-lg">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm opacity-90 mb-1">Household Food Budget</div>
              <div className="text-3xl font-bold">${householdTotal.toFixed(2)}/month</div>
            </div>
            <div className="text-5xl opacity-20">🍽️</div>
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
