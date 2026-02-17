import { supabase } from './supabase'

export type OdiePolicy = {
  policyNumber: string
  policyStatus: string
  active: boolean
  petName: string
  species: string
  deductibleAmount: number
  deductibleBalance: number
  standardAnnualLimit: number
  annualLimitBalance: number
  coinsurancePercent: number
  policyStartDate: string
  accidentEffectiveDate: string
  illnessEffectiveDate: string
  office_visits: boolean
  pet: { id: string } | null
  user: { id: string } | null
  monthlyPremium: number | null
  breedDescription: string | null
  gender: string | null
}

export async function fetchOdiePolicy(policyNumber: string): Promise<{ ok: boolean; policy?: OdiePolicy; error?: string }> {
  const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8787'
  const { data: sessionData } = await supabase.auth.getSession()
  const token = sessionData?.session?.access_token

  const response = await fetch(`${apiUrl}/api/odie/policy/${encodeURIComponent(policyNumber.trim())}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })

  const data = await response.json()

  if (!response.ok || !data.ok) {
    if (response.status === 404) {
      return { ok: false, error: 'Policy not found. Please check your policy number and try again.' }
    }
    return { ok: false, error: data.error || 'Unable to connect to Odie right now. Please try again later or enter your details manually.' }
  }

  return { ok: true, policy: data.policy }
}

/** Fire-and-forget: register our webhook URL with Odie for this policy */
export function registerPolicyWebhook(policyNumber: string): void {
  const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8787'
  supabase.auth.getSession().then(({ data }) => {
    const token = data?.session?.access_token
    fetch(`${apiUrl}/api/odie/policy/${encodeURIComponent(policyNumber)}/webhook`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ webhook: 'https://pet-claim-helper.onrender.com/api/odie/webhook' }),
    }).catch(err => console.error('[Odie] Webhook registration failed:', err))
  })
}

export function parsePolicyStartDate(raw: string | null | undefined): string | null {
  if (!raw) return null
  try {
    const d = new Date(raw)
    if (Number.isNaN(d.getTime())) return null
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
  } catch {
    return null
  }
}

export async function saveOdiePolicyToPet(
  petId: string,
  policy: OdiePolicy,
  updateNameSpecies: boolean
): Promise<void> {
  const updatePayload: Record<string, any> = {
    odie_policy_number: policy.policyNumber,
    odie_pet_id: policy.pet?.id || null,
    odie_user_id: policy.user?.id || null,
    odie_connected: true,
    policy_number: policy.policyNumber,
    deductible_per_claim: policy.deductibleAmount,
    insurance_pays_percentage: policy.coinsurancePercent / 100,
    annual_coverage_limit: policy.standardAnnualLimit,
    coverage_start_date: parsePolicyStartDate(policy.policyStartDate),
    monthly_premium: policy.monthlyPremium ?? null,
  }

  if (updateNameSpecies) {
    updatePayload.name = policy.petName
    updatePayload.species = policy.species?.toLowerCase() === 'cat' ? 'cat' : 'dog'
    if (policy.breedDescription) {
      updatePayload.breed = policy.breedDescription
    }
    if (policy.gender) {
      updatePayload.gender = policy.gender
    }
  }

  const { error } = await supabase.from('pets').update(updatePayload).eq('id', petId)
  if (error) throw error
}
