export default function DoseSuccess() {
  // Read display data from URL params - NO database queries
  const params = new URLSearchParams(window.location.search)
  const petName = params.get('pet') || 'Your pet'
  const medName = params.get('med') || 'medication'
  const givenCount = parseInt(params.get('count') || '1')
  const totalCount = parseInt(params.get('total') || '1')
  const nextDose = params.get('next') || null
  const isSkipped = params.get('skipped') === 'true'

  const percentage = totalCount > 0 ? Math.min(Math.round((givenCount / totalCount) * 100), 100) : 0
  const remainingCount = totalCount - givenCount
  const isComplete = givenCount >= totalCount

  // If skipped, show different UI
  if (isSkipped) {
    return (
      <div className="fixed inset-0 bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
        <div className="bg-white rounded-lg p-8 max-w-md w-full mx-4 shadow-xl">
          <div className="text-center">
            <div className="text-gray-500 text-6xl mb-4">⏭️</div>
            <h2 className="text-2xl font-bold text-gray-800 mb-2">
              Dose Skipped
            </h2>
            <p className="text-gray-600 text-base mb-6">
              {petName} • {medName}
            </p>

            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 mb-6">
              <p className="text-gray-700 text-sm text-center">
                This dose has been marked as skipped. It won't count toward your progress, but we've recorded your choice.
              </p>
            </div>

            {/* Final message - no buttons */}
            <div className="border-t border-gray-200 pt-6 mt-2">
              <p className="text-gray-800 font-medium text-center mb-2">
                You're all set!
              </p>
              <p className="text-gray-600 text-sm text-center">
                Use your back button or close this window to return to your messages.
              </p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
      <div className="bg-white rounded-lg p-8 max-w-md w-full mx-4 shadow-xl">
        <div className="text-center">
          <div className="text-green-600 text-6xl mb-4">✓</div>
          <h2 className="text-2xl font-bold text-gray-800 mb-2">
            {isComplete ? 'All doses recorded!' : `Dose ${givenCount} of ${totalCount} recorded`}
          </h2>
          <p className="text-gray-600 text-base mb-6">
            {petName} • {medName}
          </p>

          {/* Progress Bar */}
          <div className="bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-200 rounded-xl p-5 mb-6">
            <div className="mb-4">
              <div className="w-full bg-gray-200 rounded-full h-4 overflow-hidden shadow-inner mb-3">
                <div
                  className="h-full bg-gradient-to-r from-green-400 to-green-600 rounded-full transition-all duration-500 ease-out shadow-sm"
                  style={{ width: `${percentage}%` }}
                />
              </div>
              <div className="text-center">
                <span className="text-2xl font-bold text-gray-800">{percentage}%</span>
                <p className="text-sm text-gray-600 mt-1">
                  {isComplete
                    ? '🎉 Treatment complete!'
                    : remainingCount === 1
                    ? 'Just 1 more dose!'
                    : `${remainingCount} doses to go`}
                </p>
              </div>
            </div>

            {!isComplete && nextDose && (
              <div className="flex items-center justify-between py-2 px-3 bg-white/60 rounded-lg">
                <span className="text-sm text-gray-600">Next dose:</span>
                <span className="text-sm font-semibold text-gray-800">{nextDose}</span>
              </div>
            )}
          </div>

          {/* Next dose info */}
          {nextDose && !isComplete && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
              <p className="text-blue-700 text-sm text-center">
                📅 Next reminder: {nextDose}
              </p>
            </div>
          )}

          {/* Final message - no buttons */}
          <div className="border-t border-gray-200 pt-6 mt-2">
            <p className="text-gray-800 font-medium text-center mb-2">
              You're all set!
            </p>
            <p className="text-gray-600 text-sm text-center">
              Use your back button or close this window to return to your messages.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
