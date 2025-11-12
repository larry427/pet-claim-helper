import React, { useEffect, useState } from 'react'

type Props = {
  title: string
  description: string
}

export default function TooltipIcon({ title, description }: Props) {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!open) return
    // Prevent body scroll
    const originalOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    // Handle escape key
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = originalOverflow
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <>
      <button
        type="button"
        aria-label="More info"
        className="inline-flex items-center text-slate-500 hover:opacity-70 cursor-pointer"
        onClick={() => setOpen(true)}
      >
        <span className="text-gray-500 cursor-pointer hover:opacity-70">ℹ️</span>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={() => setOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            className="relative w-[90vw] max-w-md rounded-lg bg-white p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              aria-label="Close"
              className="absolute right-3 top-3 text-slate-500 hover:opacity-70"
              onClick={() => setOpen(false)}
            >
              ×
            </button>
            <div className="text-lg font-bold text-slate-900">{title}</div>
            <div className="mt-3 text-base text-slate-700">{description}</div>
          </div>
        </div>
      )}
    </>
  )
}


