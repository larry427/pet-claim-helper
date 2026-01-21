import { useState, useEffect, useCallback } from 'react'
import { supabase } from './supabase'

export type ExpenseCategory =
  | 'food_treats'
  | 'supplies_gear'
  | 'grooming'
  | 'training_boarding'
  | 'vet_medical'
  | 'other'

export type Expense = {
  id: string
  user_id: string
  amount: number
  category: ExpenseCategory
  expense_date: string
  vendor: string | null
  description: string | null
  receipt_url: string | null
  claim_id: string | null
  ocr_extracted: boolean
  ocr_confidence: number | null
  created_at: string
  updated_at: string
}

export type NewExpense = {
  amount: number
  category: ExpenseCategory
  expense_date: string
  vendor?: string | null
  description?: string | null
  receipt_url?: string | null
  claim_id?: string | null
  ocr_extracted?: boolean
  ocr_confidence?: number | null
}

export type ExpenseSummary = {
  thisMonth: number
  yearToDate: number
  byCategory: Record<ExpenseCategory, number>
}

// Human-readable category labels
export const CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  food_treats: 'Food & Treats',
  supplies_gear: 'Supplies & Gear',
  grooming: 'Grooming',
  training_boarding: 'Training & Boarding',
  vet_medical: 'Vet / Medical',
  other: 'Other'
}

// Category icons
export const CATEGORY_ICONS: Record<ExpenseCategory, string> = {
  food_treats: '🍖',
  supplies_gear: '🛒',
  grooming: '✂️',
  training_boarding: '🏠',
  vet_medical: '🏥',
  other: '📦'
}

export function useExpenses(userId: string | null) {
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [summary, setSummary] = useState<ExpenseSummary>({
    thisMonth: 0,
    yearToDate: 0,
    byCategory: {
      food_treats: 0,
      supplies_gear: 0,
      grooming: 0,
      training_boarding: 0,
      vet_medical: 0,
      other: 0
    }
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Calculate summary from expenses
  const calculateSummary = useCallback((expenseList: Expense[]): ExpenseSummary => {
    const now = new Date()
    const currentYear = now.getFullYear()
    const currentMonth = now.getMonth()

    const byCategory: Record<ExpenseCategory, number> = {
      food_treats: 0,
      supplies_gear: 0,
      grooming: 0,
      training_boarding: 0,
      vet_medical: 0,
      other: 0
    }

    let thisMonth = 0
    let yearToDate = 0

    for (const expense of expenseList) {
      const expenseDate = new Date(expense.expense_date)
      const expenseYear = expenseDate.getFullYear()
      const expenseMonth = expenseDate.getMonth()

      // Year to date
      if (expenseYear === currentYear) {
        yearToDate += expense.amount
        byCategory[expense.category] += expense.amount
      }

      // This month
      if (expenseYear === currentYear && expenseMonth === currentMonth) {
        thisMonth += expense.amount
      }
    }

    return { thisMonth, yearToDate, byCategory }
  }, [])

  // Fetch expenses
  const fetchExpenses = useCallback(async () => {
    if (!userId) return

    setLoading(true)
    setError(null)

    try {
      // Fetch YTD expenses for summary
      const currentYear = new Date().getFullYear()
      const startOfYear = `${currentYear}-01-01`

      const { data, error: fetchError } = await supabase
        .from('pet_expenses')
        .select('*')
        .eq('user_id', userId)
        .gte('expense_date', startOfYear)
        .order('expense_date', { ascending: false })

      if (fetchError) throw fetchError

      const expenseList = (data || []) as Expense[]
      setExpenses(expenseList)
      setSummary(calculateSummary(expenseList))
    } catch (e: any) {
      setError(e?.message || 'Failed to fetch expenses')
    } finally {
      setLoading(false)
    }
  }, [userId, calculateSummary])

  // Add expense
  const addExpense = useCallback(async (expense: NewExpense): Promise<{ success: boolean; error?: string }> => {
    if (!userId) return { success: false, error: 'Not logged in' }

    try {
      const { data, error: insertError } = await supabase
        .from('pet_expenses')
        .insert({
          ...expense,
          user_id: userId
        })
        .select()
        .single()

      if (insertError) throw insertError

      // Refresh expenses
      await fetchExpenses()

      return { success: true }
    } catch (e: any) {
      return { success: false, error: e?.message || 'Failed to add expense' }
    }
  }, [userId, fetchExpenses])

  // Update expense
  const updateExpense = useCallback(async (id: string, updates: Partial<NewExpense>): Promise<{ success: boolean; error?: string }> => {
    if (!userId) return { success: false, error: 'Not logged in' }

    try {
      const { error: updateError } = await supabase
        .from('pet_expenses')
        .update(updates)
        .eq('id', id)
        .eq('user_id', userId)

      if (updateError) throw updateError

      // Refresh expenses
      await fetchExpenses()

      return { success: true }
    } catch (e: any) {
      return { success: false, error: e?.message || 'Failed to update expense' }
    }
  }, [userId, fetchExpenses])

  // Delete expense
  const deleteExpense = useCallback(async (id: string): Promise<{ success: boolean; error?: string }> => {
    if (!userId) return { success: false, error: 'Not logged in' }

    try {
      const { error: deleteError } = await supabase
        .from('pet_expenses')
        .delete()
        .eq('id', id)
        .eq('user_id', userId)

      if (deleteError) throw deleteError

      // Refresh expenses
      await fetchExpenses()

      return { success: true }
    } catch (e: any) {
      return { success: false, error: e?.message || 'Failed to delete expense' }
    }
  }, [userId, fetchExpenses])

  // Initial fetch
  useEffect(() => {
    fetchExpenses()
  }, [fetchExpenses])

  return {
    expenses,
    summary,
    loading,
    error,
    addExpense,
    updateExpense,
    deleteExpense,
    refreshExpenses: fetchExpenses
  }
}
