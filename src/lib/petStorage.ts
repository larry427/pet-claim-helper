import type { PetProfile } from '../types'
import { supabase } from './supabase'

// Supabase-backed helpers
export async function dbLoadPets(userId: string): Promise<PetProfile[]> {
  const { data, error } = await supabase
    .from('pets')
    .select('id, name, species, color, insurance_company, policy_number, owner_name, owner_address, owner_phone, filing_deadline_days')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })
  if (error) throw error
  const mapped = (data || []).map((p: any) => ({
    id: p.id,
    name: p.name,
    species: p.species,
    color: p.color,
    insuranceCompany: p.insurance_company,
    policyNumber: p.policy_number,
    ownerName: p.owner_name,
    ownerAddress: p.owner_address,
    ownerPhone: p.owner_phone,
    filing_deadline_days: p.filing_deadline_days,
  }))
  // Debug
  // eslint-disable-next-line no-console
  console.log('[dbLoadPets] userId=', userId, 'count=', mapped.length)
  return mapped
}

export async function dbUpsertPet(userId: string, pet: PetProfile): Promise<void> {
  const color = pet.color || (pet.species === 'dog' ? '#3B82F6' : pet.species === 'cat' ? '#F97316' : '#6B7280')
  const payload = {
    id: pet.id,
    user_id: userId,
    name: pet.name,
    species: pet.species,
    color,
    insurance_company: pet.insuranceCompany,
    policy_number: pet.policyNumber,
    owner_name: pet.ownerName || '',
    owner_address: pet.ownerAddress || '',
    owner_phone: pet.ownerPhone || '',
    filing_deadline_days: (pet as any).filing_deadline_days || (pet as any).filingDeadlineDays || null,
  }
  // Debug
  // eslint-disable-next-line no-console
  console.log('[dbUpsertPet] userId=', userId, 'payload=', payload)
  const { error } = await supabase.from('pets').upsert(payload, { onConflict: 'id' }).select()
  if (error) throw error
}

export async function dbDeletePet(userId: string, petId: string): Promise<void> {
  // Debug
  // eslint-disable-next-line no-console
  console.log('[dbDeletePet] userId=', userId, 'petId=', petId)
  const { error } = await supabase.from('pets').delete().eq('user_id', userId).eq('id', petId)
  if (error) throw error
}

export async function dbEnsureProfile(userId: string, email: string | null): Promise<void> {
  // Upsert profile row so FK on pets succeeds
  const payload = { id: userId, email: email ?? null }
  // eslint-disable-next-line no-console
  console.log('[dbEnsureProfile] upserting profile', payload)
  const { error } = await supabase.from('profiles').upsert(payload, { onConflict: 'id' }).select()
  if (error) throw error
}


