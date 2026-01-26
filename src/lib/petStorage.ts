import type { PetProfile } from '../types'
import { supabase } from './supabase'

// Supabase-backed helpers
export async function dbLoadPets(userId: string): Promise<PetProfile[]> {
  try {
    const { data, error} = await supabase
      .from('pets')
      .select('id, name, species, color, photo_url, insurance_company, policy_number, owner_name, owner_phone, filing_deadline_days, monthly_premium, deductible_per_claim, coverage_start_date, insurance_pays_percentage, annual_coverage_limit, healthy_paws_pet_id, pumpkin_account_number, spot_account_number, figo_policy_number, breed, gender, date_of_birth')
      .eq('user_id', userId)
      .order('created_at', { ascending: true })
    if (error) {
      throw error
    }
    const mapped = (data || []).map((p: any) => ({
      id: p.id,
      name: p.name,
      species: p.species,
      color: p.color || (p.species === 'dog' ? '#3B82F6' : p.species === 'cat' ? '#F97316' : '#6B7280'),
      photo_url: p.photo_url || null,
      insuranceCompany: p.insurance_company,
      policyNumber: p.policy_number,
      ownerName: p.owner_name,
      ownerPhone: p.owner_phone,
      filing_deadline_days: p.filing_deadline_days,
      monthly_premium: p.monthly_premium ?? null,
      deductible_per_claim: p.deductible_per_claim ?? null,
      coverage_start_date: p.coverage_start_date || null,
      insurance_pays_percentage: p.insurance_pays_percentage ?? null,
      annual_coverage_limit: p.annual_coverage_limit ?? null,
      healthy_paws_pet_id: p.healthy_paws_pet_id || null,
      pumpkin_account_number: p.pumpkin_account_number || null,
      spot_account_number: p.spot_account_number || null,
      figo_policy_number: p.figo_policy_number || null,
      breed: p.breed || null,
      gender: p.gender || null,
      date_of_birth: p.date_of_birth || null,
    }))
    return mapped
  } catch (e) {
    throw e
  }
}

export async function dbUpsertPet(userId: string, pet: PetProfile): Promise<void> {
  const color = pet.color || (pet.species === 'dog' ? '#3B82F6' : pet.species === 'cat' ? '#F97316' : '#6B7280')
  const payload = {
    id: pet.id,
    user_id: userId,
    name: pet.name,
    species: pet.species,
    color,
    photo_url: pet.photo_url || null,
    insurance_company: pet.insuranceCompany,
    policy_number: pet.policyNumber,
    owner_name: pet.ownerName || '',
    owner_phone: pet.ownerPhone || '',
    filing_deadline_days: (pet as any).filing_deadline_days || (pet as any).filingDeadlineDays || null,
    monthly_premium: (pet as any).monthly_premium ?? null,
    deductible_per_claim: (pet as any).deductible_per_claim ?? null,
    coverage_start_date: (pet as any).coverage_start_date || null,
    insurance_pays_percentage: (pet as any).insurance_pays_percentage ?? null,
    annual_coverage_limit: (pet as any).annual_coverage_limit ?? null,
    healthy_paws_pet_id: (pet as any).healthy_paws_pet_id || null,
    pumpkin_account_number: pet.pumpkin_account_number || null,
    spot_account_number: pet.spot_account_number || null,
    figo_policy_number: (pet as any).figo_policy_number || null,
    breed: pet.breed || null,
    gender: pet.gender || null,
    date_of_birth: pet.date_of_birth || null,
  }

  const { data, error } = await supabase.from('pets').upsert(payload, { onConflict: 'id' }).select()

  if (error) throw error
}

export async function dbDeletePet(userId: string, petId: string): Promise<void> {
  const { error } = await supabase.from('pets').delete().eq('user_id', userId).eq('id', petId)
  if (error) throw error
}

export async function dbEnsureProfile(userId: string, email: string | null): Promise<void> {
  // Upsert profile row so FK on pets succeeds
  const payload = { id: userId, email: email ?? null }
  const { error } = await supabase.from('profiles').upsert(payload, { onConflict: 'id' }).select()
  if (error) throw error
}


// Create pet (used by onboarding)
export async function createPet(pet: any): Promise<any> {
  const { data, error } = await supabase
    .from('pets')
    .insert([
      {
        user_id: pet.user_id,
        name: pet.name,
        species: pet.species,
        color: pet.color ?? null,
        photo_url: pet.photo_url ?? null,
        insurance_company: pet.insurance_company ?? null,
        policy_number: pet.policy_number ?? null,
        healthy_paws_pet_id: pet.healthy_paws_pet_id ?? null,
        spot_account_number: pet.spot_account_number ?? null,
        // optional extras
        breed: pet.breed ?? null,
        weight_lbs: pet.weight_lbs ?? null,
        monthly_premium: pet.monthly_premium ?? null,
        deductible_per_claim: pet.deductible_per_claim ?? null,
        coverage_start_date: pet.coverage_start_date ?? null,
        annual_coverage_limit: pet.annual_coverage_limit ?? null,
        insurance_pays_percentage: pet.insurance_pays_percentage ?? null,
        filing_deadline_days: pet.filing_deadline_days ?? null,
      },
    ])
    .select('*')
    .single()
  if (error) throw error
  return data
}


