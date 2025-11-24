/**
 * Field name mappings for official insurance company claim forms
 *
 * After running inspectPdfFields.js, update these mappings with the actual
 * field names from each insurance company's PDF form.
 *
 * Format:
 * {
 *   ourFieldName: 'PDFFormFieldName'
 * }
 */

const FORM_FIELD_MAPPINGS = {
  nationwide: {
    // ✅ ACTUAL FIELD NAMES from 2025 California form (25 fields discovered)

    // Policyholder & Pet Information
    policyholderName: 'Your name',
    policyNumber: 'Policy number',
    petName: 'Your pet\'s name',

    // Treatment Information
    diagnosisOther: 'Other',  // Text field for "Other" diagnosis
    bodyPartAffected: 'Body part affected',
    medicationRefill: 'Medication refill',  // Text field for medication details

    // Itemized charges (3 line items with dates and totals)
    treatmentDate1: 'Date(s) 1',
    totalAmount1: 'Total 1',
    treatmentDate2: 'Date(s) 2',
    totalAmount2: 'Total 2',
    treatmentDate3: 'Date(s) 3',
    totalAmount3: 'Total 3',

    // Signature date
    signatureDate: 'Date',

    // Checkboxes for common conditions
    checkboxSkinAllergies: 'Checkbox: Skin allergies',
    checkboxVomiting: 'Checkbox: Vomiting/upset stomach',
    checkboxDiarrhea: 'Checkbox: Diarrhea/intestinal upset',
    checkboxBladder: 'Checkbox: Bladder or urinary tract disease',
    checkboxDental: 'Checkbox: Dental disease',
    checkboxPreventive: 'Checkbox: Preventive visit',
    checkboxSkinInfection: 'Checkbox: Skin infection',
    checkboxEarInfection: 'Checkbox: Ear infection',
    checkboxArthritis: 'Checkbox: Arthritis',
    checkboxSkinMass: 'Checkbox: Non-cancerous skin mass',
    checkboxMedicationRefill: 'Checkbox: Medication refill',
    checkboxOther: 'Checkbox: Other',
  },

  healthypaws: {
    // ✅ COORDINATE-BASED MAPPING (Flat PDF - no fillable fields)
    // Healthy Paws form is 612 x 792 points. Origin (0,0) is bottom-left.
    // Use pdf-lib drawText() to overlay text at these coordinates
    // FINAL coordinates after Canva form redesign - adjusted down

    // YOUR POLICY INFORMATION SECTION
    policyNumber: { x: 175, y: 535, size: 10 },  // Policy Number
    petName: { x: 500, y: 535, size: 10 },       // Pet Name
    policyholderName: { x: 175, y: 500, size: 10 },  // Pet Parent Name
    healthyPawsPetId: { x: 500, y: 500, size: 10 },  // Pet Id
    policyholderPhone: { x: 175, y: 465, size: 10 }, // Phone Number
    policyholderEmail: { x: 500, y: 465, size: 10 }, // Email

    // YOUR CLAIM INFORMATION SECTION
    invoiceNumber: { x: 175, y: 405, size: 10 },    // Invoice Number
    treatmentDate: { x: 460, y: 400, size: 10 },    // Invoice Date (moved left and down)
    veterinaryClinic: { x: 230, y: 375, size: 10 }, // Veterinary Hospital Name
    totalAmount: { x: 500, y: 375, size: 10 },      // Invoice Total
    // dateFirstSymptoms - REMOVED - don't auto-fill this field (legal liability)
    diagnosis: { x: 85, y: 305, size: 10 },         // What was pet treated for

    // SIGNATURE SECTION
    signature: { x: 175, y: 175, width: 150, height: 40 },  // Policyholder Signature
    signatureDate: { x: 480, y: 175, size: 10 },    // Date Signed
  },

  trupanion: {
    // ✅ EXACT FIELD NAMES from Trupanion PDF inspection (27 fields discovered)
    // Updated to match actual PDF field names character-for-character

    // Core Member/Pet Information
    policyholderName: 'Policyholder name',
    policyholderPhone: 'Preferred phone',
    policyNumber: 'Your policy number if known',
    petName: 'Your pets name please complete one form per pet',
    petDateOfBirth: 'DOB',

    // Treatment Information
    diagnosis: 'Illnessinjury',
    hospitalName: 'Hospital name',
    treatingVeterinarian: 'Treating veterinarian',

    // Claim History (Radio groups)
    previousClaimFiled: 'Have you filed a claim for this condition previously',  // Radio: "If yes claim number" or "If no date of first signs"
    previousClaimNumber: 'Claim number',
    // REMOVED: dateOfFirstSigns - LEGAL LIABILITY RISK
    // Never auto-fill "date of first signs" - creates legal liability for policyholders
    // Let insurance company ask policyholder directly if they need this information

    // Additional Condition (2nd condition if applicable)
    additionalIllness: 'Illnessinjury 2 if applicable',
    previousClaimFiled2: 'Have you filed a claim for this condition previously_2',  // Radio group
    additionalClaimNumber: 'Claim number condition 2',
    additionalDateOfFirstSigns: 'Date of first signs 2',

    // Payment Method - INTENTIONALLY OMITTED
    // Trupanion form states: "Leaving this section unmarked will result in payment to you, the policyholder"
    // We do NOT fill this field - leaving it blank is the correct behavior
    // paymentMethod: 'Reimburse by my selected payment method',  // COMMENTED OUT - DO NOT USE

    // Other Insurance Provider (Radio group)
    hasOtherProvider: 'Iswas your pet insured under any other insurance provider',  // Radio: "Yes" or "No_2"
    policyStillActive: 'Policy still active',  // Checkbox
    otherProviderName: 'If yes provider name',
    cancelDate: 'Cancel date',

    // Generic Name/City fields (veterinary clinic details)
    vetName1: 'Name',
    vetCity1: 'City',
    vetName2: 'Name_2',
    vetCity2: 'City_2',

    // Additional pet dates
    dateOfAdoption: 'Date of adoption',
    spayNeuterDate: 'Spay/Neuter Date',
    spayNeuter: 'Spay Neuter',  // Radio: "No" or "Yes Date"

    // NOTES:
    // - No signature field exists (signature must be drawn directly on page)
    // - No policyholder address/city/state/zip/email fields
    // - No total amount or itemized charges fields
    // - Invoice must be attached separately
  }
}

