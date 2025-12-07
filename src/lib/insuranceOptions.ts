/**
 * Unified insurance company options and value mapping
 *
 * This ensures consistency between:
 * - Edit Pet modal (App.tsx)
 * - Onboarding modal (OnboardingModal.tsx)
 * - Auto-Submit matching (server/lib/claimFormMappings.js)
 */

export interface InsuranceOption {
  display: string  // What user sees in dropdown
  value: string    // What gets saved to database
  deadlineDays?: number  // Filing deadline in days
}

/**
 * Standard insurance options shown in all dropdowns
 * Order matters for UX
 */
export const INSURANCE_OPTIONS: InsuranceOption[] = [
  { display: '— Select —', value: '' },
  { display: 'Not Insured', value: '' },
  { display: 'Trupanion (90 days)', value: 'Trupanion', deadlineDays: 90 },
  { display: 'Nationwide (365 days)', value: 'Nationwide', deadlineDays: 365 },
  { display: 'Healthy Paws (90 days)', value: 'Healthy Paws', deadlineDays: 90 },
  { display: 'Pumpkin (270 days)', value: 'Pumpkin', deadlineDays: 270 },
  { display: 'Spot (270 days)', value: 'Spot', deadlineDays: 270 }
]

/**
 * Get database value from display value
 * Strips deadline labels before saving
 *
 * @example
 * getInsuranceValue('Trupanion (90 days)') // => 'Trupanion'
 * getInsuranceValue('Not Insured') // => ''
 * getInsuranceValue('Custom Insurance') // => 'Other'
 */
export function getInsuranceValue(displayValue: string): string {
  const option = INSURANCE_OPTIONS.find(opt => opt.display === displayValue)
  if (option) {
    return option.value
  }

  // Fallback: strip deadline labels manually
  if (displayValue === '— Select —') return ''
  if (displayValue === 'Not Insured') return ''

  // Remove deadline labels: "Trupanion (90 days)" → "Trupanion"
  return displayValue.replace(/\s*\(\d+\s*days?\).*$/i, '').trim()
}

/**
 * Get display value from database value
 * Adds deadline labels for known insurers
 *
 * @example
 * getInsuranceDisplay('Trupanion') // => 'Trupanion (90 days)'
 * getInsuranceDisplay('') // => 'Not Insured'
 * getInsuranceDisplay('Other') // => 'Other' (legacy value, needs fixing)
 * getInsuranceDisplay('Fetch') // => 'Fetch' (legacy value, needs fixing)
 */
export function getInsuranceDisplay(dbValue: string | null | undefined): string {
  if (!dbValue || dbValue === '') return 'Not Insured'

  const option = INSURANCE_OPTIONS.find(opt => opt.value === dbValue)
  if (option) {
    return option.display
  }

  // Legacy values that aren't in the dropdown - show them as-is
  // NOTE: "Other" and custom insurance values should be manually fixed
  return dbValue
}

/**
 * Get filing deadline days for an insurance company
 *
 * @example
 * getDeadlineDays('Trupanion') // => 90
 * getDeadlineDays('Nationwide') // => 365
 * getDeadlineDays('Other') // => undefined
 */
export function getDeadlineDays(value: string): number | undefined {
  const option = INSURANCE_OPTIONS.find(opt => opt.value === value)
  return option?.deadlineDays
}

/**
 * Check if insurance company is supported for Auto-Submit
 * Matches the logic in server/lib/claimFormMappings.js
 */
export function isAutoSubmitSupported(insuranceCompany: string): boolean {
  if (!insuranceCompany) return false

  const normalized = insuranceCompany.toLowerCase()
  return (
    normalized.includes('nationwide') ||
    normalized.includes('trupanion') ||
    normalized.includes('healthy') ||
    normalized.includes('paws') ||
    normalized.includes('pumpkin')
  )
}
