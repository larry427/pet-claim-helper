import React, { useState } from 'react'
import { ExpenseCategory, CATEGORY_LABELS, CATEGORY_ICONS, NewExpense } from '../lib/useExpenses'

type InitialData = {
  amount?: number
  vendor?: string
  category?: ExpenseCategory
  expenseDate?: string
  description?: string
}

type Props = {
  onSubmit: (expense: NewExpense) => Promise<{ success: boolean; error?: string }>
  onCancel: () => void
  onSuccess: () => void
  initialData?: InitialData
}

const CATEGORIES: ExpenseCategory[] = [
  'food_treats',
  'supplies_gear',
  'grooming',
  'training_boarding',
  'vet_medical',
  'other'
]

// Helper to check if a date is more than N days in the past
const isDateOlderThan = (dateStr: string, days: number): boolean => {
  const date = new Date(dateStr + 'T00:00:00')
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffDays = diffMs / (1000 * 60 * 60 * 24)
  return diffDays > days
}

// Helper to format date for display
const formatDateForDisplay = (dateStr: string): string => {
  const date = new Date(dateStr + 'T00:00:00')
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function ManualExpenseForm({ onSubmit, onCancel, onSuccess, initialData }: Props) {
  const today = new Date().toISOString().split('T')[0]

  // Check if OCR date is too old (> 30 days) and needs to be overridden
  const ocrDateWasOverridden = Boolean(
    initialData?.expenseDate && isDateOlderThan(initialData.expenseDate, 30)
  )
  const originalOcrDate = initialData?.expenseDate

  // Initialize state with initialData if provided
  // If OCR date is > 30 days old, default to today instead
  const [amount, setAmount] = useState(initialData?.amount?.toString() ?? '')
  const [category, setCategory] = useState<ExpenseCategory | ''>(initialData?.category ?? '')
  const [expenseDate, setExpenseDate] = useState(() => {
    if (initialData?.expenseDate) {
      // If OCR date is more than 30 days old, use today instead
      if (isDateOlderThan(initialData.expenseDate, 30)) {
        return today
      }
      return initialData.expenseDate
    }
    return today
  })
  const [vendor, setVendor] = useState(initialData?.vendor ?? '')
  const [description, setDescription] = useState(initialData?.description ?? '')

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showSuccess, setShowSuccess] = useState(false)

  // Track if this form was pre-filled from OCR
  const isFromOcr = Boolean(initialData)

  // Validation
  const amountNum = parseFloat(amount)
  const isValidAmount = !isNaN(amountNum) && amountNum > 0
  const isOtherCategory = category === 'other'
  const needsDescription = isOtherCategory && !description.trim()
  const isDateTooOld = expenseDate ? isDateOlderThan(expenseDate, 365) : false
  const isValid = isValidAmount && category !== '' && expenseDate && !needsDescription && !isDateTooOld

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    console.log('[ManualExpenseForm] handleSubmit called')
    console.log('[ManualExpenseForm] Form state:', { amount, category, expenseDate, vendor, description, isFromOcr })
    console.log('[ManualExpenseForm] isValid:', isValid, '| isValidAmount:', isValidAmount, '| needsDescription:', needsDescription)

    if (!isValid) {
      if (!isValidAmount) {
        setError('Please enter a valid amount')
      } else if (category === '') {
        setError('Please select a category')
      } else if (needsDescription) {
        setError('Please add a description for "Other" expenses')
      } else if (isDateTooOld) {
        setError('Date cannot be more than 1 year in the past')
      }
      return
    }

    setError(null)
    setSaving(true)

    const expenseData = {
      amount: amountNum,
      category: category as ExpenseCategory,
      expense_date: expenseDate,
      vendor: vendor.trim() || null,
      description: description.trim() || null,
      ocr_extracted: isFromOcr
    }

    console.log('[ManualExpenseForm] Submitting expense:', expenseData)

    const result = await onSubmit(expenseData)

    console.log('[ManualExpenseForm] Submit result:', result)

    if (result.success) {
      setShowSuccess(true)
      setTimeout(() => {
        onSuccess()
      }, 1200)
    } else {
      setError(result.error || 'Failed to save expense')
      setSaving(false)
    }
  }

  // Success state
  if (showSuccess) {
    return (
      <div className="flex flex-col items-center justify-center py-12 px-6 animate-fadeIn">
        <div className="w-20 h-20 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center mb-6">
          <svg className="w-10 h-10 text-emerald-600 dark:text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2">Expense Added!</h3>
        <p className="text-slate-600 dark:text-slate-400">
          ${amountNum.toFixed(2)} • {CATEGORY_LABELS[category as ExpenseCategory]}
        </p>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="p-6">
      {/* OCR indicator */}
      {isFromOcr && (
        <div className="mb-5 rounded-xl bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 px-4 py-3 text-sm text-blue-700 dark:text-blue-400 flex items-start gap-3">
          <svg className="w-5 h-5 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span>Pre-filled from receipt scan. Please review and adjust if needed.</span>
        </div>
      )}

      {/* Date override notice */}
      {ocrDateWasOverridden && originalOcrDate && (
        <div className="mb-5 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 px-4 py-3 text-sm text-amber-700 dark:text-amber-400 flex items-start gap-3">
          <svg className="w-5 h-5 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span>
            Receipt date was {formatDateForDisplay(originalOcrDate)}. Updated to today — you can change if needed.
          </span>
        </div>
      )}

      {error && (
        <div className="mb-5 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 px-4 py-3 text-sm text-red-700 dark:text-red-400 flex items-start gap-3">
          <svg className="w-5 h-5 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span>{error}</span>
        </div>
      )}

      <div className="space-y-6">
        {/* Amount - Large, prominent input */}
        <div>
          <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
            Amount <span className="text-red-500">*</span>
          </label>
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-2xl font-semibold text-slate-400 dark:text-slate-500">$</span>
            <input
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0.01"
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full rounded-xl border-2 border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 pl-12 pr-4 py-4 text-2xl font-semibold text-slate-900 dark:text-white placeholder-slate-300 dark:placeholder-slate-600 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 transition-all"
              autoFocus={!isFromOcr}
            />
          </div>
        </div>

        {/* Category - Visual selection grid */}
        <div>
          <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">
            Category <span className="text-red-500">*</span>
          </label>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {CATEGORIES.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setCategory(cat)}
                className={`
                  relative flex flex-col items-center justify-center p-4 rounded-xl border-2 transition-all
                  ${category === cat
                    ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20 ring-2 ring-emerald-500/20'
                    : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-slate-300 dark:hover:border-slate-600'
                  }
                `}
              >
                <span className="text-2xl mb-1">{CATEGORY_ICONS[cat]}</span>
                <span className={`text-xs font-medium text-center leading-tight ${
                  category === cat
                    ? 'text-emerald-700 dark:text-emerald-400'
                    : 'text-slate-600 dark:text-slate-400'
                }`}>
                  {CATEGORY_LABELS[cat]}
                </span>
                {category === cat && (
                  <div className="absolute top-2 right-2">
                    <svg className="w-4 h-4 text-emerald-600 dark:text-emerald-400" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                  </div>
                )}
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
            className={`w-full rounded-xl border-2 bg-white dark:bg-slate-800 px-4 py-3.5 text-slate-900 dark:text-white focus:ring-2 transition-all ${
              isDateTooOld
                ? 'border-red-300 dark:border-red-700 focus:border-red-500 focus:ring-red-500/20'
                : 'border-slate-200 dark:border-slate-700 focus:border-emerald-500 focus:ring-emerald-500/20'
            }`}
          />
          {isDateTooOld && (
            <p className="mt-1.5 text-xs text-red-600 dark:text-red-400 flex items-center gap-1">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Date cannot be more than 1 year in the past
            </p>
          )}
        </div>

        {/* Vendor (optional) */}
        <div>
          <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
            Vendor <span className="text-slate-400 font-normal">(optional)</span>
          </label>
          <input
            type="text"
            placeholder="e.g., Petco, Chewy, PetSmart"
            value={vendor}
            onChange={(e) => setVendor(e.target.value)}
            className="w-full rounded-xl border-2 border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-3.5 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 transition-all"
          />
        </div>

        {/* Description/Notes */}
        <div>
          <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
            Notes {isOtherCategory ? <span className="text-red-500">*</span> : <span className="text-slate-400 font-normal">(optional)</span>}
          </label>
          <textarea
            rows={2}
            placeholder={isOtherCategory ? "Required for 'Other' category" : "Add any notes about this expense"}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className={`w-full rounded-xl border-2 bg-white dark:bg-slate-800 px-4 py-3.5 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:ring-2 transition-all resize-none ${
              isOtherCategory && !description.trim()
                ? 'border-amber-300 dark:border-amber-700 focus:border-amber-500 focus:ring-amber-500/20'
                : 'border-slate-200 dark:border-slate-700 focus:border-emerald-500 focus:ring-emerald-500/20'
            }`}
          />
          {isOtherCategory && !description.trim() && (
            <p className="mt-1.5 text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Please describe what this expense is for
            </p>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-3 mt-8">
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="flex-1 px-4 py-3.5 rounded-xl border-2 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors text-slate-700 dark:text-slate-300 font-semibold disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={saving || !isValid}
          className="flex-1 px-4 py-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-emerald-600/20 hover:shadow-emerald-600/30"
        >
          {saving ? (
            <span className="flex items-center justify-center gap-2">
              <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              Saving...
            </span>
          ) : (
            'Save Expense'
          )}
        </button>
      </div>
    </form>
  )
}
