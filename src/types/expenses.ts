// Expense Tracking Types

export interface Expense {
  id: string
  user_id: string
  pet_id: string | null
  category: ExpenseCategory
  subcategory: string
  item_name: string
  amount: number
  purchase_date: string
  vendor: string
  notes: string | null
  receipt_url: string | null
  is_subscription: boolean
  subscription_frequency_days: number | null
  next_delivery_date: string | null
  reorder_url: string | null
  created_at: string
  updated_at: string
}

export type ExpenseCategory = 'food' | 'enrichment' | 'services' | 'supplies'

interface ExpenseCategoryConfig {
  label: string
  icon: string
  subcategories: readonly string[]
}

export const EXPENSE_CATEGORIES: Record<ExpenseCategory, ExpenseCategoryConfig> = {
  food: {
    label: 'Food & Consumables',
    icon: '🍖',
    subcategories: ['treats', 'supplements', 'other_food'] as const
  },
  enrichment: {
    label: 'Enrichment & Training',
    icon: '🎾',
    subcategories: ['dog_walking', 'training', 'pack_walks', 'classes', 'other_enrichment'] as const
  },
  services: {
    label: 'Services',
    icon: '✂️',
    subcategories: ['grooming', 'daycare', 'boarding', 'other_services'] as const
  },
  supplies: {
    label: 'Toys & Supplies',
    icon: '🧸',
    subcategories: ['toys', 'supplies', 'beds_crates', 'other_supplies'] as const
  }
} as const
