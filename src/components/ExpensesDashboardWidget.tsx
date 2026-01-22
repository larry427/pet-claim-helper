import React from 'react'
import { useExpenses } from '../lib/useExpenses'

type Props = {
  userId: string | null
  onViewAll: () => void
}

export default function ExpensesDashboardWidget({ userId, onViewAll }: Props) {
  const { summary, loading, error } = useExpenses(userId)

  // Format currency
  const fmtMoney = (n: number) => `$${n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`

  return (
    <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-slate-900 dark:text-white flex items-center gap-2">
          <span>🐾</span>
          Pet Expenses
        </h3>
      </div>

      {/* Loading state */}
      {loading && (
        <div className="flex items-center justify-center py-6">
          <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {/* Error state */}
      {error && !loading && (
        <div className="text-sm text-red-600 dark:text-red-400 py-4">
          Unable to load expenses
        </div>
      )}

      {/* Content */}
      {!loading && !error && (
        <div className="space-y-4">
          {/* This Month */}
          <div className="flex items-center justify-between">
            <span className="text-sm text-slate-500 dark:text-slate-400">This Month</span>
            <span className="text-xl font-bold text-slate-900 dark:text-white">
              {fmtMoney(summary.thisMonth)}
            </span>
          </div>

          {/* Year to Date */}
          <div className="flex items-center justify-between">
            <span className="text-sm text-slate-500 dark:text-slate-400">Year to Date</span>
            <span className="text-xl font-bold text-slate-900 dark:text-white">
              {fmtMoney(summary.yearToDate)}
            </span>
          </div>

          {/* View All link */}
          <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
            <button
              onClick={() => {
                onViewAll()
                setTimeout(() => {
                  const expensesTop = document.getElementById('expenses-page-top')
                  if (expensesTop) {
                    expensesTop.scrollIntoView({ behavior: 'smooth', block: 'start' })
                  }
                }, 100)
              }}
              className="text-sm text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300 font-medium flex items-center gap-1 transition-colors"
            >
              View All
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
