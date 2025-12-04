export default function DoseSuccess() {
  // Read display data from URL params - NO database queries
  const params = new URLSearchParams(window.location.search)
  const petName = params.get('pet') || 'Your pet'
  const medName = params.get('med') || 'medication'
  const givenCount = parseInt(params.get('count') || '1')
  const totalCount = parseInt(params.get('total') || '1')
  const nextDose = params.get('next') || null

  const percentage = totalCount > 0 ? Math.round((givenCount / totalCount) * 100) : 0
  const remainingCount = totalCount - givenCount
  const isComplete = givenCount >= totalCount

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

          {/* Static message */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
            {nextDose && !isComplete ? (
              <>
                <p className="text-blue-800 text-sm font-medium text-center mb-2">
                  ✓ All done! You can close this tab now.
                </p>
                <p className="text-blue-700 text-xs text-center">
                  📅 Next reminder: {nextDose}
                </p>
              </>
            ) : isComplete ? (
              <p className="text-blue-800 text-sm font-medium text-center">
                🎉 Treatment complete! You can close this tab.
              </p>
            ) : (
              <p className="text-blue-800 text-sm font-medium text-center">
                ✓ All done! You can close this tab now.
              </p>
            )}
          </div>

          <button
            onClick={() => window.history.back()}
            className="bg-green-600 text-white px-6 py-3 rounded-lg hover:bg-green-700 font-semibold"
          >
            ← Back to Messages
          </button>

          <p className="text-gray-500 text-sm mt-3">or close this tab</p>
        </div>
      </div>
    </div>
  )
}
