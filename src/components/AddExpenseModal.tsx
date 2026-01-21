import React, { useState, useEffect } from 'react'
import ManualExpenseForm from './ManualExpenseForm'
import { NewExpense } from '../lib/useExpenses'

type Props = {
  onClose: () => void
  onSubmit: (expense: NewExpense) => Promise<{ success: boolean; error?: string }>
}

type ModalView = 'choose' | 'manual' | 'scan'

export default function AddExpenseModal({ onClose, onSubmit }: Props) {
  const [view, setView] = useState<ModalView>('choose')
  const [isClosing, setIsClosing] = useState(false)
  const [isVisible, setIsVisible] = useState(false)

  // Animate in on mount
  useEffect(() => {
    requestAnimationFrame(() => {
      setIsVisible(true)
    })
  }, [])

  // Animate out before closing
  const handleClose = () => {
    setIsClosing(true)
    setTimeout(() => {
      onClose()
    }, 200)
  }

  const handleSuccess = () => {
    // Brief delay to show success state, then close
    setTimeout(() => {
      handleClose()
    }, 300)
  }

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      handleClose()
    }
  }

  return (
    <div
      className={`fixed inset-0 z-50 flex items-end sm:items-center justify-center transition-all duration-200 ${
        isVisible && !isClosing ? 'bg-black/50' : 'bg-black/0'
      }`}
      onClick={handleBackdropClick}
    >
      <div
        className={`relative w-full sm:max-w-lg rounded-t-3xl sm:rounded-2xl bg-white dark:bg-slate-900 shadow-2xl border border-slate-200 dark:border-slate-800 max-h-[90vh] overflow-hidden transition-all duration-200 ${
          isVisible && !isClosing
            ? 'translate-y-0 opacity-100'
            : 'translate-y-8 opacity-0'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drag handle for mobile */}
        <div className="sm:hidden flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-slate-300 dark:bg-slate-700" />
        </div>

        {/* Header */}
        <div className="sticky top-0 bg-white dark:bg-slate-900 px-6 pt-4 sm:pt-6 pb-4 border-b border-slate-100 dark:border-slate-800 z-10">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-slate-900 dark:text-white">
                {view === 'choose' && 'Add Expense'}
                {view === 'manual' && 'New Expense'}
                {view === 'scan' && 'Scan Receipt'}
              </h2>
              {view === 'choose' && (
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                  Track your pet spending
                </p>
              )}
            </div>
            <button
              onClick={handleClose}
              className="p-2 -mr-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              aria-label="Close"
            >
              <svg className="w-5 h-5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Back button when in sub-view */}
          {view !== 'choose' && (
            <button
              onClick={() => setView('choose')}
              className="flex items-center gap-1 mt-3 text-sm text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300 font-medium transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Back
            </button>
          )}
        </div>

        {/* Content */}
        <div className="overflow-y-auto max-h-[calc(90vh-120px)]">
          {view === 'choose' && (
            <div className="p-6">
              <div className="grid grid-cols-2 gap-4">
                {/* Scan Receipt Option */}
                <button
                  onClick={() => {}}
                  disabled
                  className="relative flex flex-col items-center justify-center p-6 rounded-2xl border-2 border-dashed border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/50 opacity-60 cursor-not-allowed"
                >
                  <div className="w-14 h-14 rounded-2xl bg-slate-100 dark:bg-slate-700 flex items-center justify-center mb-3">
                    <svg className="w-7 h-7 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                  </div>
                  <span className="text-sm font-semibold text-slate-500 dark:text-slate-400 mb-1">Scan Receipt</span>
                  <span className="text-xs text-slate-400 dark:text-slate-500 bg-slate-200 dark:bg-slate-700 px-2 py-0.5 rounded-full">
                    Coming Soon
                  </span>
                </button>

                {/* Manual Entry Option */}
                <button
                  onClick={() => setView('manual')}
                  className="relative flex flex-col items-center justify-center p-6 rounded-2xl border-2 border-emerald-200 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-900/20 hover:bg-emerald-50 dark:hover:bg-emerald-900/30 hover:border-emerald-300 dark:hover:border-emerald-700 transition-all group"
                >
                  <div className="w-14 h-14 rounded-2xl bg-emerald-100 dark:bg-emerald-800/50 flex items-center justify-center mb-3 group-hover:scale-105 transition-transform">
                    <svg className="w-7 h-7 text-emerald-600 dark:text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                  </div>
                  <span className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">Manual Entry</span>
                  <span className="text-xs text-emerald-600/70 dark:text-emerald-500 mt-0.5">Quick & easy</span>
                </button>
              </div>

              {/* Quick stats teaser */}
              <div className="mt-6 p-4 rounded-xl bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-800/50 dark:to-slate-800 border border-slate-200 dark:border-slate-700">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
                    <span className="text-lg">🐾</span>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Track all your pet expenses</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">Food, supplies, grooming, training & more</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {view === 'manual' && (
            <ManualExpenseForm
              onSubmit={onSubmit}
              onCancel={() => setView('choose')}
              onSuccess={handleSuccess}
            />
          )}

          {view === 'scan' && (
            <div className="p-6 text-center">
              <p className="text-slate-500 dark:text-slate-400">Receipt scanning coming soon!</p>
            </div>
          )}
        </div>

        {/* Safe area padding for iOS */}
        <div className="h-safe-area-inset-bottom" />
      </div>
    </div>
  )
}
