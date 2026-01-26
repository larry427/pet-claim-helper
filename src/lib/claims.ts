import { supabase } from './supabase'

export type NewClaim = {
  user_id: string
  pet_id: string | null
  service_date: string | null
  visit_title?: string | null
  invoice_number?: string | null
  clinic_name?: string | null
  clinic_address?: string | null
  clinic_phone?: string | null
  diagnosis?: string | null
  total_amount?: number | null
  line_items?: any
  filing_status?: string
  filing_deadline_days?: number | null
  filed_date?: string | null
  approved_date?: string | null
  pdf_path?: string | null
  visit_notes?: string | null  // What was discussed at this vet visit
  expense_category?: string | null
  reimbursed_amount?: number | null
  paid_date?: string | null
  medication_ids?: string[] | null
}

export type ClaimRow = NewClaim & { id: string }

export async function createClaim(claim: NewClaim): Promise<ClaimRow> {
  const { data, error } = await supabase
    .from('claims')
    .insert(claim)
    .select('*')
    .single()
  if (error) throw error
  return data as ClaimRow
}

export async function listClaims(userId: string) {
  try {
    const { data, error } = await supabase
      .from('claims')
      .select('*, pets(id, name, species, insurance_company, filing_deadline_days)')
      .eq('user_id', userId)
      .order('service_date', { ascending: false })
    if (error) {
      throw error
    }
    return data
  } catch (e) {
    throw e
  }
}

export async function updateClaim(id: string, updates: Partial<NewClaim>) {
  const { error } = await supabase.from('claims').update(updates).eq('id', id)
  if (error) throw error
}

export async function deleteClaim(id: string) {
  const { error } = await supabase.from('claims').delete().eq('id', id)
  if (error) throw error
}


