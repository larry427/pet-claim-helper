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

  // Calculate totals based on actual spending
  const totals = useMemo(() => {
    const now = new Date()
    const currentMonth = now.getMonth()
    const currentYear = now.getFullYear()

    const total = treats.reduce((sum, treat) => sum + treat.amount, 0)

    const thisMonth = treats
      .filter(treat => {
        const purchaseDate = new Date(treat.purchase_date)
        return purchaseDate.getMonth() === currentMonth && purchaseDate.getFullYear() === currentYear
      })
      .reduce((sum, treat) => sum + treat.amount, 0)

    const thisYear = treats
      .filter(treat => {
        const purchaseDate = new Date(treat.purchase_date)
        return purchaseDate.getFullYear() === currentYear
      })
      .reduce((sum, treat) => sum + treat.amount, 0)

    return {
      total,
      thisMonth,
      thisYear
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
        <div className="grid gap-4 md:grid-cols-2">
          {treats.map(treat => {
            const pet = treat.pet_id ? pets.find(p => p.id === treat.pet_id) : null
            const purchaseDate = new Date(treat.purchase_date)
            const formattedDate = purchaseDate.toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
              year: 'numeric'
            })

            return (
              <div
                key={treat.id}
                className="relative bg-white dark:bg-slate-800 rounded-2xl p-6 shadow-lg border border-slate-200 dark:border-slate-700 hover:shadow-xl transition-all duration-300 hover:scale-[1.02] overflow-hidden"
              >
                {/* Subtle gradient background */}
                <div className="absolute inset-0 bg-gradient-to-br from-emerald-50/30 via-transparent to-transparent dark:from-emerald-900/10 pointer-events-none" />

                {/* Header with Pet Info and Actions */}
                <div className="relative flex items-start gap-3 mb-4">
                  {/* Pet Photo/Icon */}
                  <div className="flex-shrink-0">
                    {pet?.photo_url ? (
                      <img
                        src={pet.photo_url}
                        alt={pet.name}
                        className="w-10 h-10 rounded-full object-cover border-2 border-slate-200 dark:border-slate-700"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center text-lg border-2 border-slate-200 dark:border-slate-700">
                        🐾
                      </div>
                    )}
                  </div>

                  {/* Title and Pet Name */}
                  <div className="flex-1 min-w-0">
                    <h4 className="font-bold text-lg text-slate-900 dark:text-white truncate mb-1" title={treat.item_name}>
                      {treat.item_name}
                    </h4>
                    <p className="text-sm text-slate-600 dark:text-slate-400">
                      {treat.petName || 'All Pets'}
                    </p>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex gap-1 flex-shrink-0">
                    <button
                      onClick={() => handleDelete(treat.id)}
                      className="p-2 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors text-red-600 dark:text-red-400"
                      title="Delete treat"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                </div>

                {/* Cost Highlight */}
                <div className="relative rounded-xl p-4 mb-4 bg-gradient-to-br from-emerald-50 to-teal-50 dark:from-emerald-900/20 dark:to-teal-900/20 border border-emerald-200 dark:border-emerald-800">
                  <div className="flex items-baseline gap-2">
                    <span className="text-3xl font-black text-emerald-700 dark:text-emerald-400">
                      ${treat.amount.toFixed(2)}
                    </span>
                    {treat.is_subscription && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-600 text-white text-xs font-semibold">
                        📦 Subscription
                      </span>
                    )}
                  </div>
                  {treat.is_subscription && treat.subscription_frequency_days && (
                    <div className="text-xs text-emerald-700 dark:text-emerald-400 mt-1 font-medium">
                      {treat.subscription_frequency_days === 7
                        ? 'Weekly'
                        : treat.subscription_frequency_days === 14
                        ? 'Every 2 Weeks'
                        : 'Monthly'}
                    </div>
                  )}
                </div>

                {/* Details */}
                <div className="relative space-y-2 text-sm">
                  <div className="flex items-center gap-2 text-slate-600 dark:text-slate-400">
                    <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    <span>Purchased {formattedDate}</span>
                  </div>

                  {treat.vendor && (
                    <div className="flex items-center gap-2 text-slate-600 dark:text-slate-400">
                      <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
                      </svg>
                      <span>{treat.vendor}</span>
                    </div>
                  )}

                  {treat.reorder_url && (
                    <div className="pt-2">
                      <a
                        href={treat.reorder_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-sm hover:shadow-md transition-all duration-200"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                        </svg>
                        <span>Reorder</span>
                      </a>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Totals */}
      {treats.length > 0 && (
        <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700 p-6">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">Spending Summary</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <div className="text-sm text-slate-600 dark:text-slate-400">Total Spent</div>
              <div className="text-2xl font-bold text-slate-900 dark:text-white">
                ${totals.total.toFixed(2)}
              </div>
            </div>
            <div>
              <div className="text-sm text-slate-600 dark:text-slate-400">This Month</div>
              <div className="text-2xl font-bold text-slate-900 dark:text-white">
                ${totals.thisMonth.toFixed(2)}
              </div>
            </div>
            <div>
              <div className="text-sm text-slate-600 dark:text-slate-400">This Year</div>
              <div className="text-2xl font-bold text-slate-900 dark:text-white">
                ${totals.thisYear.toFixed(2)}
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
