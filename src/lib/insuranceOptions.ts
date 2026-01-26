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
  { display: 'Spot (270 days)', value: 'Spot', deadlineDays: 270 },
  { display: 'Figo (180 days)', value: 'Figo', deadlineDays: 180 },
  { display: 'Pets Best (90 days)', value: 'Pets Best', deadlineDays: 90 },
  { display: 'ASPCA (90 days)', value: 'ASPCA', deadlineDays: 90 },
  { display: 'Other - Insurance not listed (90 days)', value: 'Other', deadlineDays: 90 }
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
 * getInsuranceDisplay('Other') // => 'Other - Insurance not listed (90 days)'
 * getInsuranceDisplay('Fetch') // => 'Fetch' (unsupported, shows as-is)
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
 * Handles both database values and display values
 *
 * @example
 * getDeadlineDays('Trupanion') // => 90
 * getDeadlineDays('Trupanion (90 days)') // => 90
 * getDeadlineDays('Nationwide') // => 365
 * getDeadlineDays('Other') // => undefined
 */
export function getDeadlineDays(value: string): number | undefined {
  if (!value) return undefined

  // Try by database value first
  let option = INSURANCE_OPTIONS.find(opt => opt.value === value)
  if (option?.deadlineDays) return option.deadlineDays

  // Try by display value
  option = INSURANCE_OPTIONS.find(opt => opt.display === value)
  if (option?.deadlineDays) return option.deadlineDays

  // Try stripping deadline label and matching again
  const stripped = value.replace(/\s*\(\d+\s*days?\).*$/i, '').trim()
  if (stripped && stripped !== value) {
    option = INSURANCE_OPTIONS.find(opt => opt.value === stripped)
    if (option?.deadlineDays) return option.deadlineDays
  }

  return undefined
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
    normalized.includes('pumpkin') ||
    normalized.includes('spot') ||
    normalized.includes('figo') ||
    normalized.includes('pets best') ||
    normalized.includes('aspca')
  )
}
