import { useRef, useState, useEffect } from 'react'
import SignatureCanvas from 'react-signature-canvas'
import { supabase } from '../lib/supabase'

interface SignatureCaptureProps {
  userId: string
  initialSignature?: string | null
  onSave?: (signatureData: string) => void
}

export function SignatureCapture({ userId, initialSignature, onSave }: SignatureCaptureProps) {
  const signatureRef = useRef<SignatureCanvas>(null)
  const [savedSignature, setSavedSignature] = useState<string | null>(initialSignature || null)
  const [isSaving, setIsSaving] = useState(false)
  const [saveMessage, setSaveMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null)
  const [hasDrawn, setHasDrawn] = useState(false)

  useEffect(() => {
    if (initialSignature) {
      setSavedSignature(initialSignature)
    }
  }, [initialSignature])

  const handleClear = () => {
    signatureRef.current?.clear()
    setHasDrawn(false)
    setSaveMessage(null)
  }

  const handleSave = async () => {
    if (!signatureRef.current || signatureRef.current.isEmpty()) {
      setSaveMessage({ type: 'error', text: 'Please draw your signature first' })
      return
    }

    setIsSaving(true)
    setSaveMessage(null)

    try {
      // Get signature as base64 data URL
      const signatureData = signatureRef.current.toDataURL('image/png')

      // Save to database
      const { error } = await supabase
        .from('profiles')
        .update({ signature: signatureData })
        .eq('id', userId)

      if (error) throw error

      setSavedSignature(signatureData)
      setSaveMessage({ type: 'success', text: 'Signature saved successfully!' })

      // Call optional callback
      if (onSave) {
        onSave(signatureData)
      }

      // Clear success message after 3 seconds
      setTimeout(() => setSaveMessage(null), 3000)

    } catch (error) {
      console.error('Error saving signature:', error)
      setSaveMessage({ type: 'error', text: 'Failed to save signature. Please try again.' })
    } finally {
      setIsSaving(false)
    }
  }

  const handleEdit = () => {
    setSavedSignature(null)
    setHasDrawn(false)
    setTimeout(() => {
      signatureRef.current?.clear()
    }, 0)
  }

  const handleBeginDrawing = () => {
    setHasDrawn(true)
    setSaveMessage(null)
  }

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-6">
      <div className="mb-4">
        <h3 className="text-lg font-semibold text-gray-900">Your Signature</h3>
        <p className="text-sm text-gray-600 mt-1">
          This will be used on your insurance claim forms
        </p>
      </div>

      {savedSignature ? (
        // Show saved signature
        <div className="space-y-4">
          <div className="border-2 border-green-200 rounded-lg p-4 bg-green-50">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-green-800">Signature Saved</span>
              <button
                onClick={handleEdit}
                className="text-sm text-blue-600 hover:text-blue-700 font-medium"
              >
                Edit
              </button>
            </div>
            <div className="bg-white rounded border border-green-300 p-4">
              <img
                src={savedSignature}
                alt="Your signature"
                className="max-w-full h-auto"
                style={{ maxHeight: '120px' }}
              />
            </div>
          </div>
        </div>
      ) : (
        // Show signature canvas
        <div className="space-y-4">
          <div className="border-2 border-gray-300 rounded-lg bg-gray-50 relative">
            {!hasDrawn && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <span className="text-gray-400 text-sm italic">Sign here with your mouse or finger</span>
              </div>
            )}
            <SignatureCanvas
              ref={signatureRef}
              canvasProps={{
                className: 'signature-canvas w-full rounded-lg cursor-crosshair',
                style: { height: '150px', touchAction: 'none' }
              }}
              backgroundColor="rgb(249, 250, 251)"
              penColor="rgb(0, 0, 0)"
              onBegin={handleBeginDrawing}
            />
          </div>

          <div className="flex gap-3">
            <button
              onClick={handleClear}
              disabled={!hasDrawn || isSaving}
              className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Clear
            </button>
            <button
              onClick={handleSave}
              disabled={!hasDrawn || isSaving}
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
            >
              {isSaving ? 'Saving...' : 'Save Signature'}
            </button>
          </div>

          {saveMessage && (
            <div
              className={`p-3 rounded-lg text-sm ${
                saveMessage.type === 'success'
                  ? 'bg-green-50 text-green-800 border border-green-200'
                  : 'bg-red-50 text-red-800 border border-red-200'
              }`}
            >
              {saveMessage.text}
            </div>
          )}
        </div>
      )}

      <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
        <p className="text-xs text-blue-800">
          <strong>Note:</strong> Your signature will be included on all insurance claim submissions. Make sure it matches the signature on file with your insurance company.
        </p>
      </div>
    </div>
  )
}
