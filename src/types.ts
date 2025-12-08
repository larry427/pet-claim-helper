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


