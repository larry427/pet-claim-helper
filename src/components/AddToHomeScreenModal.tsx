import { useEffect, useState } from 'react'

interface AddToHomeScreenModalProps {
  open: boolean
  onClose: () => void
  onConfirm: () => void
}

type DeviceType = 'ios-safari' | 'ios-chrome' | 'android-chrome' | 'desktop'

const detectDevice = (): DeviceType => {
  const ua = navigator.userAgent.toLowerCase()
  const isIOS = /iphone|ipad|ipod/.test(ua)
  const isAndroid = /android/.test(ua)
  const isChrome = /chrome|crios/.test(ua)
  const isSafari = /safari/.test(ua) && !/chrome|crios/.test(ua)

  if (isIOS && isSafari) return 'ios-safari'
  if (isIOS && isChrome) return 'ios-chrome'
  if (isAndroid && isChrome) return 'android-chrome'
  return 'desktop'
}

const DEVICE_INSTRUCTIONS = {
  'ios-safari': {
    icon: (
      <svg className="w-12 h-12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <path d="M12 8v8m0 0l-3-3m3 3l3-3" />
      </svg>
    ),
    steps: [
      "Tap the Share button at the bottom of your screen",
      "Scroll down and tap 'Add to Home Screen'",
      "Tap 'Add' to confirm"
    ]
  },
  'ios-chrome': {
    icon: (
      <svg className="w-12 h-12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <circle cx="12" cy="6" r="1" fill="currentColor" />
        <circle cx="12" cy="12" r="1" fill="currentColor" />
        <circle cx="12" cy="18" r="1" fill="currentColor" />
      </svg>
    ),
    steps: [
      "Tap the three dots menu (⋯) in the top right",
      "Tap 'Add to Home Screen'",
      "Tap 'Add' to confirm"
    ]
  },
  'android-chrome': {
    icon: (
      <svg className="w-12 h-12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <circle cx="18" cy="6" r="1" fill="currentColor" />
        <circle cx="18" cy="12" r="1" fill="currentColor" />
        <circle cx="18" cy="18" r="1" fill="currentColor" />
      </svg>
    ),
    steps: [
      "Tap the menu (⋮) in the top right corner",
      "Tap 'Add to Home Screen' or 'Install App'",
      "Tap 'Add' to confirm"
    ]
  },
  'desktop': {
    icon: (
      <svg className="w-12 h-12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <rect x="3" y="4" width="18" height="14" rx="2" />
        <path d="M8 21h8m-4-4v4" />
      </svg>
    ),
    steps: [
      "Bookmark this page for easy access",
      "Or simply type petclaimhelper.com anytime"
    ]
  }
}

