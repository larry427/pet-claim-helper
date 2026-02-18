import React, { useState } from 'react'
import { updateClaim } from '../lib/claims'
import { X } from 'lucide-react'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type EditClaimModalProps = {
  claim: any
  onClose: () => void
  onSave: () => Promise<void>
}

const STATUS_OPTIONS = [
  { value: 'not_submitted', label: 'Pending Submission' },
  { value: 'submitted', label: 'Submitted' },
  { value: 'paid', label: 'Paid' },
  { value: 'denied', label: 'Denied' },
]

const CATEGORY_OPTIONS = [
  { value: 'insured', label: 'Insured' },
  { value: 'not_insured', label: 'Not Insured' },
  { value: 'maybe_insured', label: 'Maybe Insured' },
]

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function EditClaimModal({ claim, onClose, onSave }: EditClaimModalProps) {
  const [clinicName, setClinicName] = useState(claim.clinic_name || '')
  const [serviceDate, setServiceDate] = useState(claim.service_date || '')
  const [totalAmount, setTotalAmount] = useState(
    claim.total_amount != null ? String(claim.total_amount) : ''
  )
  const [expenseCategory, setExpenseCategory] = useState(claim.expense_category || 'insured')
  const [filingStatus, setFilingStatus] = useState(claim.filing_status || 'not_submitted')
  const [reimbursedAmount, setReimbursedAmount] = useState(
    claim.reimbursed_amount != null ? String(claim.reimbursed_amount) : ''
  )

  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSave = async () => {
    setError(null)
    setIsSaving(true)
    try {
      const updates: Record<string, any> = {
        clinic_name: clinicName.trim() || null,
        service_date: serviceDate || null,
        total_amount: totalAmount ? Number(totalAmount) : null,
        expense_category: expenseCategory,
        filing_status: filingStatus,
        reimbursed_amount:
          filingStatus === 'paid' && reimbursedAmount
            ? Number(reimbursedAmount)
            : null,
      }
      await updateClaim(claim.id, updates)
      await onSave()
    } catch (e: any) {
      setError(e?.message || 'Failed to save changes')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl max-w-lg w-full mx-4 max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-slate-100 dark:border-slate-800">
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">Edit Claim</h2>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-slate-400 hover:text-slate-600"
          >
            <X size={20} />
          </button>
        </div>

        {/* Form */}
        <div className="overflow-y-auto px-6 py-5 space-y-5 flex-1">
          {/* Clinic Name */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              Clinic / Hospital
            </label>
            <input
              type="text"
              value={clinicName}
              onChange={(e) => setClinicName(e.target.value)}
              placeholder="e.g. City Vet Clinic"
              className="w-full rounded-xl border-2 border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-3 text-slate-900 dark:text-white placeholder:text-slate-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 transition-colors"
            />
          </div>

          {/* Service Date */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              Visit / Service Date
            </label>
            <input
              type="date"
              value={serviceDate}
              onChange={(e) => setServiceDate(e.target.value)}
              max={new Date().toISOString().split('T')[0]}
              className="w-full rounded-xl border-2 border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-3 text-slate-900 dark:text-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 transition-colors"
            />
          </div>

          {/* Total Amount */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              Total Bill Amount
            </label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-lg text-slate-400 font-medium">$</span>
              <input
                type="number"
                step="0.01"
                min="0"
                value={totalAmount}
                onChange={(e) => setTotalAmount(e.target.value)}
                placeholder="0.00"
                className="w-full rounded-xl border-2 border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 pl-9 pr-4 py-3 text-slate-900 dark:text-white placeholder:text-slate-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 transition-colors text-lg font-medium"
              />
            </div>
          </div>

          {/* Expense Category */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              Insurance Category
            </label>
            <div className="grid grid-cols-3 gap-2">
              {CATEGORY_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setExpenseCategory(opt.value)}
                  className={`py-2.5 px-3 rounded-xl border-2 text-sm font-medium transition-all duration-200 ${
                    expenseCategory === opt.value
                      ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300 ring-2 ring-emerald-500/20'
                      : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:border-slate-300'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Filing Status */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              Claim Status
            </label>
            <div className="grid grid-cols-2 gap-2">
              {STATUS_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setFilingStatus(opt.value)}
                  className={`py-2.5 px-3 rounded-xl border-2 text-sm font-medium transition-all duration-200 ${
                    filingStatus === opt.value
                      ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300 ring-2 ring-emerald-500/20'
                      : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:border-slate-300'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Reimbursed Amount — only when status is Paid */}
          {filingStatus === 'paid' && (
            <div className="animate-fade-in-up">
              <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                Reimbursed Amount
              </label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-lg text-slate-400 font-medium">$</span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={reimbursedAmount}
                  onChange={(e) => setReimbursedAmount(e.target.value)}
                  placeholder="0.00"
                  className="w-full rounded-xl border-2 border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 pl-9 pr-4 py-3 text-slate-900 dark:text-white placeholder:text-slate-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 transition-colors text-lg font-medium"
                />
              </div>
            </div>
          )}

          {/* Error message */}
          {error && (
            <div className="px-4 py-3 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 text-sm">
              {error}
            </div>
          )}
        </div>

        {/* Footer buttons */}
        <div className="flex items-center gap-3 px-6 py-5 border-t border-slate-100 dark:border-slate-800">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-3 px-4 rounded-xl border-2 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-semibold hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving}
            className="flex-1 py-3 px-4 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white font-semibold shadow-lg shadow-emerald-500/25 hover:shadow-emerald-500/40 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSaving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  )
}
