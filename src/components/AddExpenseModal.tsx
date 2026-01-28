import React, { useState, useEffect, useRef } from 'react'
import ManualExpenseForm from './ManualExpenseForm'
import { NewExpense, ExpenseCategory } from '../lib/useExpenses'
import { supabase } from '../lib/supabase'
import { scanDocument, isImageFile } from '../lib/documentScanner'

type Props = {
  onClose: () => void
  onSubmit: (expense: NewExpense) => Promise<{ success: boolean; error?: string }>
}

type ModalView = 'choose' | 'manual' | 'scan'

type ExtractedReceipt = {
  vendor: string | null
  total_amount: number | null
  date: string | null
  category_hint: ExpenseCategory | null
  description: string | null
}

export default function AddExpenseModal({ onClose, onSubmit }: Props) {
  const [view, setView] = useState<ModalView>('choose')
  const [isClosing, setIsClosing] = useState(false)
  const [isVisible, setIsVisible] = useState(false)

  // Scan state
  const [selectedFile, setSelectedFile] = useState<{ file: File; objectUrl: string } | null>(null)
  const [isScanning, setIsScanning] = useState(false) // Document edge detection
  const [isProcessing, setIsProcessing] = useState(false)
  const [scanError, setScanError] = useState<string | null>(null)
  const [extractedData, setExtractedData] = useState<ExtractedReceipt | null>(null)

  // File input refs
  const cameraInputRef = useRef<HTMLInputElement>(null)
  const galleryInputRef = useRef<HTMLInputElement>(null)

  // Animate in on mount
  useEffect(() => {
    requestAnimationFrame(() => {
      setIsVisible(true)
    })
  }, [])

  // Cleanup object URL on unmount
  useEffect(() => {
    return () => {
      if (selectedFile?.objectUrl) {
        URL.revokeObjectURL(selectedFile.objectUrl)
      }
    }
  }, [selectedFile])

  // Animate out before closing
  const handleClose = () => {
    setIsClosing(true)
    setTimeout(() => {
      onClose()
    }, 200)
  }

  const handleSuccess = () => {
    // Brief delay to show success state, then close
    setTimeout(() => {
      handleClose()
    }, 300)
  }

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      handleClose()
    }
  }

  const handleFileSelect = async (file: File | null) => {
    if (!file) return

    // Validate file type
    if (!file.type.startsWith('image/')) {
      setScanError('Please select an image file')
      return
    }

    // Cleanup previous object URL
    if (selectedFile?.objectUrl) {
      URL.revokeObjectURL(selectedFile.objectUrl)
    }

    setScanError(null)

    // Run document edge detection for images
    if (isImageFile(file)) {
      setIsScanning(true)
      try {
        const scanResult = await scanDocument(file)
        if (scanResult.success) {
          // Use the processed (cropped/straightened) image
          const processedFile = new File([scanResult.blob], file.name, { type: 'image/jpeg' })
          const objectUrl = URL.createObjectURL(scanResult.blob)
          setSelectedFile({ file: processedFile, objectUrl })
          if (scanResult.processed) {
            console.log('[AddExpenseModal] Receipt auto-cropped')
          }
        } else {
          // Fallback to original image
          const objectUrl = URL.createObjectURL(file)
          setSelectedFile({ file, objectUrl })
        }
      } catch (err) {
        console.error('[AddExpenseModal] Document scan error:', err)
        // Fallback to original image
        const objectUrl = URL.createObjectURL(file)
        setSelectedFile({ file, objectUrl })
      } finally {
        setIsScanning(false)
      }
    } else {
      // Non-image file (shouldn't happen given validation above)
      const objectUrl = URL.createObjectURL(file)
      setSelectedFile({ file, objectUrl })
    }
  }

  const handleProcessReceipt = async () => {
    if (!selectedFile) return

    setIsProcessing(true)
    setScanError(null)

    try {
      const apiBase = import.meta.env.DEV ? 'http://localhost:8787' : 'https://pet-claim-helper.onrender.com'
      const formData = new FormData()
      formData.append('file', selectedFile.file)

      // Get auth token for API request
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) {
        throw new Error('Not authenticated. Please log in and try again.')
      }

      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 60000) // 60s timeout

      const response = await fetch(`${apiBase}/api/extract-receipt`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`
        },
        body: formData,
        signal: controller.signal,
      })

      clearTimeout(timeoutId)

      if (!response.ok) {
        const text = await response.text().catch(() => '')
        throw new Error(text || `Server error (${response.status})`)
      }

      const json = await response.json()

      if (!json.ok || !json.data) {
        throw new Error(json.error || 'Failed to extract receipt data')
      }

      setExtractedData(json.data)

      // Switch to manual form with pre-filled data
      setView('manual')
    } catch (err: any) {
      console.error('[extract-receipt] Error:', err)
      const message = err?.name === 'AbortError'
        ? 'Request timed out. Please try again.'
        : err?.message || 'Failed to process receipt'
      setScanError(message)
    } finally {
      setIsProcessing(false)
    }
  }

  const resetScanState = () => {
    if (selectedFile?.objectUrl) {
      URL.revokeObjectURL(selectedFile.objectUrl)
    }
    setSelectedFile(null)
    setScanError(null)
    setExtractedData(null)
  }

  const handleBack = () => {
    if (view === 'scan') {
      resetScanState()
    }
    if (view === 'manual') {
      setExtractedData(null)
    }
    setView('choose')
  }

  // Convert extracted data to initialData format for ManualExpenseForm
  const getInitialData = () => {
    if (!extractedData) return undefined
    return {
      amount: extractedData.total_amount ?? undefined,
      vendor: extractedData.vendor ?? undefined,
      category: extractedData.category_hint ?? undefined,
      expenseDate: extractedData.date ?? undefined,
      description: extractedData.description ?? undefined,
    }
  }

  return (
    <div
      className={`fixed inset-0 z-[60] flex items-end sm:items-center justify-center transition-all duration-200 ${
        isVisible && !isClosing ? 'bg-black/50' : 'bg-black/0'
      }`}
      onClick={handleBackdropClick}
    >
      <div
        className={`relative w-full sm:max-w-lg rounded-t-3xl sm:rounded-2xl bg-white dark:bg-slate-900 shadow-2xl border border-slate-200 dark:border-slate-800 max-h-[95vh] overflow-hidden transition-all duration-200 ${
          isVisible && !isClosing
            ? 'translate-y-0 opacity-100'
            : 'translate-y-8 opacity-0'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drag handle for mobile */}
        <div className="sm:hidden flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-slate-300 dark:bg-slate-700" />
        </div>

        {/* Header */}
        <div className="sticky top-0 bg-white dark:bg-slate-900 px-6 pt-4 sm:pt-6 pb-4 border-b border-slate-100 dark:border-slate-800 z-10">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-slate-900 dark:text-white">
                {view === 'choose' && 'Add Expense'}
                {view === 'manual' && 'New Expense'}
                {view === 'scan' && 'Scan Receipt'}
              </h2>
              {view === 'choose' && (
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                  Track your pet spending
                </p>
              )}
            </div>
            <button
              onClick={handleClose}
              className="p-2 -mr-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              aria-label="Close"
            >
              <svg className="w-5 h-5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Back button when in sub-view */}
          {view !== 'choose' && (
            <button
              onClick={handleBack}
              className="flex items-center gap-1 mt-3 text-sm text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300 font-medium transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Back
            </button>
          )}
        </div>

        {/* Content - with bottom padding to ensure Save button is reachable */}
        <div className="overflow-y-auto max-h-[calc(95vh-100px)] pb-8">
          {view === 'choose' && (
            <div className="p-6">
              <div className="grid grid-cols-2 gap-4">
                {/* Scan Receipt Option */}
                <button
                  onClick={() => setView('scan')}
                  className="relative flex flex-col items-center justify-center p-6 rounded-2xl border-2 border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-900/20 hover:bg-blue-50 dark:hover:bg-blue-900/30 hover:border-blue-300 dark:hover:border-blue-700 transition-all group"
                >
                  <div className="w-14 h-14 rounded-2xl bg-blue-100 dark:bg-blue-800/50 flex items-center justify-center mb-3 group-hover:scale-105 transition-transform">
                    <svg className="w-7 h-7 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                  </div>
                  <span className="text-sm font-semibold text-blue-700 dark:text-blue-400">Scan Receipt</span>
                  <span className="text-xs text-blue-600/70 dark:text-blue-500 mt-0.5">Auto-extract</span>
                </button>

                {/* Manual Entry Option */}
                <button
                  onClick={() => setView('manual')}
                  className="relative flex flex-col items-center justify-center p-6 rounded-2xl border-2 border-emerald-200 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-900/20 hover:bg-emerald-50 dark:hover:bg-emerald-900/30 hover:border-emerald-300 dark:hover:border-emerald-700 transition-all group"
                >
                  <div className="w-14 h-14 rounded-2xl bg-emerald-100 dark:bg-emerald-800/50 flex items-center justify-center mb-3 group-hover:scale-105 transition-transform">
                    <svg className="w-7 h-7 text-emerald-600 dark:text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                  </div>
                  <span className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">Manual Entry</span>
                  <span className="text-xs text-emerald-600/70 dark:text-emerald-500 mt-0.5">Quick & easy</span>
                </button>
              </div>

              {/* Quick stats teaser */}
              <div className="mt-6 p-4 rounded-xl bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-800/50 dark:to-slate-800 border border-slate-200 dark:border-slate-700">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
                    <span className="text-lg">🐾</span>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Track all your pet expenses</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">Food, supplies, grooming, training & more</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {view === 'manual' && (
            <ManualExpenseForm
              onSubmit={onSubmit}
              onCancel={handleBack}
              onSuccess={handleSuccess}
              initialData={getInitialData()}
            />
          )}

          {view === 'scan' && (
            <div className="p-6">
              {/* Hidden file inputs */}
              <input
                ref={cameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                onChange={(e) => {
                  handleFileSelect(e.target.files?.[0] || null)
                  e.target.value = ''
                }}
                className="sr-only"
              />
              <input
                ref={galleryInputRef}
                type="file"
                accept="image/*"
                onChange={(e) => {
                  handleFileSelect(e.target.files?.[0] || null)
                  e.target.value = ''
                }}
                className="sr-only"
              />

              {/* Error message */}
              {scanError && (
                <div className="mb-5 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 px-4 py-3 text-sm text-red-700 dark:text-red-400 flex items-start gap-3">
                  <svg className="w-5 h-5 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span>{scanError}</span>
                </div>
              )}

              {isScanning ? (
                // Scanning/cropping indicator
                <div className="flex flex-col items-center justify-center py-12 px-4 rounded-2xl bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 border-2 border-dashed border-blue-300 dark:border-blue-700">
                  <div className="w-14 h-14 border-4 border-blue-200 dark:border-blue-700 border-t-blue-500 dark:border-t-blue-400 rounded-full animate-spin mb-4" />
                  <p className="text-sm font-semibold text-blue-700 dark:text-blue-400">Detecting receipt edges...</p>
                  <p className="text-xs text-blue-600/70 dark:text-blue-500 mt-1">Auto-cropping and straightening</p>
                </div>
              ) : !selectedFile ? (
                <>
                  {/* Upload options */}
                  <div className="space-y-4">
                    <button
                      onClick={() => cameraInputRef.current?.click()}
                      className="w-full flex items-center justify-center gap-3 p-4 rounded-xl border-2 border-dashed border-blue-300 dark:border-blue-700 bg-blue-50/50 dark:bg-blue-900/20 hover:bg-blue-50 dark:hover:bg-blue-900/30 hover:border-blue-400 dark:hover:border-blue-600 transition-all"
                    >
                      <span className="text-2xl">📷</span>
                      <span className="text-sm font-semibold text-blue-700 dark:text-blue-400">Take Photo</span>
                    </button>

                    <button
                      onClick={() => galleryInputRef.current?.click()}
                      className="w-full flex items-center justify-center gap-3 p-4 rounded-xl border-2 border-dashed border-slate-300 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/50 hover:bg-slate-50 dark:hover:bg-slate-800 hover:border-slate-400 dark:hover:border-slate-600 transition-all"
                    >
                      <span className="text-2xl">🖼️</span>
                      <span className="text-sm font-semibold text-slate-700 dark:text-slate-400">Choose from Library</span>
                    </button>
                  </div>

                  {/* Tips */}
                  <div className="mt-6 p-4 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
                    <p className="text-sm font-medium text-amber-800 dark:text-amber-300 mb-2">Tips for best results:</p>
                    <ul className="text-xs text-amber-700 dark:text-amber-400 space-y-1">
                      <li>• Make sure the receipt is well-lit</li>
                      <li>• Capture the entire receipt in frame</li>
                      <li>• Avoid shadows and glare</li>
                    </ul>
                  </div>
                </>
              ) : (
                <>
                  {/* Image preview */}
                  <div className="relative">
                    <img
                      src={selectedFile.objectUrl}
                      alt="Receipt preview"
                      className="w-full max-h-64 object-contain rounded-xl border border-slate-200 dark:border-slate-700"
                    />
                    <button
                      onClick={resetScanState}
                      className="absolute top-2 right-2 p-1.5 rounded-full bg-slate-900/70 hover:bg-slate-900/90 text-white transition-colors"
                      aria-label="Remove image"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>

                  <p className="mt-3 text-sm text-slate-500 dark:text-slate-400 text-center">
                    {selectedFile.file.name}
                  </p>

                  {/* Process button */}
                  <button
                    onClick={handleProcessReceipt}
                    disabled={isProcessing}
                    className="mt-5 w-full flex items-center justify-center gap-2 px-4 py-3.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-blue-600/20 hover:shadow-blue-600/30"
                  >
                    {isProcessing ? (
                      <>
                        <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                        <span>Processing...</span>
                      </>
                    ) : (
                      <>
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                        </svg>
                        <span>Process Receipt</span>
                      </>
                    )}
                  </button>

                  {isProcessing && (
                    <p className="mt-3 text-xs text-slate-500 dark:text-slate-400 text-center">
                      Extracting receipt data with AI...
                    </p>
                  )}

                  {/* Retake option */}
                  <div className="mt-4 flex justify-center gap-4">
                    <button
                      onClick={() => cameraInputRef.current?.click()}
                      disabled={isProcessing}
                      className="text-sm text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 font-medium disabled:opacity-50"
                    >
                      📷 Retake
                    </button>
                    <button
                      onClick={() => galleryInputRef.current?.click()}
                      disabled={isProcessing}
                      className="text-sm text-slate-600 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 font-medium disabled:opacity-50"
                    >
                      🖼️ Choose Different
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* Safe area padding for iOS */}
        <div className="h-safe-area-inset-bottom" />
      </div>
    </div>
  )
}
