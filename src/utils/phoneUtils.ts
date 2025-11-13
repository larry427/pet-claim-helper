/**
 * Phone number formatting utilities for E.164 format required by Twilio
 */

/**
 * Format phone number for display as (XXX) XXX-XXXX
 * @param phone - Raw phone input (can be any format)
 * @returns Formatted phone for display, or empty string if invalid
 */
export function formatPhoneForDisplay(phone: string): string {
  // Strip all non-digits
  const digits = phone.replace(/\D/g, '')

  // Must be exactly 10 digits for US numbers
  if (digits.length !== 10) {
    return phone // Return as-is if not 10 digits
  }

  // Format as (XXX) XXX-XXXX
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`
}

/**
 * Format phone number for storage in E.164 format (+1XXXXXXXXXX)
 * @param phone - Raw phone input (can be any format)
 * @returns E.164 formatted phone (+13123050403) or empty string if invalid
 */
export function formatPhoneForStorage(phone: string): string {
  // Strip all non-digits
  const digits = phone.replace(/\D/g, '')

  // Must be exactly 10 digits for US numbers
  if (digits.length !== 10) {
    return '' // Return empty if invalid
  }

  // Add +1 prefix for US E.164 format
  return `+1${digits}`
}

/**
 * Validate if phone number has exactly 10 digits
 * @param phone - Raw phone input
 * @returns true if valid 10-digit US number
 */
export function isValidUSPhone(phone: string): boolean {
  const digits = phone.replace(/\D/g, '')
  return digits.length === 10
}

/**
 * Format phone number as user types for better UX
 * Automatically formats as (XXX) XXX-XXXX while typing
 * @param value - Current input value
 * @param previousValue - Previous input value (to handle backspace)
 * @returns Formatted value for input field
 */
export function formatPhoneOnChange(value: string, previousValue: string = ''): string {
  // Strip all non-digits
  const digits = value.replace(/\D/g, '')

  // Limit to 10 digits
  const truncated = digits.slice(0, 10)

  // Don't format if empty
  if (truncated.length === 0) return ''

  // Format progressively as user types
  if (truncated.length <= 3) {
    return `(${truncated}`
  } else if (truncated.length <= 6) {
    return `(${truncated.slice(0, 3)}) ${truncated.slice(3)}`
  } else {
    return `(${truncated.slice(0, 3)}) ${truncated.slice(3, 6)}-${truncated.slice(6)}`
  }
}