export default function AddToHomeScreenModal({ open, onClose, onConfirm }: AddToHomeScreenModalProps) {
  const [device, setDevice] = useState<DeviceType>('desktop')
  const [isVisible, setIsVisible] = useState(false)

  useEffect(() => {
    setDevice(detectDevice())
  }, [])

  useEffect(() => {
    if (open) {
      // Small delay for smooth animation
      setTimeout(() => setIsVisible(true), 10)
    } else {
      setIsVisible(false)
    }
  }, [open])

  if (!open) return null

  const instructions = DEVICE_INSTRUCTIONS[device]

  const handleClose = () => {
    setIsVisible(false)
    setTimeout(onClose, 300)
  }

  const handleConfirm = () => {
    setIsVisible(false)
    setTimeout(onConfirm, 300)
  }

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;700&family=DM+Sans:wght@400;500&display=swap');

        .a2hs-modal-overlay {
          background: rgba(15, 23, 42, 0.85);
          backdrop-filter: blur(8px);
          transition: opacity 300ms cubic-bezier(0.4, 0, 0.2, 1);
        }

        .a2hs-modal-container {
          transition: all 300ms cubic-bezier(0.34, 1.56, 0.64, 1);
        }

        .a2hs-modal-overlay.visible {
          opacity: 1;
        }

        .a2hs-modal-overlay:not(.visible) {
          opacity: 0;
        }

        .a2hs-modal-container.visible {
          transform: translateY(0) scale(1);
          opacity: 1;
        }

        .a2hs-modal-container:not(.visible) {
          transform: translateY(20px) scale(0.95);
          opacity: 0;
        }

        .a2hs-paw-bg {
          position: absolute;
          opacity: 0.03;
          pointer-events: none;
        }

        .a2hs-gradient-mesh {
          background:
            radial-gradient(circle at 20% 30%, rgba(16, 185, 129, 0.15) 0%, transparent 50%),
            radial-gradient(circle at 80% 70%, rgba(6, 182, 212, 0.12) 0%, transparent 50%),
            linear-gradient(135deg, rgba(15, 23, 42, 0.95) 0%, rgba(30, 41, 59, 0.98) 100%);
        }

        .a2hs-step {
          animation: slideInStep 500ms cubic-bezier(0.34, 1.56, 0.64, 1) backwards;
        }

        .a2hs-step:nth-child(1) { animation-delay: 100ms; }
        .a2hs-step:nth-child(2) { animation-delay: 200ms; }
        .a2hs-step:nth-child(3) { animation-delay: 300ms; }

        @keyframes slideInStep {
          from {
            opacity: 0;
            transform: translateX(-20px);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }

        .a2hs-button-primary {
          background: linear-gradient(135deg, #10b981 0%, #059669 100%);
          box-shadow:
            0 4px 16px rgba(16, 185, 129, 0.4),
            inset 0 1px 0 rgba(255, 255, 255, 0.2);
          transition: all 200ms cubic-bezier(0.4, 0, 0.2, 1);
        }

        .a2hs-button-primary:hover {
          transform: translateY(-2px);
          box-shadow:
            0 8px 24px rgba(16, 185, 129, 0.5),
            inset 0 1px 0 rgba(255, 255, 255, 0.2);
        }

        .a2hs-button-primary:active {
          transform: translateY(0);
        }

        .a2hs-icon-glow {
          filter: drop-shadow(0 0 20px rgba(16, 185, 129, 0.6));
        }
      `}</style>

      <div
        className={`a2hs-modal-overlay ${isVisible ? 'visible' : ''}`}
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 9999,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '1rem'
        }}
        onClick={handleClose}
      >
        <div
          className={`a2hs-modal-container ${isVisible ? 'visible' : ''}`}
          style={{
            position: 'relative',
            width: '100%',
            maxWidth: '440px',
            overflow: 'hidden',
            borderRadius: '24px',
            fontFamily: "'DM Sans', system-ui, sans-serif"
          }}
          onClick={e => e.stopPropagation()}
        >
          {/* Gradient Mesh Background */}
          <div className="a2hs-gradient-mesh" style={{ position: 'relative', padding: '2rem' }}>

            {/* Decorative Paw Prints */}
            <div className="a2hs-paw-bg" style={{ top: '10%', right: '5%', fontSize: '120px' }}>🐾</div>
            <div className="a2hs-paw-bg" style={{ bottom: '15%', left: '8%', fontSize: '80px', transform: 'rotate(-20deg)' }}>🐾</div>

            {/* Close Button */}
            <button
              onClick={handleClose}
              style={{
                position: 'absolute',
                top: '1rem',
                right: '1rem',
                background: 'rgba(255, 255, 255, 0.1)',
                border: 'none',
                borderRadius: '50%',
                width: '32px',
                height: '32px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                color: 'rgba(255, 255, 255, 0.8)',
                fontSize: '20px',
                transition: 'all 200ms',
                zIndex: 10
              }}
              onMouseEnter={e => {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)'
                e.currentTarget.style.transform = 'rotate(90deg)'
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)'
                e.currentTarget.style.transform = 'rotate(0deg)'
              }}
            >
              ×
            </button>

            {/* Header */}
            <div style={{ textAlign: 'center', marginBottom: '2rem', position: 'relative', zIndex: 1 }}>
              <div style={{ marginBottom: '1rem' }}>
                <span style={{ fontSize: '48px', display: 'inline-block' }}>🐾</span>
              </div>
              <h2 style={{
                fontFamily: "'Space Grotesk', sans-serif",
                fontSize: '28px',
                fontWeight: 700,
                color: '#ffffff',
                marginBottom: '0.5rem',
                letterSpacing: '-0.02em',
                lineHeight: 1.2
              }}>
                Never lose Pet Claim Helper!
              </h2>
              <p style={{
                fontSize: '16px',
                color: 'rgba(255, 255, 255, 0.7)',
                fontWeight: 500,
                letterSpacing: '-0.01em'
              }}>
                Add PCH to your home screen for instant access
              </p>
            </div>

            {/* Device Icon & Instructions */}
            <div style={{ position: 'relative', zIndex: 1 }}>
              <div style={{
                display: 'flex',
                justifyContent: 'center',
                marginBottom: '2rem',
                color: '#10b981'
              }} className="a2hs-icon-glow">
                {instructions.icon}
              </div>

              <div style={{ marginBottom: '2rem' }}>
                {instructions.steps.map((step, idx) => (
                  <div
                    key={idx}
                    className="a2hs-step"
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      marginBottom: idx < instructions.steps.length - 1 ? '1rem' : 0,
                      padding: '0.75rem',
                      background: 'rgba(255, 255, 255, 0.05)',
                      borderRadius: '12px',
                      border: '1px solid rgba(255, 255, 255, 0.1)'
                    }}
                  >
                    <div style={{
                      minWidth: '28px',
                      height: '28px',
                      borderRadius: '50%',
                      background: 'linear-gradient(135deg, #10b981, #059669)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '14px',
                      fontWeight: 700,
                      color: '#ffffff',
                      marginRight: '0.75rem',
                      fontFamily: "'Space Grotesk', sans-serif"
                    }}>
                      {idx + 1}
                    </div>
                    <p style={{
                      fontSize: '15px',
                      color: 'rgba(255, 255, 255, 0.9)',
                      lineHeight: 1.6,
                      margin: '4px 0 0 0'
                    }}>
                      {step}
                    </p>
                  </div>
                ))}
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                <button
                  onClick={handleConfirm}
                  className="a2hs-button-primary"
                  style={{
                    width: '100%',
                    padding: '1rem 2rem',
                    border: 'none',
                    borderRadius: '12px',
                    fontSize: '16px',
                    fontWeight: 700,
                    color: '#ffffff',
                    cursor: 'pointer',
                    fontFamily: "'Space Grotesk', sans-serif",
                    letterSpacing: '-0.01em'
                  }}
                >
                  I've Added It! ✓
                </button>

                <button
                  onClick={handleClose}
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    background: 'transparent',
                    border: 'none',
                    fontSize: '14px',
                    fontWeight: 500,
                    color: 'rgba(255, 255, 255, 0.6)',
                    cursor: 'pointer',
                    transition: 'color 200ms'
                  }}
                  onMouseEnter={e => e.currentTarget.style.color = 'rgba(255, 255, 255, 0.9)'}
                  onMouseLeave={e => e.currentTarget.style.color = 'rgba(255, 255, 255, 0.6)'}
                >
                  Remind me later
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
