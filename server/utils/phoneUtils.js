/**
 * Server-side phone number formatting utilities for E.164 format
 * Matches client-side utils/phoneUtils.ts to ensure consistency
 */

/**
 * Format phone number to E.164 format for storage and Twilio
 * Handles various US phone formats and ensures proper +1 country code
 *
 * @param {string} input - Raw phone number (any format)
 * @returns {string} E.164 formatted phone (+13123050403) or empty string if invalid
 *
 * @example
 * formatPhoneToE164('3123050403') // => '+13123050403'
 * formatPhoneToE164('(312) 305-0403') // => '+13123050403'
 * formatPhoneToE164('312 305 0403') // => '+13123050403'
 * formatPhoneToE164('13123050403') // => '+13123050403'
 * formatPhoneToE164('+13123050403') // => '+13123050403'
 */
export function formatPhoneToE164(input) {
  if (!input) return ''

  // Strip all non-digits (remove spaces, dashes, parentheses, +)
  const digits = String(input).replace(/\D/g, '')

  // Handle 10-digit US number: add +1 prefix
  if (digits.length === 10) {
    return `+1${digits}`
  }

  // Handle 11-digit number starting with 1: add + prefix
  if (digits.length === 11 && digits.startsWith('1')) {
    return `+${digits}`
  }

  // Already in E.164 format with + prefix
  if (input.startsWith('+') && digits.length === 11 && digits.startsWith('1')) {
    return `+${digits}`
  }

  // Invalid format - return empty string to avoid saving bad data
  console.warn('[Phone Utils] Invalid phone number format:', input, '- extracted digits:', digits)
  return ''
}

/**
 * Validate if phone number has exactly 10 or 11 digits for US numbers
 * @param {string} phone - Raw phone input
 * @returns {boolean} true if valid US number
 */
export function isValidUSPhone(phone) {
  const digits = String(phone).replace(/\D/g, '')
  return digits.length === 10 || (digits.length === 11 && digits.startsWith('1'))
}
