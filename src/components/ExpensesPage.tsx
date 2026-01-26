import React, { useState, useRef, useEffect } from 'react'
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts'
import { useExpenses, Expense, ExpenseCategory, CATEGORY_LABELS, CATEGORY_ICONS, NewExpense } from '../lib/useExpenses'
import AddExpenseModal from './AddExpenseModal'

type Props = {
  userId: string | null
  onClose: () => void
  onModalStateChange?: (isOpen: boolean) => void
}

// Category colors for the pie chart - distinct harmonious palette
const CATEGORY_COLORS: Record<ExpenseCategory, string> = {
  food_treats: '#10b981',      // emerald-500
  grooming: '#8b5cf6',         // violet-500
  supplies_gear: '#f97316',    // orange-500 (changed from blue for distinction)
  training_boarding: '#f59e0b', // amber-500
  vet_medical: '#f43f5e',      // rose-500
  other: '#64748b'             // slate-500
}

export default function ExpensesPage({ userId, onClose, onModalStateChange }: Props) {
  // Disable browser scroll restoration to prevent mobile scroll position issues
  if (typeof window !== 'undefined') {
    window.history.scrollRestoration = 'manual'
  }

  const { expenses, summary, loading, error, addExpense, updateExpense, deleteExpense, refreshExpenses } = useExpenses(userId)

  const [showAddModal, setShowAddModal] = useState(false)
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null)

  // Notify parent when any modal opens/closes (used to hide BottomTabBar)
  useEffect(() => {
    const isAnyModalOpen = showAddModal || editingExpense !== null || showDeleteConfirm !== null
    onModalStateChange?.(isAnyModalOpen)
  }, [showAddModal, editingExpense, showDeleteConfirm, onModalStateChange])

  // Swipe state for mobile
  const [swipedId, setSwipedId] = useState<string | null>(null)
  const touchStartX = useRef<number>(0)


  // Handle close - switch view then scroll to widget
  const handleClose = () => {
    onClose()
    // Scroll to the widget after DOM updates
    setTimeout(() => {
      const widget = document.getElementById('pet-expenses-widget')
      if (widget) {
        widget.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }
    }, 100)
  }

  // Format currency
  const fmtMoney = (n: number) => `$${n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`
  const fmtMoneyShort = (n: number) => {
    if (n >= 1000) return `$${(n / 1000).toFixed(1)}k`
    return `$${n.toFixed(0)}`
  }

  // Format date
  const fmtDate = (dateStr: string) => {
    const date = new Date(dateStr + 'T00:00:00')
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }

  // Prepare pie chart data - only categories with values
  const pieData = Object.entries(summary.byCategory)
    .filter(([_, amount]) => amount > 0)
    .map(([category, amount]) => ({
      name: CATEGORY_LABELS[category as ExpenseCategory],
      value: amount,
      category: category as ExpenseCategory,
      color: CATEGORY_COLORS[category as ExpenseCategory]
    }))
    .sort((a, b) => b.value - a.value)

  // Calculate percentages
  const totalSpent = summary.yearToDate || 1
  const getPercentage = (amount: number) => Math.round((amount / totalSpent) * 100)

  // Handle delete
  const handleDelete = async (id: string) => {
    setDeletingId(id)
    const result = await deleteExpense(id)
    if (!result.success) {
      alert(result.error || 'Failed to delete expense')
    }
    setDeletingId(null)
    setShowDeleteConfirm(null)
    setSwipedId(null)
  }

  // Handle edit submit
  const handleEditSubmit = async (expense: NewExpense) => {
    if (!editingExpense) return { success: false, error: 'No expense selected' }
    const result = await updateExpense(editingExpense.id, expense)
    if (result.success) {
      setEditingExpense(null)
    }
    return result
  }

  // Touch handlers for swipe-to-delete
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX
  }

  const handleTouchMove = (e: React.TouchEvent, id: string) => {
    const diff = touchStartX.current - e.touches[0].clientX
    if (diff > 50) {
      setSwipedId(id)
    } else if (diff < -20) {
      setSwipedId(null)
    }
  }

  return (
    <div id="expenses-page-top" className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900">
      {/* Premium Header */}
      <header className="sticky top-0 z-40 backdrop-blur-xl bg-white/80 dark:bg-slate-900/80 border-b border-slate-200/50 dark:border-slate-800/50">
        <div className="max-w-5xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                onClick={handleClose}
                className="p-2.5 -ml-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition-all"
                aria-label="Back to dashboard"
              >
                <svg className="w-5 h-5 text-slate-600 dark:text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <h1 className="text-xl font-bold text-slate-900 dark:text-white">Pet Expenses</h1>
            </div>
            <button
              onClick={() => setShowAddModal(true)}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white font-semibold shadow-lg shadow-emerald-500/25 hover:shadow-emerald-500/40 transition-all hover:scale-[1.02] active:scale-[0.98]"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
              </svg>
              <span className="hidden sm:inline">Add Expense</span>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6 pb-24">
        {/* Loading state */}
        {loading && (
          <div className="flex flex-col items-center justify-center py-20">
            <div className="w-12 h-12 border-4 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin" />
            <p className="mt-4 text-slate-500 dark:text-slate-400 font-medium">Loading expenses...</p>
          </div>
        )}

        {/* Error state */}
        {error && !loading && (
          <div className="rounded-2xl bg-gradient-to-br from-red-50 to-rose-50 dark:from-red-900/20 dark:to-rose-900/20 border border-red-200 dark:border-red-800/50 p-8 text-center">
            <div className="w-16 h-16 mx-auto rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center mb-4">
              <svg className="w-8 h-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <p className="text-red-700 dark:text-red-400 font-medium">{error}</p>
            <button
              onClick={refreshExpenses}
              className="mt-4 px-6 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white font-semibold transition-colors"
            >
              Try Again
            </button>
          </div>
        )}

        {/* Empty state */}
        {!loading && !error && expenses.length === 0 && (
          <div className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-10 text-center shadow-xl shadow-slate-200/50 dark:shadow-none">
            <div className="w-24 h-24 mx-auto rounded-full bg-gradient-to-br from-emerald-100 to-teal-100 dark:from-emerald-900/30 dark:to-teal-900/30 flex items-center justify-center mb-6">
              <span className="text-5xl">🐾</span>
            </div>
            <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-3">No expenses yet</h2>
            <p className="text-slate-600 dark:text-slate-400 mb-8 max-w-sm mx-auto">
              Start tracking your pet spending to see where your money goes.
            </p>
            <button
              onClick={() => setShowAddModal(true)}
              className="inline-flex items-center gap-2 px-8 py-4 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white font-bold text-lg shadow-xl shadow-emerald-500/25 transition-all hover:scale-[1.02]"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
              </svg>
              Add your first expense
            </button>
          </div>
        )}

        {/* Content */}
        {!loading && !error && expenses.length > 0 && (
          <div className="space-y-4">
            {/* Summary Card */}
            <div className="rounded-3xl bg-gradient-to-br from-emerald-500 via-emerald-600 to-teal-600 p-6 sm:p-8 text-white shadow-2xl shadow-emerald-600/30 relative overflow-hidden">
              {/* Decorative elements */}
              <div className="absolute top-0 right-0 w-40 h-40 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2" />
              <div className="absolute bottom-0 left-0 w-32 h-32 bg-white/5 rounded-full translate-y-1/2 -translate-x-1/2" />

              <div className="relative">
                <p className="text-emerald-100 text-sm font-semibold uppercase tracking-wider mb-2">This Month's Spending</p>
                <p className="text-5xl sm:text-6xl font-bold tracking-tight">{fmtMoney(summary.thisMonth)}</p>

                <div className="mt-6 pt-6 border-t border-white/20">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-emerald-200 text-xs font-medium uppercase tracking-wider">Year to Date</p>
                      <p className="text-2xl font-bold mt-1">{fmtMoney(summary.yearToDate)}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-emerald-200 text-xs font-medium uppercase tracking-wider">Total Expenses</p>
                      <p className="text-2xl font-bold mt-1">{expenses.length}</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Category Breakdown with Pie Chart */}
            <div className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 shadow-xl shadow-slate-200/50 dark:shadow-none">
              <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-6">Spending by Category</h2>

              {pieData.length > 0 ? (
                <div className="flex flex-col lg:flex-row lg:items-center gap-6 lg:gap-10">
                  {/* Donut Chart */}
                  <div className="relative w-44 h-44 sm:w-52 sm:h-52 flex-shrink-0 mx-auto lg:mx-0">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={pieData}
                          cx="50%"
                          cy="50%"
                          innerRadius="60%"
                          outerRadius="90%"
                          paddingAngle={3}
                          dataKey="value"
                          strokeWidth={0}
                        >
                          {pieData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                        </Pie>
                      </PieChart>
                    </ResponsiveContainer>
                    {/* Center text */}
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <p className="text-xs text-slate-500 dark:text-slate-400 font-medium uppercase tracking-wider">Total</p>
                      <p className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white">{fmtMoneyShort(summary.yearToDate)}</p>
                    </div>
                  </div>

                  {/* Legend - single column on desktop, stacked on mobile */}
                  <div className="flex-1 w-full flex flex-col gap-2">
                    {pieData.map((item) => (
                      <div
                        key={item.category}
                        className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                      >
                        <div
                          className="w-3 h-3 rounded-full flex-shrink-0"
                          style={{ backgroundColor: item.color }}
                        />
                        <span className="text-lg flex-shrink-0">{CATEGORY_ICONS[item.category]}</span>
                        <p className="text-xs font-medium text-slate-900 dark:text-white flex-1 min-w-0">
                          {item.name}
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400 flex-shrink-0 w-12 text-right">
                          {getPercentage(item.value)}%
                        </p>
                        <p className="text-sm font-bold text-slate-900 dark:text-white flex-shrink-0 w-20 text-right">
                          {fmtMoney(item.value)}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="text-slate-500 dark:text-slate-400 text-center py-8">No spending data yet</p>
              )}
            </div>

            {/* Recent Expenses */}
            <div className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-hidden shadow-xl shadow-slate-200/50 dark:shadow-none">
              <div className="px-6 py-5 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30">
                <h2 className="text-lg font-bold text-slate-900 dark:text-white">Recent Expenses</h2>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">Tap to edit, swipe to delete</p>
              </div>
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {expenses.map((expense) => (
                  <div
                    key={expense.id}
                    className="relative overflow-hidden"
                    onTouchStart={handleTouchStart}
                    onTouchMove={(e) => handleTouchMove(e, expense.id)}
                    onTouchEnd={() => {}}
                  >
                    {/* Delete button (revealed on swipe) */}
                    <div className={`absolute inset-y-0 right-0 flex items-center transition-all duration-200 ${
                      swipedId === expense.id ? 'translate-x-0' : 'translate-x-full'
                    }`}>
                      <button
                        onClick={() => setShowDeleteConfirm(expense.id)}
                        className="h-full px-6 bg-gradient-to-r from-red-500 to-rose-500 text-white font-semibold transition-colors"
                      >
                        Delete
                      </button>
                    </div>

                    {/* Expense card */}
                    <div
                      className={`relative bg-white dark:bg-slate-900 px-6 py-4 flex items-center gap-4 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-all duration-200 ${
                        swipedId === expense.id ? '-translate-x-24' : 'translate-x-0'
                      }`}
                      onClick={() => {
                        if (swipedId === expense.id) {
                          setSwipedId(null)
                        } else {
                          setEditingExpense(expense)
                        }
                      }}
                    >
                      {/* Category icon with colored background */}
                      <div
                        className="w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0 shadow-lg"
                        style={{
                          backgroundColor: `${CATEGORY_COLORS[expense.category]}15`,
                          boxShadow: `0 4px 14px ${CATEGORY_COLORS[expense.category]}20`
                        }}
                      >
                        <span className="text-2xl">{CATEGORY_ICONS[expense.category]}</span>
                      </div>

                      {/* Details */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start gap-2">
                          {expense.category === 'vet_medical' && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-bold bg-rose-100 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400 flex-shrink-0 mt-0.5">
                              VET
                            </span>
                          )}
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-slate-900 dark:text-white leading-snug line-clamp-2">
                              {expense.vendor || expense.description || CATEGORY_LABELS[expense.category]}
                            </p>
                            {/* Show description below vendor if both exist */}
                            {expense.vendor && expense.description && (
                              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-1">
                                {expense.description}
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                          <span
                            className="w-2 h-2 rounded-full flex-shrink-0"
                            style={{ backgroundColor: CATEGORY_COLORS[expense.category] }}
                          />
                          <p className="text-xs text-slate-500 dark:text-slate-400">
                            {CATEGORY_LABELS[expense.category]}
                          </p>
                          <span className="text-slate-300 dark:text-slate-600">•</span>
                          <p className="text-xs text-slate-500 dark:text-slate-400">
                            {fmtDate(expense.expense_date)}
                          </p>
                        </div>
                      </div>

                      {/* Amount */}
                      <div className="text-right flex-shrink-0">
                        <p className="text-lg font-bold text-slate-900 dark:text-white">
                          {fmtMoney(expense.amount)}
                        </p>
                      </div>

                      {/* Desktop delete button */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          setShowDeleteConfirm(expense.id)
                        }}
                        className="hidden sm:flex p-2.5 rounded-xl hover:bg-red-50 dark:hover:bg-red-900/20 text-slate-400 hover:text-red-500 dark:hover:text-red-400 transition-all"
                        aria-label="Delete expense"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Floating Action Button (mobile) */}
      <button
        onClick={() => setShowAddModal(true)}
        className="sm:hidden fixed bottom-6 right-6 w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white shadow-2xl shadow-emerald-500/40 flex items-center justify-center transition-all active:scale-95 z-30"
        aria-label="Add expense"
      >
        <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
        </svg>
      </button>

      {/* Add Expense Modal */}
      {showAddModal && (
        <AddExpenseModal
          onClose={() => setShowAddModal(false)}
          onSubmit={addExpense}
        />
      )}

      {/* Edit Expense Modal */}
      {editingExpense && (
        <EditExpenseModal
          expense={editingExpense}
          onClose={() => setEditingExpense(null)}
          onSubmit={handleEditSubmit}
        />
      )}

      {/* Delete Confirmation Dialog */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-8 max-w-sm w-full shadow-2xl">
            <div className="w-16 h-16 mx-auto rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center mb-5">
              <svg className="w-8 h-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </div>
            <h3 className="text-xl font-bold text-slate-900 dark:text-white text-center mb-2">Delete Expense?</h3>
            <p className="text-slate-600 dark:text-slate-400 text-center mb-8">
              This action cannot be undone.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowDeleteConfirm(null)
                  setSwipedId(null)
                }}
                className="flex-1 px-4 py-3 rounded-xl border-2 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 font-semibold text-slate-700 dark:text-slate-300 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDelete(showDeleteConfirm)}
                disabled={deletingId === showDeleteConfirm}
                className="flex-1 px-4 py-3 rounded-xl bg-gradient-to-r from-red-500 to-rose-500 hover:from-red-600 hover:to-rose-600 text-white font-semibold transition-colors disabled:opacity-50"
              >
                {deletingId === showDeleteConfirm ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// Edit Expense Modal Component
function EditExpenseModal({ expense, onClose, onSubmit }: {
  expense: Expense
  onClose: () => void
  onSubmit: (expense: NewExpense) => Promise<{ success: boolean; error?: string }>
}) {
  const [amount, setAmount] = useState(expense.amount.toString())
  const [category, setCategory] = useState<ExpenseCategory>(expense.category)
  const [expenseDate, setExpenseDate] = useState(expense.expense_date)
  const [vendor, setVendor] = useState(expense.vendor || '')
  const [description, setDescription] = useState(expense.description || '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const CATEGORIES: ExpenseCategory[] = [
    'food_treats',
    'supplies_gear',
    'grooming',
    'training_boarding',
    'vet_medical',
    'other'
  ]

  const amountNum = parseFloat(amount)
  const isValidAmount = !isNaN(amountNum) && amountNum > 0
  const isOtherCategory = category === 'other'
  const needsDescription = isOtherCategory && !description.trim()
  const isValid = isValidAmount && expenseDate && !needsDescription

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!isValid) return

    setError(null)
    setSaving(true)

    const result = await onSubmit({
      amount: amountNum,
      category,
      expense_date: expenseDate,
      vendor: vendor.trim() || null,
      description: description.trim() || null,
      ocr_extracted: expense.ocr_extracted,
      ocr_confidence: expense.ocr_confidence
    })

    if (!result.success) {
      setError(result.error || 'Failed to update expense')
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="relative w-full sm:max-w-lg rounded-t-3xl sm:rounded-3xl bg-white dark:bg-slate-900 shadow-2xl max-h-[90vh] overflow-hidden">
        {/* Drag handle for mobile */}
        <div className="sm:hidden flex justify-center pt-3 pb-1">
          <div className="w-12 h-1.5 rounded-full bg-slate-300 dark:bg-slate-700" />
        </div>

        {/* Header */}
        <div className="px-6 pt-4 sm:pt-6 pb-4 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-slate-900 dark:text-white">Edit Expense</h2>
            <button
              onClick={onClose}
              className="p-2.5 -mr-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
              aria-label="Close"
            >
              <svg className="w-5 h-5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto max-h-[calc(90vh-120px)]">
          {error && (
            <div className="mb-5 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 px-4 py-3 text-sm text-red-700 dark:text-red-400">
              {error}
            </div>
          )}

          <div className="space-y-5">
            {/* Amount */}
            <div>
              <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
                Amount <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-xl font-semibold text-slate-400">$</span>
                <input
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  min="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-full rounded-xl border-2 border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 pl-10 pr-4 py-3 text-xl font-semibold text-slate-900 dark:text-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 transition-all"
                />
              </div>
            </div>

            {/* Category */}
            <div>
              <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
                Category <span className="text-red-500">*</span>
              </label>
              <div className="grid grid-cols-3 gap-2">
                {CATEGORIES.map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setCategory(cat)}
                    className={`flex flex-col items-center p-3 rounded-xl border-2 transition-all ${
                      category === cat
                        ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20'
                        : 'border-slate-200 dark:border-slate-700 hover:border-slate-300'
                    }`}
                  >
                    <span className="text-xl mb-1">{CATEGORY_ICONS[cat]}</span>
                    <span className={`text-xs font-medium text-center leading-tight ${
                      category === cat
                        ? 'text-emerald-700 dark:text-emerald-400'
                        : 'text-slate-600 dark:text-slate-400'
                    }`}>
                      {CATEGORY_LABELS[cat]}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Date */}
            <div>
              <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
                Date <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                value={expenseDate}
                onChange={(e) => setExpenseDate(e.target.value)}
                max={new Date().toISOString().split('T')[0]}
                className="w-full rounded-xl border-2 border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-3 text-slate-900 dark:text-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 transition-all"
              />
            </div>

            {/* Vendor */}
            <div>
              <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
                Vendor <span className="text-slate-400 font-normal">(optional)</span>
              </label>
              <input
                type="text"
                placeholder="e.g., Petco, Chewy"
                value={vendor}
                onChange={(e) => setVendor(e.target.value)}
                className="w-full rounded-xl border-2 border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-3 text-slate-900 dark:text-white placeholder-slate-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 transition-all"
              />
            </div>

            {/* Notes */}
            <div>
              <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
                Notes {isOtherCategory ? <span className="text-red-500">*</span> : <span className="text-slate-400 font-normal">(optional)</span>}
              </label>
              <textarea
                rows={2}
                placeholder={isOtherCategory ? "Required for 'Other' category" : "Add any notes"}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className={`w-full rounded-xl border-2 bg-white dark:bg-slate-800 px-4 py-3 text-slate-900 dark:text-white placeholder-slate-400 focus:ring-2 transition-all resize-none ${
                  needsDescription
                    ? 'border-amber-300 dark:border-amber-700 focus:border-amber-500 focus:ring-amber-500/20'
                    : 'border-slate-200 dark:border-slate-700 focus:border-emerald-500 focus:ring-emerald-500/20'
                }`}
              />
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3 mt-6">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="flex-1 px-4 py-3.5 rounded-xl border-2 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || !isValid}
              className="flex-1 px-4 py-3.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-emerald-500/25"
            >
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
