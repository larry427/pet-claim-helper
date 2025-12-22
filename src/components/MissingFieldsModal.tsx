import React, { useState, useRef, useEffect, useMemo } from 'react'
import SignatureCanvas from 'react-signature-canvas'

type FieldDefinition = {
  field: string
  source: string
  required: boolean
  type: 'text' | 'date' | 'phone' | 'radio' | 'signature' | 'textarea'
  prompt: string
  placeholder?: string
  description?: string  // Help text for the field
  rows?: number  // Number of rows for textarea
  aiExtract?: boolean
  suggestedValue?: string
  options?: string[]
  conditional?: {
    field: string
    value: string
    showField: FieldDefinition
  }
}

type Props = {
  open: boolean
  onClose: () => void
  insurerName: string
  petId: string
  petName?: string  // For dynamic prompt replacement like {petName}
  claimId: string
  missingFields: FieldDefinition[]
  existingData?: Record<string, any>
  suggestedValues?: Record<string, any>
  onComplete: (data: Record<string, any>) => void
}

export default function MissingFieldsModal({
  open,
  onClose,
  insurerName,
  petId,
  petName,
  claimId,
  missingFields,
  existingData = {},
  suggestedValues = {},
  onComplete
}: Props) {
  console.log('[MissingFieldsModal] Component rendered with petName:', petName)
  const [formData, setFormData] = useState<Record<string, any>>({})
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const signatureRefs = useRef<Record<string, SignatureCanvas | null>>({})

  // Initialize form data with existing and suggested values
  useEffect(() => {
    const initialData: Record<string, any> = {}
    missingFields.forEach(field => {
      if (suggestedValues[field.field]) {
        initialData[field.field] = suggestedValues[field.field]
      } else if (existingData[field.field]) {
        initialData[field.field] = existingData[field.field]
      }
    })
    setFormData(initialData)
  }, [missingFields, existingData, suggestedValues])

  const setFieldValue = (fieldName: string, value: any) => {
    console.log(`[MissingFieldsModal] setFieldValue called:`, { fieldName, value, type: typeof value })
    setFormData(prev => {
      const updated = { ...prev, [fieldName]: value }
      console.log(`[MissingFieldsModal] Updated formData:`, updated)
      return updated
    })
    setError(null)
  }

  // Check if a field should be shown based on its conditional requirement
  const shouldShowField = (field: FieldDefinition): boolean => {
    // If no conditional requirement, always show
    if (!field.conditional) return true

    // Check if the conditional parent field has the required value
    return formData[field.conditional.field] === field.conditional.value
  }

  // Memoize visible fields so they update reactively when formData changes
  const visibleFields = useMemo(() => {
    console.log('[MissingFieldsModal] Filtering fields, formData:', formData)
    return missingFields.filter(field => {
      const visible = shouldShowField(field)
      console.log(`[MissingFieldsModal] Field ${field.field}: ${visible ? 'VISIBLE' : 'HIDDEN'}`,
        field.conditional ? `(conditional: ${field.conditional.field} === "${field.conditional.value}")` : '')
      return visible
    })
  }, [missingFields, formData])

  // Replace placeholders in prompts and descriptions with actual values
  const replacePlaceholders = (text: string): string => {
    console.log('[MissingFieldsModal] replacePlaceholders called with:', text, 'petName:', petName)
    const result = text.replace(/{petName}/g, petName || 'your pet')
    console.log('[MissingFieldsModal] replacePlaceholders result:', result)
    return result
  }

  const renderField = (field: FieldDefinition) => {
    // SIGNATURE field
    if (field.type === 'signature') {
      return (
        <div key={field.field} className="mb-4">
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
            {replacePlaceholders(field.prompt)} <span className="text-red-500">*</span>
          </label>
          {field.description && (
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">
              {replacePlaceholders(field.description)}
            </p>
          )}
          <div className="border-2 border-slate-300 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-800/50 relative">
            {!formData[field.field] && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <span className="text-slate-400 dark:text-slate-500 text-sm italic">
                  Sign here with your mouse or finger
                </span>
              </div>
            )}
            <SignatureCanvas
              ref={(ref) => { signatureRefs.current[field.field] = ref }}
              canvasProps={{
                className: 'signature-canvas w-full rounded-lg cursor-crosshair',
                style: { height: '150px', touchAction: 'none' }
              }}
              backgroundColor="rgb(248, 250, 252)"
              penColor="rgb(0, 0, 0)"
              onEnd={() => {
                const canvas = signatureRefs.current[field.field]
                if (canvas && !canvas.isEmpty()) {
                  setFieldValue(field.field, canvas.toDataURL('image/png'))
                }
              }}
            />
          </div>
          {formData[field.field] && (
            <button
              type="button"
              onClick={() => {
                signatureRefs.current[field.field]?.clear()
                setFieldValue(field.field, null)
              }}
              className="mt-2 text-sm text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
            >
              Clear signature
            </button>
          )}
        </div>
      )
    }

    // TEXT field
    if (field.type === 'text') {
      return (
        <div key={field.field} className="mb-4">
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
            {replacePlaceholders(field.prompt)} <span className="text-red-500">*</span>
          </label>
          {field.description && (
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">
              {replacePlaceholders(field.description)}
            </p>
          )}
          <input
            type="text"
            placeholder={field.placeholder}
            value={formData[field.field] || ''}
            onChange={(e) => setFieldValue(field.field, e.target.value)}
            className="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
          />
          {field.aiExtract && suggestedValues[field.field] && (
            <p className="mt-1 text-xs text-blue-600 dark:text-blue-400">
              💡 Suggested from diagnosis: {suggestedValues[field.field]}
            </p>
          )}
        </div>
      )
    }

    // TEXTAREA field
    if (field.type === 'textarea') {
      return (
        <div key={field.field} className="mb-4">
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
            {replacePlaceholders(field.prompt)} <span className="text-red-500">*</span>
          </label>
          {field.description && (
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">
              {replacePlaceholders(field.description)}
            </p>
          )}
          <textarea
            rows={field.rows || 3}
            placeholder={field.placeholder}
            value={formData[field.field] || ''}
            onChange={(e) => setFieldValue(field.field, e.target.value)}
            className="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
          />
        </div>
      )
    }

    // DATE field
    if (field.type === 'date') {
      return (
        <div key={field.field} className="mb-4">
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
            {replacePlaceholders(field.prompt)} <span className="text-red-500">*</span>
          </label>
          {field.description && (
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">
              {replacePlaceholders(field.description)}
            </p>
          )}
          <input
            type="date"
            value={formData[field.field] || ''}
            onChange={(e) => setFieldValue(field.field, e.target.value)}
            className="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
          />
        </div>
      )
    }

    // PHONE field
    if (field.type === 'phone') {
      return (
        <div key={field.field} className="mb-4">
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
            {replacePlaceholders(field.prompt)} <span className="text-red-500">*</span>
          </label>
          {field.description && (
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">
              {replacePlaceholders(field.description)}
            </p>
          )}
          <input
            type="tel"
            placeholder={field.placeholder || '(555) 123-4567'}
            value={formData[field.field] || ''}
            onChange={(e) => setFieldValue(field.field, e.target.value)}
            className="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
          />
        </div>
      )
    }

    // RADIO field
    if (field.type === 'radio' && field.options) {
      return (
        <div key={field.field} className="mb-4">
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
            {replacePlaceholders(field.prompt)} <span className="text-red-500">*</span>
          </label>
          {field.description && (
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">
              {replacePlaceholders(field.description)}
            </p>
          )}
          <div className="space-y-2">
            {field.options.map(option => (
              <label key={option} className="flex items-center gap-3 p-3 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer">
                <input
                  type="radio"
                  name={field.field}
                  value={option}
                  checked={formData[field.field] === option}
                  onChange={(e) => setFieldValue(field.field, e.target.value)}
                  className="sr-only"
                />
                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${
                  formData[field.field] === option
                    ? 'bg-emerald-500 border-emerald-500'
                    : 'bg-white dark:bg-slate-900 border-gray-300 dark:border-slate-600'
                }`}>
                  {formData[field.field] === option && (
                    <div className="w-2 h-2 rounded-full bg-white" />
                  )}
                </div>
                <span className="text-sm text-slate-700 dark:text-slate-300">{option}</span>
              </label>
            ))}
          </div>
        </div>
      )
    }

    return null
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    console.log('[MissingFieldsModal] handleSubmit called')
    console.log('[MissingFieldsModal] Current formData:', formData)
    console.log('[MissingFieldsModal] Visible fields:', visibleFields.map(f => f.field))

    // Validate all required fields that are currently shown
    const validationResults: Record<string, boolean> = {}
    const allFilled = visibleFields.every(field => {
      if (!field.required) {
        validationResults[field.field] = true
        return true
      }
      const value = formData[field.field]
      const isFilled = !(!value || (typeof value === 'string' && value.trim() === ''))
      validationResults[field.field] = isFilled

      console.log(`[MissingFieldsModal] Field ${field.field}:`, {
        value,
        type: typeof value,
        isFilled,
        required: field.required
      })

      if (!isFilled) return false
      return true
    })

    console.log('[MissingFieldsModal] Validation results:', validationResults)
    console.log('[MissingFieldsModal] All filled?', allFilled)

    if (!allFilled) {
      const missingFieldNames = Object.entries(validationResults)
        .filter(([_, filled]) => !filled)
        .map(([fieldName]) => fieldName)
      console.log('[MissingFieldsModal] Missing fields:', missingFieldNames)
      setError('Please fill out all required fields')
      return
    }

    setIsSubmitting(true)
    try {
      await onComplete(formData)
    } catch (err) {
      setError('Failed to save data. Please try again.')
      setIsSubmitting(false)
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="relative mx-4 w-full max-w-lg rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-2xl max-h-[calc(100vh-80px)] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4">
          <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">
            Quick Questions for {insurerName}
          </h2>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
            ⚠️ We need a few details to submit your claim. These fields are required by {insurerName}.
          </p>
          <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">
            This is the only time we'll ask — we save everything for future claims. Your vet can help with pet details. Search "{insurerName}" in your email to find your policy number.
          </p>
        </div>

        {error && (
          <div className="mb-4 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          {visibleFields.map(field => renderField(field))}

          <div className="mt-6 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 px-4 py-3">
            <p className="text-xs text-blue-800 dark:text-blue-300">
              💾 This information will be saved for future claims
            </p>
          </div>

          <div className="mt-6 flex gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="flex-1 h-12 rounded-lg border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex-1 h-12 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-medium disabled:opacity-50"
            >
              {isSubmitting ? 'Saving...' : 'Continue to Submit'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
