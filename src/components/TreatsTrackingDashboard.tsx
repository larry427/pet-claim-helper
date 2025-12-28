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
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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
                className="bg-white dark:bg-slate-800 rounded-xl p-5 shadow-sm border border-slate-200 dark:border-slate-700 hover:shadow-md transition-shadow"
              >
                {/* Header: Paw + Pet Name | Edit + Delete */}
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <span className="text-xl">🐾</span>
                    <span className="font-semibold text-slate-900 dark:text-white">
                      {treat.petName || 'All Pets'}
                    </span>
                  </div>
                  <div className="flex gap-1">
                    <button
                      onClick={() => setEditingTreat(treat)}
                      className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors text-slate-500 dark:text-slate-400"
                      title="Edit treat"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                    </button>
                    <button
                      onClick={() => handleDelete(treat.id)}
                      className="p-1.5 rounded hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors text-slate-500 dark:text-slate-400 hover:text-red-600 dark:hover:text-red-400"
                      title="Delete treat"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                </div>

                {/* Body: Treat Name + Vendor | Cost Badge */}
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1 min-w-0 pr-3">
                    <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-1">
                      {treat.item_name}
                    </h3>
                    {treat.vendor && (
                      <p className="text-sm text-slate-500 dark:text-slate-400">
                        {treat.vendor}
                      </p>
                    )}
                  </div>
                  <div className="flex-shrink-0">
                    <span className="inline-flex items-center px-3 py-1.5 rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 font-bold text-lg">
                      ${treat.amount.toFixed(2)}
                    </span>
                  </div>
                </div>

                {/* Date */}
                <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 mb-3">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  <span>{formattedDate}</span>
                </div>

                {/* Subscription Info */}
                {treat.is_subscription && (
                  <div className="flex items-center gap-2 mb-3">
                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 text-xs font-semibold">
                      🔄 {treat.subscription_frequency_days === 7
                        ? 'Weekly'
                        : treat.subscription_frequency_days === 14
                        ? 'Every 2 Weeks'
                        : 'Monthly'}
                    </span>
                  </div>
                )}

                {/* Reorder Link */}
                {treat.reorder_url && (
                  <a
                    href={treat.reorder_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-sm text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300 font-medium"
                  >
                    <span>Reorder</span>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                  </a>
                )}
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

      {editingTreat && (
        <AddTreatModal
          pets={pets}
          userId={userId}
          editTreat={editingTreat}
          onClose={() => setEditingTreat(null)}
          onComplete={() => {
            setEditingTreat(null)
            loadData()
          }}
        />
      )}
    </div>
  )
}
