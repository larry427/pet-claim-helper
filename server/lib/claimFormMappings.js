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
    // TODO: Update these with actual field names from inspectPdfFields.js
    // Placeholder mappings - replace with actual PDF field names

    policyholderName: null,  // Will be filled after inspection
    policyholderAddress: null,
    policyholderPhone: null,
    policyholderEmail: null,
    policyNumber: null,
    petName: null,
    petSpecies: null,
    petBreed: null,
    petAge: null,
    treatmentDate: null,
    veterinaryClinic: null,
    clinicAddress: null,
    clinicPhone: null,
    diagnosis: null,
    totalAmount: null,
    signatureDate: null,
  },

  trupanion: {
    // ✅ ACTUAL FIELD NAMES from 2025 form (27 fields discovered)

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
    dateOfFirstSigns: 'Date of first signs',

    // Additional Condition (2nd condition if applicable)
    additionalIllness: 'Illnessinjury 2 if applicable',
    previousClaimFiled2: 'Have you filed a claim for this condition previously_2',  // Radio group
    additionalClaimNumber: 'Claim number condition 2',
    additionalDateOfFirstSigns: 'Date of first signs 2',

    // Payment Method (Radio group)
    paymentMethod: 'Reimburse by my selected payment method',  // Radio: "I have paid my bill in full" or "I have not yet paid my bill"

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

    // MISSING FIELDS THAT DON'T EXIST IN TRUPANION FORM:
    // - No policyholder address/city/state/zip/email
    // - No total amount or itemized charges
    // - Invoice must be attached separately
  }
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
      source: 'profiles.policy_number',
      required: true,
      type: 'text',
      prompt: 'Policy number',
      placeholder: 'NW1234567'
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
    },
    // Optional fields
    {
      field: 'treatingVet',
      source: 'pets.preferred_vet_name',
      required: false,
      type: 'text',
      prompt: 'Treating veterinarian name (optional)',
      placeholder: 'Dr. Smith'
    }
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
      source: 'profiles.policy_number',
      required: false,  // "if known"
      type: 'text',
      prompt: 'Policy number (if known)',
      placeholder: 'TP1234567'
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
    }
  ],

  healthypaws: [
    // Healthy Paws generates a custom PDF, so requirements are simpler
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
      source: 'profiles.policy_number',
      required: true,
      type: 'text',
      prompt: 'Policy number',
      placeholder: 'HP1234567'
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
    // Skip if not required
    if (!fieldDef.required) continue

    // Check conditional requirements
    if (fieldDef.conditional) {
      const condField = fieldDef.conditional.field
      const condValue = fieldDef.conditional.value

      // Find the conditional field's current value
      const currentValue = getFieldValue(condField, profileData, petData, claimData)

      // Skip if condition not met
      if (currentValue !== condValue) continue
    }

    // Get the current value
    const value = getFieldValue(fieldDef.field, profileData, petData, claimData)

    // Check if missing
    if (!value || value === '' || value === null || value === undefined) {
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
    'policyNumber': profileData?.policy_number,

    // Pet fields
    'adoptionDate': petData?.adoption_date,
    'spayNeuterStatus': petData?.spay_neuter_status,
    'spayNeuterDate': petData?.spay_neuter_date,
    'treatingVet': petData?.preferred_vet_name,

    // Claim fields
    'bodyPartAffected': claimData?.body_part,
  }

  return fieldMap[fieldName]
}

export default FORM_FIELD_MAPPINGS
