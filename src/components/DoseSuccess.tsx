export default function DoseSuccess() {
  // Read display data from URL params - NO database queries
  const params = new URLSearchParams(window.location.search)
  const petName = params.get('pet') || 'Your pet'
  const medName = params.get('med') || 'medication'
  const isSkipped = params.get('skipped') === 'true'

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
                This dose has been marked as skipped.
              </p>
            </div>

            {/* Final message */}
            <div className="border-t border-gray-200 pt-6 mt-2">
              <p className="text-gray-800 font-medium text-center mb-2">
                You're all set!
              </p>
              <p className="text-gray-600 text-sm text-center">
                You can close this tab now.
              </p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Simple success message (no progress tracking)
  return (
    <div className="fixed inset-0 bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
      <div className="bg-white rounded-lg p-8 max-w-md w-full mx-4 shadow-xl">
        <div className="text-center">
          <div className="text-green-600 text-6xl mb-4">✓</div>
          <h2 className="text-2xl font-bold text-gray-800 mb-2">
            Dose Recorded!
          </h2>
          <p className="text-gray-600 text-base mb-6">
            {petName} • {medName}
          </p>

          {/* Success message */}
          <div className="bg-green-50 border border-green-200 rounded-xl p-5 mb-6">
            <p className="text-green-800 text-sm font-medium text-center">
              Great job keeping up with your pet's medication!
            </p>
          </div>

          {/* Final message */}
          <div className="border-t border-gray-200 pt-6 mt-2">
            <p className="text-gray-800 font-medium text-center mb-2">
              You're all set!
            </p>
            <p className="text-gray-600 text-sm text-center">
              You can close this tab now.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
