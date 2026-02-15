export type LineItem = {
  description: string
  amount: string
}

export type ExtractedBill = {
  clinicName: string
  clinicAddress: string
  clinicPhone?: string
  petName: string
  dateOfService: string
  totalAmount: string
  diagnosis: string
  lineItems: LineItem[]
  invoiceNumber?: string
}

export type PetSpecies = 'dog' | 'cat'

export type InsuranceCompany = string

export type PetProfile = {
  id: string
  name: string
  species: PetSpecies
  color?: string
  photo_url?: string | null
  insuranceCompany: InsuranceCompany
  policyNumber: string
  ownerName?: string
  // ownerAddress removed from form
  ownerPhone?: string
  filingDeadlineDays?: number
  filing_deadline_days?: number
  monthly_premium?: number | null
  deductible_per_claim?: number | null
  coverage_start_date?: string | null
  insurance_pays_percentage?: number | null // decimal 0-1
  annual_coverage_limit?: number | null
  healthy_paws_pet_id?: string | null
  pumpkin_account_number?: string | null
  spot_account_number?: string | null
  breed?: string | null
  gender?: string | null
  date_of_birth?: string | null
  // Odie Pet Insurance API integration
  odie_policy_number?: string | null
  odie_pet_id?: string | null
  odie_user_id?: string | null
  odie_connected?: boolean
}

export type ExtractedPetGroup = {
  petName: string
  petSpecies?: string
  lineItems: LineItem[]
  subtotal?: string
}

export type MultiPetExtracted = {
  clinicName: string
  clinicAddress: string
  clinicPhone?: string
  dateOfService: string
  diagnosis: string
  pets: ExtractedPetGroup[]
  invoiceNumber?: string
}

// Medication types
export type FrequencyDaily = 'Once daily' | 'Twice daily' | 'Three times daily'
export type FrequencyPeriodic = 'Weekly' | 'Monthly' | 'Every 3 months'
export type FrequencyAsNeeded = 'As needed'
export type Frequency = FrequencyDaily | FrequencyPeriodic | FrequencyAsNeeded

export type ReminderTimesDaily = string[]
export type ReminderTimesWeekly = { type: 'weekly', dayOfWeek: number, time: string }
export type ReminderTimesMonthly = { type: 'monthly', dayOfMonth: number, time: string }
export type ReminderTimesQuarterly = { type: 'quarterly', dayOfMonth: number, time: string }
export type ReminderTimesAsNeeded = { type: 'as_needed' }
export type ReminderTimes = ReminderTimesDaily | ReminderTimesWeekly | ReminderTimesMonthly | ReminderTimesQuarterly | ReminderTimesAsNeeded

export type MedicationRow = {
  id: string
  user_id: string
  pet_id: string
  claim_id: string | null
  medication_name: string
  dosage: string | null
  frequency: Frequency
  reminder_times: ReminderTimes
  start_date: string
  end_date: string | null
  created_at?: string
  updated_at?: string
}

export type DoseRow = {
  id: string
  medication_id: string
  user_id: string
  scheduled_time: string
  given_time: string | null
  status: 'pending' | 'given'
}