/**
 * EXACT Radio Option Values from PDF Forms
 * These MUST match the exact strings in the PDF radio groups
 */
export const TRUPANION_RADIO_OPTIONS = {
  // Spay/Neuter Status Radio
  spayNeuter: {
    yes: 'Yes Date',       // Use when spay/neuter date exists
    yesNoDate: 'Yes no date',  // Use when status is Yes but no date provided
    no: 'No'               // Use when not spayed/neutered
  },

  // Payment Method - INTENTIONALLY OMITTED
  // Trupanion form states: "Leaving this section unmarked will result in payment to you, the policyholder"
  // We do NOT select any payment option - leaving it blank is correct
  // paymentMethod: { ... }  // REMOVED - DO NOT USE

  // Previous Insurance Provider Radio
  hasOtherProvider: {
    yes: 'Yes',
    no: 'No_2'  // NOTE: Trupanion uses "No_2" not "No"
  },

  // Previous Claim Filed Radio
  previousClaim: {
    yesHasClaimNumber: 'If yes claim number',
    noHasDateOfFirstSigns: 'If no date of first signs'
  }
}

export const NATIONWIDE_RADIO_OPTIONS = {
  // Add Nationwide radio options here if needed
}

/**
 * Date Formatting Helper for PDF Forms
 * Converts ISO date string to MM/DD/YYYY format
 */
export function formatDateForPDF(dateString) {
  if (!dateString) return null

  const date = new Date(dateString)
  if (isNaN(date.getTime())) return null

  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const year = date.getFullYear()

  return `${month}/${day}/${year}`
}

/**
 * Currency Formatting Helper for PDF Forms
 * Converts number to currency string (e.g., "123.45" or "$123.45")
 */
export function formatCurrencyForPDF(amount) {
  if (amount === null || amount === undefined) return null

  const numAmount = typeof amount === 'string' ? parseFloat(amount) : amount
  if (isNaN(numAmount)) return null

  return numAmount.toFixed(2)
}

/**
 * Phone Formatting Helper for PDF Forms
 * Converts phone to (XXX) XXX-XXXX format
 */
