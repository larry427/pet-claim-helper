import React, { useState, useRef } from 'react'
import { useExpenses, Expense, ExpenseCategory, CATEGORY_LABELS, CATEGORY_ICONS, NewExpense } from '../lib/useExpenses'
import AddExpenseModal from './AddExpenseModal'

type Props = {
  userId: string | null
  onClose: () => void
}

// Category order for display (sorted by typical spend)
const CATEGORY_ORDER: ExpenseCategory[] = [
  'food_treats',
  'vet_medical',
  'supplies_gear',
  'grooming',
  'training_boarding',
  'other'
]

export default function ExpensesPage({ userId, onClose }: Props) {
  const { expenses, summary, loading, error, addExpense, updateExpense, deleteExpense, refreshExpenses } = useExpenses(userId)

  const [showAddModal, setShowAddModal] = useState(false)
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null)

  // Swipe state for mobile
  const [swipedId, setSwipedId] = useState<string | null>(null)
  const touchStartX = useRef<number>(0)
  const touchCurrentX = useRef<number>(0)

  // Format currency
  const fmtMoney = (n: number) => `$${n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`

  // Format date
  const fmtDate = (dateStr: string) => {
    const date = new Date(dateStr + 'T00:00:00')
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }

  // Get max category amount for bar scaling
  const maxCategoryAmount = Math.max(...Object.values(summary.byCategory), 1)

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
  const handleTouchStart = (e: React.TouchEvent, id: string) => {
    touchStartX.current = e.touches[0].clientX
    touchCurrentX.current = e.touches[0].clientX
  }

  const handleTouchMove = (e: React.TouchEvent, id: string) => {
    touchCurrentX.current = e.touches[0].clientX
    const diff = touchStartX.current - touchCurrentX.current
    if (diff > 50) {
      setSwipedId(id)
    } else if (diff < -20) {
      setSwipedId(null)
    }
  }

  const handleTouchEnd = () => {
    // Keep swiped state if it was set
  }

  // Sort categories by amount (highest first) for display
  const sortedCategories = [...CATEGORY_ORDER].sort((a, b) =>
    summary.byCategory[b] - summary.byCategory[a]
  )

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 shadow-sm">
        <div className="max-w-5xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                onClick={onClose}
                className="p-2 -ml-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                aria-label="Back to dashboard"
              >
                <svg className="w-5 h-5 text-slate-600 dark:text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <div>
                <h1 className="text-xl font-bold text-slate-900 dark:text-white">Pet Expenses</h1>
                <p className="text-sm text-slate-500 dark:text-slate-400">QuickBooks for Dogs</p>
              </div>
            </div>
            <button
              onClick={() => setShowAddModal(true)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-semibold shadow-lg shadow-emerald-600/20 hover:shadow-emerald-600/30 transition-all"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              <span className="hidden sm:inline">Add Expense</span>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6">
        {/* Loading state */}
        {loading && (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-3 border-emerald-500 border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {/* Error state */}
        {error && !loading && (
          <div className="rounded-2xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-6 text-center">
            <p className="text-red-700 dark:text-red-400">{error}</p>
            <button
              onClick={refreshExpenses}
              className="mt-4 px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white font-medium transition-colors"
            >
              Try Again
            </button>
          </div>
        )}

        {/* Empty state */}
        {!loading && !error && expenses.length === 0 && (
          <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-8 text-center">
            <div className="w-20 h-20 mx-auto rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center mb-6">
              <span className="text-4xl">🐾</span>
            </div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-2">No expenses yet</h2>
            <p className="text-slate-600 dark:text-slate-400 mb-6 max-w-sm mx-auto">
              Start tracking your pet spending to see where your money goes.
            </p>
            <button
              onClick={() => setShowAddModal(true)}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-semibold shadow-lg shadow-emerald-600/20 transition-all"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Add your first expense
            </button>
          </div>
        )}

        {/* Content */}
        {!loading && !error && expenses.length > 0 && (
          <div className="space-y-6">
            {/* Year to Date Summary */}
            <div className="rounded-2xl bg-gradient-to-br from-emerald-600 to-teal-600 p-6 text-white shadow-xl">
              <p className="text-emerald-100 text-sm font-medium mb-1">Year to Date</p>
              <p className="text-4xl font-bold">{fmtMoney(summary.yearToDate)}</p>
              <p className="text-emerald-200 text-sm mt-2">
                {fmtMoney(summary.thisMonth)} this month
              </p>
            </div>

            {/* Category Breakdown */}
            <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">Spending by Category</h2>
              <div className="space-y-3">
                {sortedCategories.map((cat) => {
                  const amount = summary.byCategory[cat]
                  const percentage = maxCategoryAmount > 0 ? (amount / maxCategoryAmount) * 100 : 0

                  return (
                    <div key={cat} className="group">
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center gap-2">
                          <span className="text-lg">{CATEGORY_ICONS[cat]}</span>
                          <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                            {CATEGORY_LABELS[cat]}
                          </span>
                        </div>
                        <span className="text-sm font-semibold text-slate-900 dark:text-white">
                          {fmtMoney(amount)}
                        </span>
                      </div>
                      <div className="h-2.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-emerald-500 to-teal-500 rounded-full transition-all duration-500"
                          style={{ width: `${Math.max(percentage, amount > 0 ? 2 : 0)}%` }}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Recent Expenses */}
            <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800">
                <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Recent Expenses</h2>
              </div>
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {expenses.map((expense) => (
                  <div
                    key={expense.id}
                    className="relative overflow-hidden"
                    onTouchStart={(e) => handleTouchStart(e, expense.id)}
                    onTouchMove={(e) => handleTouchMove(e, expense.id)}
                    onTouchEnd={handleTouchEnd}
                  >
                    {/* Delete button (revealed on swipe) */}
                    <div className={`absolute inset-y-0 right-0 flex items-center transition-all duration-200 ${
                      swipedId === expense.id ? 'translate-x-0' : 'translate-x-full'
                    }`}>
                      <button
                        onClick={() => setShowDeleteConfirm(expense.id)}
                        className="h-full px-6 bg-red-500 hover:bg-red-600 text-white font-medium transition-colors"
                      >
                        Delete
                      </button>
                    </div>

                    {/* Expense row */}
                    <div
                      className={`relative bg-white dark:bg-slate-900 px-5 py-4 flex items-center gap-4 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-all duration-200 ${
                        swipedId === expense.id ? '-translate-x-20' : 'translate-x-0'
                      }`}
                      onClick={() => {
                        if (swipedId === expense.id) {
                          setSwipedId(null)
                        } else {
                          setEditingExpense(expense)
                        }
                      }}
                    >
                      {/* Date */}
                      <div className="w-14 text-center flex-shrink-0">
                        <p className="text-sm font-medium text-slate-900 dark:text-white">
                          {fmtDate(expense.expense_date)}
                        </p>
                      </div>

                      {/* Category icon */}
                      <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center flex-shrink-0">
                        <span className="text-lg">{CATEGORY_ICONS[expense.category]}</span>
                      </div>

                      {/* Details */}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-900 dark:text-white truncate">
                          {expense.category === 'vet_medical' && (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-semibold bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-400 mr-1.5">
                              Vet
                            </span>
                          )}
                          {expense.vendor || expense.description || CATEGORY_LABELS[expense.category]}
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                          {CATEGORY_LABELS[expense.category]}
                          {expense.description && expense.vendor && ` • ${expense.description}`}
                        </p>
                      </div>

                      {/* Amount */}
                      <div className="text-right flex-shrink-0">
                        <p className="text-sm font-bold text-slate-900 dark:text-white">
                          {fmtMoney(expense.amount)}
                        </p>
                      </div>

                      {/* Desktop delete button */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          setShowDeleteConfirm(expense.id)
                        }}
                        className="hidden sm:flex p-2 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-slate-400 hover:text-red-600 dark:hover:text-red-400 transition-colors"
                        aria-label="Delete expense"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
        className="sm:hidden fixed bottom-6 right-6 w-14 h-14 rounded-full bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white shadow-xl shadow-emerald-600/30 flex items-center justify-center transition-all active:scale-95 z-30"
        aria-label="Add expense"
      >
        <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 max-w-sm w-full shadow-xl">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-2">Delete Expense?</h3>
            <p className="text-slate-600 dark:text-slate-400 mb-6">
              This action cannot be undone.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowDeleteConfirm(null)
                  setSwipedId(null)
                }}
                className="flex-1 px-4 py-2.5 rounded-xl border-2 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 font-semibold text-slate-700 dark:text-slate-300 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDelete(showDeleteConfirm)}
                disabled={deletingId === showDeleteConfirm}
                className="flex-1 px-4 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white font-semibold transition-colors disabled:opacity-50"
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
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50">
      <div className="relative w-full sm:max-w-lg rounded-t-3xl sm:rounded-2xl bg-white dark:bg-slate-900 shadow-2xl max-h-[90vh] overflow-hidden">
        {/* Drag handle for mobile */}
        <div className="sm:hidden flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-slate-300 dark:bg-slate-700" />
        </div>

        {/* Header */}
        <div className="px-6 pt-4 sm:pt-6 pb-4 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-slate-900 dark:text-white">Edit Expense</h2>
            <button
              onClick={onClose}
              className="p-2 -mr-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
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
              className="flex-1 px-4 py-3 rounded-xl border-2 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || !isValid}
              className="flex-1 px-4 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
