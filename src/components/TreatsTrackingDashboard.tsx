import React, { useEffect, useState, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { Expense } from '../types/expenses'
import AddTreatModal from './AddTreatModal'

type Pet = {
  id: string
  name: string
  species: string
  photo_url: string | null
}

type TreatExpense = Expense & {
  petName: string | null
}

export default function TreatsTrackingDashboard({ userId }: { userId: string }) {
  const [loading, setLoading] = useState(true)
  const [treats, setTreats] = useState<TreatExpense[]>([])
  const [pets, setPets] = useState<Pet[]>([])
  const [showAddTreat, setShowAddTreat] = useState(false)
  const [editingTreat, setEditingTreat] = useState<TreatExpense | null>(null)

  const loadData = async () => {
    setLoading(true)
    try {
      const [treatsRes, petsRes] = await Promise.all([
        supabase
          .from('expenses')
          .select('*')
          .eq('user_id', userId)
          .eq('category', 'food')
          .eq('subcategory', 'treats')
          .order('purchase_date', { ascending: false }),
        supabase
          .from('pets')
          .select('id, name, species, photo_url')
          .eq('user_id', userId)
      ])

      if (treatsRes.error) throw treatsRes.error
      if (petsRes.error) throw petsRes.error

      const treatsData = (treatsRes.data || []) as Expense[]
      const petsData = (petsRes.data || []) as Pet[]

      // Add pet names to treats
      const treatsWithPets: TreatExpense[] = treatsData.map(treat => {
        const pet = treat.pet_id ? petsData.find(p => p.id === treat.pet_id) : null
        return {
          ...treat,
          petName: pet?.name || null
        }
      })

      setTreats(treatsWithPets)
      setPets(petsData)
    } catch (error: any) {
      console.error('Error loading treats:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (userId) loadData()
  }, [userId])

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this treat entry?')) return

    try {
      const { error } = await supabase
        .from('expenses')
        .delete()
        .eq('id', id)

      if (error) throw error

      loadData()
    } catch (error: any) {
      alert('Failed to delete treat: ' + (error?.message || 'Unknown error'))
    }
  }

  // Calculate totals
  const totals = useMemo(() => {
    const total = treats.reduce((sum, treat) => sum + treat.amount, 0)

    // Calculate monthly and yearly based on subscriptions
    let monthlyTotal = 0
    let yearlyTotal = 0

    treats.forEach(treat => {
      if (treat.is_subscription && treat.subscription_frequency_days) {
        const perDay = treat.amount / treat.subscription_frequency_days
        monthlyTotal += perDay * 30
        yearlyTotal += perDay * 365
      } else {
        // One-time purchases - estimate monthly based on purchase frequency
        // For simplicity, we'll just add them to the total but not monthly recurring
      }
    })

    return {
      total,
      monthly: monthlyTotal,
      yearly: yearlyTotal
    }
  }, [treats])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-slate-500">Loading treats...</div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white">🍖 Treats</h2>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
            Track treats, chews, and other consumables
          </p>
        </div>
        <button
          onClick={() => setShowAddTreat(true)}
          className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-colors"
        >
          <span className="text-xl">+</span>
          Add Treat
        </button>
      </div>

      {/* Treat Cards */}
      {treats.length === 0 ? (
        <div className="text-center py-12 bg-slate-50 dark:bg-slate-800/50 rounded-xl border-2 border-dashed border-slate-300 dark:border-slate-700">
          <div className="text-4xl mb-3">🍖</div>
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">No treats tracked yet</h3>
          <p className="text-slate-600 dark:text-slate-400 mb-4">Start tracking your treat purchases</p>
          <button
            onClick={() => setShowAddTreat(true)}
            className="px-6 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-colors"
          >
            Add Your First Treat
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {treats.map(treat => (
            <div
              key={treat.id}
              className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6 shadow-sm hover:shadow-md transition-shadow"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
                      {treat.item_name}
                    </h3>
                    {treat.is_subscription && (
                      <span className="px-2 py-0.5 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 text-xs font-medium rounded">
                        Subscription
                      </span>
                    )}
                  </div>

                  <div className="space-y-1 text-sm text-slate-600 dark:text-slate-400">
                    <div>
                      <span className="font-medium">Pet:</span>{' '}
                      {treat.petName || 'All Pets'}
                    </div>
                    <div>
                      <span className="font-medium">Cost:</span>{' '}
                      ${treat.amount.toFixed(2)}
                    </div>
                    <div>
                      <span className="font-medium">Purchased:</span>{' '}
                      {new Date(treat.purchase_date).toLocaleDateString()}
                    </div>
                    {treat.vendor && (
                      <div>
                        <span className="font-medium">Vendor:</span>{' '}
                        {treat.vendor}
                      </div>
                    )}
                    {treat.is_subscription && treat.subscription_frequency_days && (
                      <div>
                        <span className="font-medium">Frequency:</span>{' '}
                        {treat.subscription_frequency_days === 7
                          ? 'Weekly'
                          : treat.subscription_frequency_days === 14
                          ? 'Every 2 Weeks'
                          : 'Monthly'}
                      </div>
                    )}
                    {treat.reorder_url && (
                      <div>
                        <a
                          href={treat.reorder_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-emerald-600 hover:text-emerald-700 underline"
                        >
                          Reorder Link →
                        </a>
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => handleDelete(treat.id)}
                    className="px-3 py-1.5 text-sm text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 border border-red-300 dark:border-red-800 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Totals */}
      {treats.length > 0 && (
        <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700 p-6">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">Spending Summary</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <div className="text-sm text-slate-600 dark:text-slate-400">Monthly Spend (Subscriptions)</div>
              <div className="text-2xl font-bold text-slate-900 dark:text-white">
                ${totals.monthly.toFixed(2)}
              </div>
            </div>
            <div>
              <div className="text-sm text-slate-600 dark:text-slate-400">Yearly Spend (Subscriptions)</div>
              <div className="text-2xl font-bold text-slate-900 dark:text-white">
                ${totals.yearly.toFixed(2)}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modals */}
      {showAddTreat && (
        <AddTreatModal
          pets={pets}
          userId={userId}
          onClose={() => setShowAddTreat(false)}
          onComplete={() => {
            setShowAddTreat(false)
            loadData()
          }}
        />
      )}
    </div>
  )
}
