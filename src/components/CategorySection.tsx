import React, { ReactNode } from 'react'

type Props = {
  icon: string
  title: string
  actionButton?: {
    label: string
    onClick: () => void
  }
  children: ReactNode
  footerTotal?: {
    amount: number
    selectedMonth: Date
    onPreviousMonth: () => void
    onNextMonth: () => void
    petCount: number
    daysInMonth: number
  }
}

export default function CategorySection({
  icon,
  title,
  actionButton,
  children,
  footerTotal
}: Props) {
  return (
    <section className="my-12">
      {/* HEADER BAR */}
      <div className="bg-gradient-to-r from-emerald-50 to-white border-b-2 border-emerald-100 shadow-sm rounded-t-xl">
        <div className="h-[60px] px-6 flex items-center justify-between">
          {/* Left: Icon + Title */}
          <div className="flex items-center gap-3">
            <span className="text-[32px]" role="img" aria-label={title}>
              {icon}
            </span>
            <h2 className="text-xl font-bold text-emerald-800 tracking-wide">
              {title}
            </h2>
          </div>

          {/* Right: Action Button */}
          {actionButton && (
            <button
              onClick={actionButton.onClick}
              className="hidden md:flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-semibold transition-all duration-200 shadow-sm hover:shadow-md"
            >
              <span className="text-xl">+</span>
              {actionButton.label}
            </button>
          )}
        </div>

        {/* Mobile: Action Button Below Title */}
        {actionButton && (
          <div className="md:hidden px-6 pb-4">
            <button
              onClick={actionButton.onClick}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-semibold transition-all duration-200 shadow-sm"
            >
              <span className="text-xl">+</span>
              {actionButton.label}
            </button>
          </div>
        )}
      </div>

      {/* CONTENT AREA */}
      <div className="bg-white px-6 py-8">
        {children}
      </div>

      {/* FOOTER/TOTAL BAR */}
      {footerTotal && (
        <div className="bg-gradient-to-br from-emerald-600 via-emerald-500 to-teal-600 rounded-b-xl shadow-xl overflow-hidden">
          <div className="px-8 py-6">
            <div className="flex items-center justify-between gap-8">
              {/* Left: Total Info */}
              <div className="flex-1">
                <div className="text-sm font-bold text-emerald-100 uppercase tracking-wider mb-2">
                  Monthly Total
                </div>

                {/* Month Navigation */}
                <div className="flex items-center gap-4 mb-3">
                  <button
                    onClick={footerTotal.onPreviousMonth}
                    className="text-white hover:text-emerald-100 transition-colors p-1"
                    aria-label="Previous month"
                  >
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                  </button>
                  <div className="text-xl font-bold text-white min-w-[180px] text-center">
                    {footerTotal.selectedMonth.toLocaleDateString('en-US', {
                      month: 'long',
                      year: 'numeric'
                    })}
                  </div>
                  <button
                    onClick={footerTotal.onNextMonth}
                    className="text-white hover:text-emerald-100 transition-colors p-1"
                    aria-label="Next month"
                  >
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                </div>

                {/* Amount */}
                <div className="text-5xl font-black text-white mb-1">
                  ${footerTotal.amount.toFixed(2)}
                </div>

                {/* Subtitle */}
                <div className="text-sm text-emerald-100 font-medium">
                  {footerTotal.petCount} {footerTotal.petCount === 1 ? 'pet' : 'pets'} • ${(footerTotal.amount / footerTotal.daysInMonth).toFixed(2)}/day
                </div>
              </div>

              {/* Right: PCH Logo */}
              <div className="flex-shrink-0 hidden lg:flex items-center">
                <div className="bg-white rounded-2xl p-3 shadow-lg">
                  <img
                    src="/pch-logo.png"
                    alt="Pet Claim Helper"
                    className="w-[120px] h-[120px]"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