export function formatPhoneForPDF(phone) {
  if (!phone) return null

  // Remove all non-digit characters
  const digits = phone.replace(/\D/g, '')

  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`
  }

  return phone // Return as-is if not 10 digits
}

/**
 * Helper function to get the mapping for a specific insurer
 */
export function getMappingForInsurer(insurerName) {
  const normalized = insurerName.toLowerCase()

  if (normalized.includes('nationwide')) {
    return FORM_FIELD_MAPPINGS.nationwide
  } else if (normalized.includes('healthy') || normalized.includes('paws')) {
    return FORM_FIELD_MAPPINGS.healthypaws
  } else if (normalized.includes('trupanion')) {
    return FORM_FIELD_MAPPINGS.trupanion
  }

  return null
}

/**
 * Helper to validate that all required fields are mapped
 */
export function validateMapping(insurerName) {
  const mapping = getMappingForInsurer(insurerName)
  const normalized = insurerName.toLowerCase()

  if (!mapping) {
    return { valid: false, error: `No mapping found for insurer: ${insurerName}` }
  }

  // Define required fields per insurer (different forms have different field names)
  let requiredFields = []

  if (normalized.includes('nationwide')) {
    requiredFields = [
      'policyholderName',
      'policyNumber',
      'petName',
      'treatmentDateFrom',  // Nationwide uses date range
      'hospitalClinic',     // Nationwide uses "hospitalClinic" not "veterinaryClinic"
      'diagnosis',
      'totalAmount'
    ]
  } else if (normalized.includes('trupanion')) {
    // Trupanion form is very minimal - only has these core fields
    requiredFields = [
      'policyholderName',
      'policyholderPhone',
      'petName',
      'hospitalName',
      'diagnosis'
      // Note: policyNumber, petDateOfBirth are optional ("if known")
      // No treatment date, total amount, or address fields exist in Trupanion form
    ]
  } else if (normalized.includes('healthy') || normalized.includes('paws')) {
    // Healthy Paws has no fillable fields (flattened PDF)
    // Will use generated PDF instead
    return {
      valid: false,
      error: 'Healthy Paws form has no fillable fields. Using generated PDF instead.'
    }
  }

  const missing = requiredFields.filter(field => !mapping[field] || mapping[field] === null)

  if (missing.length > 0) {
    return {
      valid: false,
      error: `Missing mappings for ${insurerName}: ${missing.join(', ')}`
    }
  }

  return { valid: true }
}

/**
 * Required fields for each insurer's claim form
 * Used for just-in-time data collection - only ask for missing fields when submitting
 *
 * Field sources:
 * - profiles.* = User profile data (signature, address, etc.)
 * - pets.* = Pet data (adoption date, spay/neuter, etc.)
 * - claim.* = Claim data (diagnosis, treatment date, etc.)
 *
 * Each field can be:
 * - required: true/false (will block submission if missing)
 * - aiExtract: true/false (attempt to extract from existing data using AI)
 * - conditional: object with field/value that determines if this field is required
 */
export const INSURER_REQUIRED_FIELDS = {
  nationwide: [
    // Always required fields
    {
      field: 'signature',
      source: 'profiles.signature',
      required: true,
      type: 'signature',
      prompt: 'Your signature',
      description: 'Required to authorize the claim'
    },
    {
      field: 'policyholderName',
      source: 'profiles.full_name',
      required: true,
      type: 'text',
      prompt: 'Your full name',
      placeholder: 'John Smith'
    },
    {
      field: 'policyNumber',
      source: 'pets.policy_number',
      required: true,
      type: 'text',
      prompt: 'What is your pet insurance policy number?',
      placeholder: 'e.g., NW12345 or C-234567'
    },
    {
      field: 'bodyPartAffected',
      source: 'claim.body_part',
      required: true,
      type: 'text',
      prompt: 'What part of your pet\'s body was affected?',
      placeholder: 'e.g., Ear, Eye, Leg, Stomach',
      aiExtract: true,  // Try to extract from diagnosis
      aiPrompt: 'Extract the affected body part from this diagnosis'
    }
    // NOTE: Nationwide form has NO phone number field - do not require it
  ],

  trupanion: [
    // Always required fields
    {
      field: 'signature',
      source: 'profiles.signature',
      required: true,
      type: 'signature',
      prompt: 'Your signature',
      description: 'Required to authorize medical records release'
    },
    {
      field: 'policyholderName',
      source: 'profiles.full_name',
      required: true,
      type: 'text',
      prompt: 'Your full name',
      placeholder: 'John Smith'
    },
    {
      field: 'policyholderPhone',
      source: 'profiles.phone',
      required: true,
      type: 'phone',
      prompt: 'Your phone number',
      placeholder: '(555) 123-4567'
    },
    {
      field: 'policyNumber',
      source: 'pets.policy_number',
      required: true,
      type: 'text',
      prompt: 'What is your pet insurance policy number?',
      placeholder: 'e.g., TP12345 or TR67890'
    },
    {
      field: 'dateOfBirth',
      source: 'pets.date_of_birth',
      required: true,
      type: 'date',
      prompt: 'What is {petName}\'s date of birth?',
      placeholder: 'MM/DD/YYYY',
      description: 'Required by Trupanion to verify pet age and coverage'
    },
    {
      field: 'treatingVet',
      source: 'pets.preferred_vet_name',
      required: true,
      type: 'text',
      prompt: 'Treating veterinarian name',
      placeholder: 'Dr. Smith'
    },
    {
      field: 'adoptionDate',
      source: 'pets.adoption_date',
      required: true,
      type: 'date',
      prompt: 'When did you adopt {petName}?',
      description: 'Required by Trupanion for policy verification'
    },
    {
      field: 'spayNeuterStatus',
      source: 'pets.spay_neuter_status',
      required: true,
      type: 'radio',
      prompt: 'Is {petName} spayed/neutered?',
      options: ['Yes', 'No', 'Unknown']
    },
    // Conditional field - only required if spayNeuterStatus = 'Yes'
    {
      field: 'spayNeuterDate',
      source: 'pets.spay_neuter_date',
      required: false,
      type: 'date',
      prompt: 'Spay/neuter date (if known)',
      conditional: { field: 'spayNeuterStatus', value: 'Yes' }
    },

    // ========== OTHER INSURANCE HISTORY ==========
    {
      field: 'hadOtherInsurance',
      source: 'pets.had_other_insurance',
      required: true,
      type: 'radio',
      prompt: 'Has {petName} been insured by another provider?',
      description: 'Required by Trupanion for underwriting purposes',
      options: ['Yes', 'No']
    },
    // Conditional field - only required if hadOtherInsurance = 'Yes'
    {
      field: 'otherInsuranceProvider',
      source: 'pets.other_insurance_provider',
      required: false,
      type: 'text',
      prompt: 'Previous insurance provider name',
      placeholder: 'e.g., Nationwide, Healthy Paws',
      conditional: { field: 'hadOtherInsurance', value: 'Yes' }
    },
    // Conditional field - only required if hadOtherInsurance = 'Yes'
    {
      field: 'otherInsuranceCancelDate',
      source: 'pets.other_insurance_cancel_date',
      required: false,
      type: 'date',
      prompt: 'When was the previous policy cancelled?',
      description: 'If still active, leave blank',
      conditional: { field: 'hadOtherInsurance', value: 'Yes' }
    },

    // ========== HOSPITAL HISTORY ==========
    {
      field: 'otherHospitalsVisited',
      source: 'pets.other_hospitals_visited',
      required: true,
      type: 'textarea',
      rows: 3,
      prompt: 'List all other hospitals/clinics where {petName} has been treated',
      description: 'Include hospital names and cities. Trupanion may request records from these locations.',
      placeholder: 'e.g., Paws & Whiskers Vet (San Francisco), Animal Care Center (Oakland)'
    },

    // ========== CLAIM-SPECIFIC FIELDS ==========
    {
      field: 'previousClaimSameCondition',
      source: 'claim.previous_claim_same_condition',
      required: true,
      type: 'radio',
      prompt: 'Have you filed a claim for this same condition before?',
      options: ['Yes', 'No']
    },
    // Conditional field - only required if previousClaimSameCondition = 'Yes'
    {
      field: 'previousClaimNumber',
      source: 'claim.previous_claim_number',
      required: false,
      type: 'text',
      prompt: 'Previous claim number',
      placeholder: 'e.g., TP-123456',
      conditional: { field: 'previousClaimSameCondition', value: 'Yes' }
    },
    {
      field: 'paymentMethod',
      source: 'claim.payment_method',
      required: true,
      type: 'radio',
      prompt: 'Payment status',
      description: 'Trupanion can reimburse you directly OR pay the clinic directly if you haven\'t paid yet',
      options: ['I have paid in full', 'I have not yet paid']
    }
  ],

  healthypaws: [
    // Healthy Paws uses coordinate-based text overlay on official form
    {
      field: 'signature',
      source: 'profiles.signature',
      required: true,
      type: 'signature',
      prompt: 'Your signature',
      description: 'Required to authorize the claim'
    },
    {
      field: 'policyholderName',
      source: 'profiles.full_name',
      required: true,
      type: 'text',
      prompt: 'Your full name',
      placeholder: 'John Smith'
    },
    {
      field: 'policyholderPhone',
      source: 'profiles.phone',
      required: true,
      type: 'phone',
      prompt: 'Your phone number',
      placeholder: '(555) 123-4567'
    },
    {
      field: 'policyholderEmail',
      source: 'profiles.email',
      required: true,
      type: 'email',
      prompt: 'Your email address',
      placeholder: 'john@example.com'
    },
    {
      field: 'policyNumber',
      source: 'pets.policy_number',
      required: true,
      type: 'text',
      prompt: 'Policy number',
      placeholder: 'HP1234567'
    },
    {
      field: 'healthyPawsPetId',
      source: 'pets.healthy_paws_pet_id',
      required: true,
      type: 'text',
      prompt: 'Healthy Paws Pet ID',
      placeholder: 'e.g., 1400806-1',
      description: 'Found on your Healthy Paws insurance card or policy documents'
    }
  ]
}

/**
 * Get required fields for a specific insurer
 */
export function getRequiredFieldsForInsurer(insurerName) {
  const normalized = insurerName.toLowerCase()

  if (normalized.includes('nationwide')) {
    return INSURER_REQUIRED_FIELDS.nationwide
  } else if (normalized.includes('healthy') || normalized.includes('paws')) {
    return INSURER_REQUIRED_FIELDS.healthypaws
  } else if (normalized.includes('trupanion')) {
    return INSURER_REQUIRED_FIELDS.trupanion
  }

  return []
}

/**
 * Check which required fields are missing for this claim/insurer
 * Returns array of missing field definitions
 */
export function getMissingRequiredFields(insurerName, profileData, petData, claimData) {
  const requiredFields = getRequiredFieldsForInsurer(insurerName)
  const missing = []

  for (const fieldDef of requiredFields) {
    // Get the current value
    const value = getFieldValue(fieldDef.field, profileData, petData, claimData)

    // Check if missing
    if (!value || value === '' || value === null || value === undefined) {
      // Include ALL missing fields (including conditional ones)
      // The React component will handle showing/hiding conditional fields
      // based on user input in the form
      missing.push(fieldDef)
    }
  }

  return missing
}

/**
 * Helper to get field value from the appropriate source
 */
function getFieldValue(fieldName, profileData, petData, claimData) {
  // Map field names to data sources
  const fieldMap = {
    // Profile fields
    'signature': profileData?.signature,
    'policyholderName': profileData?.full_name,
    'policyholderPhone': profileData?.phone,
    'policyholderAddress': profileData?.address,
    'policyholderEmail': profileData?.email,

    // Pet fields (policy_number is stored in pets table, not profiles!)
    'policyNumber': petData?.policy_number,
    'healthyPawsPetId': petData?.healthy_paws_pet_id,
    'adoptionDate': petData?.adoption_date,
    'spayNeuterStatus': petData?.spay_neuter_status,
    'spayNeuterDate': petData?.spay_neuter_date,
    'treatingVet': petData?.preferred_vet_name,
    'hadOtherInsurance': petData?.had_other_insurance,
    'otherInsuranceProvider': petData?.other_insurance_provider,
    'otherInsuranceCancelDate': petData?.other_insurance_cancel_date,
    'otherHospitalsVisited': petData?.other_hospitals_visited,

    // Claim fields
    'bodyPartAffected': claimData?.body_part,
    'previousClaimSameCondition': claimData?.previous_claim_same_condition,
    'previousClaimNumber': claimData?.previous_claim_number,
    'paymentMethod': claimData?.payment_method,
  }

  const value = fieldMap[fieldName]
  console.log(`[getFieldValue] ${fieldName} = ${value} (from ${
    fieldName === 'signature' || fieldName === 'policyholderName' || fieldName === 'policyholderPhone' || fieldName === 'policyholderAddress' ? 'profile' :
    fieldName === 'bodyPartAffected' || fieldName === 'previousClaimSameCondition' || fieldName === 'previousClaimNumber' || fieldName === 'paymentMethod' ? 'claim' : 'pet'
  })`)
  return value
}

export default FORM_FIELD_MAPPINGS
