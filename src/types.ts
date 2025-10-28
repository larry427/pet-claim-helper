export type LineItem = {
  description: string
  amount: string
}

export type ExtractedBill = {
  clinicName: string
  clinicAddress: string
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
  insuranceCompany: InsuranceCompany
  policyNumber: string
  ownerName?: string
  ownerAddress?: string
  ownerPhone?: string
  filingDeadlineDays?: number
  filing_deadline_days?: number
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
  dateOfService: string
  diagnosis: string
  pets: ExtractedPetGroup[]
  invoiceNumber?: string
}


