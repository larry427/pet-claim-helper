import React, { useEffect, useState, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import AddFoodModal from './AddFoodModal'
import AssignFoodModal from './AssignFoodModal'
import EditFeedingPlanModal from './EditFeedingPlanModal'

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

type FeedingPlan = {
  id: string
  pet_id: string
  food_item_id: string
  servings_per_meal: number
  meals_per_day: number
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
  foodItem: FoodItem
  plan: FeedingPlan
  costPerMeal: number
  costPerDay: number
  costPerMonth: number
  daysRemaining: number
  reorderDate: string
}

export default function FoodTrackingDashboard({ userId }: { userId: string }) {
  const [loading, setLoading] = useState(true)
  const [foodItems, setFoodItems] = useState<FoodItem[]>([])
  const [feedingPlans, setFeedingPlans] = useState<FeedingPlan[]>([])
  const [pets, setPets] = useState<Pet[]>([])
  const [showAddFood, setShowAddFood] = useState(false)
  const [showAssignFood, setShowAssignFood] = useState(false)
  const [selectedFoodItem, setSelectedFoodItem] = useState<FoodItem | null>(null)
  const [editingPlan, setEditingPlan] = useState<PetFoodStats | null>(null)

  const loadData = async () => {
    setLoading(true)
    try {
      const [foodRes, plansRes, petsRes] = await Promise.all([
        supabase.from('food_items').select('*').eq('user_id', userId).order('created_at', { ascending: false }),
        supabase.from('feeding_plans').select('*'),
        supabase.from('pets').select('id, name, species, photo_url').eq('user_id', userId)
      ])

      if (foodRes.error) throw foodRes.error
      if (plansRes.error) throw plansRes.error
      if (petsRes.error) throw petsRes.error

      setFoodItems((foodRes.data || []) as FoodItem[])
      setFeedingPlans((plansRes.data || []) as FeedingPlan[])
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

    feedingPlans.forEach(plan => {
      const pet = pets.find(p => p.id === plan.pet_id)
      const foodItem = foodItems.find(f => f.id === plan.food_item_id)

      if (!pet || !foodItem) return

      const servingsPerDay = plan.servings_per_meal * plan.meals_per_day
      const costPerServing = foodItem.cost / foodItem.total_servings
      const costPerMeal = costPerServing * plan.servings_per_meal
      const costPerDay = costPerMeal * plan.meals_per_day
      const costPerMonth = costPerDay * 30

      // Calculate days remaining (assuming we start with total_servings)
      const daysRemaining = Math.floor(foodItem.total_servings / servingsPerDay)

      // Reorder date (with 5-day buffer)
      const reorderDays = Math.max(0, daysRemaining - 5)
      const reorderDate = new Date()
      reorderDate.setDate(reorderDate.getDate() + reorderDays)

      stats.push({
        pet,
        foodItem,
        plan,
        costPerMeal,
        costPerDay,
        costPerMonth,
        daysRemaining,
        reorderDate: reorderDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
      })
    })

    return stats
  }, [feedingPlans, pets, foodItems])

  const householdTotal = useMemo(() => {
    return petFoodStats.reduce((sum, stat) => sum + stat.costPerMonth, 0)
  }, [petFoodStats])

  const handleAddFoodComplete = (foodItem: FoodItem) => {
    setSelectedFoodItem(foodItem)
    setShowAddFood(false)
    setShowAssignFood(true)
  }

  const handleAssignComplete = () => {
    setShowAssignFood(false)
    setSelectedFoodItem(null)
    loadData()
  }

  const handleEditComplete = () => {
    setEditingPlan(null)
    loadData()
  }

  const handleDelete = async (planId: string, petName: string) => {
    if (!confirm(`Remove feeding plan for ${petName}?`)) return

    try {
      const { error } = await supabase
        .from('feeding_plans')
        .delete()
        .eq('id', planId)

      if (error) throw error

      loadData()
    } catch (error: any) {
      alert('Failed to delete feeding plan: ' + (error?.message || 'Unknown error'))
    }
  }

  const getDaysLeftColor = (days: number) => {
    if (days > 14) return 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400'
    if (days >= 7) return 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400'
    return 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400'
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
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">Track costs and manage reorders</p>
        </div>
        <button
          onClick={() => setShowAddFood(true)}
          className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-colors"
        >
          <span className="text-xl">+</span>
          Add Food
        </button>
      </div>

      {/* Pet Food Cards */}
      {petFoodStats.length === 0 ? (
        <div className="text-center py-12 bg-slate-50 dark:bg-slate-800/50 rounded-xl border-2 border-dashed border-slate-300 dark:border-slate-700">
          <div className="text-4xl mb-3">🍖</div>
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">No food items yet</h3>
          <p className="text-slate-600 dark:text-slate-400 mb-4">Start tracking your pet food costs</p>
          <button
            onClick={() => setShowAddFood(true)}
            className="px-6 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-colors"
          >
            Add Your First Food Item
          </button>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {petFoodStats.map((stat) => (
            <div
              key={stat.plan.id}
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
                    {stat.foodItem.brand || ''} {stat.foodItem.name}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setEditingPlan(stat)}
                    className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors text-slate-600 dark:text-slate-400"
                    title="Edit feeding plan"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                    </svg>
                  </button>
                  <button
                    onClick={() => handleDelete(stat.plan.id, stat.pet.name)}
                    className="p-2 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors text-red-600 dark:text-red-400"
                    title="Delete feeding plan"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              </div>

              {/* Stats Grid */}
              <div className="grid grid-cols-2 gap-3 mb-4">
                <div className="bg-slate-50 dark:bg-slate-700/50 rounded-lg p-3">
                  <div className="text-xs text-slate-600 dark:text-slate-400 mb-1">Per Meal</div>
                  <div className="text-lg font-bold text-slate-900 dark:text-white">
                    ${stat.costPerMeal.toFixed(2)}
                  </div>
                </div>
                <div className="bg-slate-50 dark:bg-slate-700/50 rounded-lg p-3">
                  <div className="text-xs text-slate-600 dark:text-slate-400 mb-1">Per Day</div>
                  <div className="text-lg font-bold text-slate-900 dark:text-white">
                    ${stat.costPerDay.toFixed(2)}
                  </div>
                </div>
                <div className="bg-emerald-50 dark:bg-emerald-900/20 rounded-lg p-3">
                  <div className="text-xs text-emerald-700 dark:text-emerald-400 mb-1">Per Month</div>
                  <div className="text-lg font-bold text-emerald-700 dark:text-emerald-400">
                    ${stat.costPerMonth.toFixed(2)}
                  </div>
                </div>
                <div className={`rounded-lg p-3 ${getDaysLeftColor(stat.daysRemaining)}`}>
                  <div className="text-xs mb-1">Days Left</div>
                  <div className="text-lg font-bold">
                    {stat.daysRemaining}
                  </div>
                </div>
              </div>

              {/* Reorder Alert */}
              <div
                className={`rounded-lg p-3 ${
                  stat.daysRemaining <= 5
                    ? 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800'
                    : 'bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="text-lg">{stat.daysRemaining <= 5 ? '⚠️' : '📅'}</span>
                  <div className="text-sm">
                    <span className={stat.daysRemaining <= 5 ? 'text-red-700 dark:text-red-400 font-semibold' : 'text-blue-700 dark:text-blue-400'}>
                      {stat.daysRemaining <= 5 ? 'Reorder soon!' : 'Reorder by'}
                    </span>
                    {stat.daysRemaining > 5 && (
                      <span className="text-blue-600 dark:text-blue-400 ml-1">{stat.reorderDate}</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Feeding Details */}
              <div className="mt-3 text-xs text-slate-500 dark:text-slate-400">
                {(stat.plan.servings_per_meal * stat.plan.meals_per_day) % 1 === 0
                  ? (stat.plan.servings_per_meal * stat.plan.meals_per_day).toFixed(0)
                  : (stat.plan.servings_per_meal * stat.plan.meals_per_day).toFixed(1)
                } {stat.foodItem.serving_unit}s/day
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
        <AddFoodModal
          userId={userId}
          onClose={() => setShowAddFood(false)}
          onComplete={handleAddFoodComplete}
        />
      )}

      {showAssignFood && selectedFoodItem && (
        <AssignFoodModal
          foodItem={selectedFoodItem}
          pets={pets}
          onClose={() => {
            setShowAssignFood(false)
            setSelectedFoodItem(null)
          }}
          onComplete={handleAssignComplete}
        />
      )}

      {editingPlan && (
        <EditFeedingPlanModal
          plan={editingPlan.plan}
          petName={editingPlan.pet.name}
          foodName={`${editingPlan.foodItem.brand ? editingPlan.foodItem.brand + ' ' : ''}${editingPlan.foodItem.name}`}
          servingUnit={editingPlan.foodItem.serving_unit}
          onClose={() => setEditingPlan(null)}
          onComplete={handleEditComplete}
        />
      )}
    </div>
  )
}
