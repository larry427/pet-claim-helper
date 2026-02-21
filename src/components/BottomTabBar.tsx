import React from 'react'
import { Home, Wallet, ClipboardList, Pill } from 'lucide-react'

type TabId = 'home' | 'expenses' | 'vetbills' | 'meds'

type Props = {
  activeTab: TabId
  onTabChange: (tab: TabId) => void
}

type TabConfig = {
  id: TabId
  label: string
  icon: React.ElementType
}

const TABS: TabConfig[] = [
  { id: 'home', label: 'Home', icon: Home },
  { id: 'expenses', label: 'Expenses', icon: Wallet },
  { id: 'vetbills', label: 'Vet Bills', icon: ClipboardList },
  // HIDDEN - medication reminders disabled, re-enable when ready
  // { id: 'meds', label: 'Meds', icon: Pill },
]

export default function BottomTabBar({ activeTab, onTabChange }: Props) {
  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 bg-white/95 dark:bg-slate-900/95 backdrop-blur-sm border-t border-slate-200/80 dark:border-slate-700/80 shadow-[0_-2px_12px_rgba(0,0,0,0.06)]"
      style={{
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
      }}
    >
      <div className="flex items-center justify-around h-[68px] max-w-lg mx-auto px-2">
        {TABS.map((tab) => {
          const isActive = activeTab === tab.id
          const Icon = tab.icon
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onTabChange(tab.id)}
              className={`
                relative flex flex-col items-center justify-center
                min-w-[72px] min-h-[52px] px-3 py-2.5
                rounded-2xl transition-all duration-300 ease-out
                ${isActive
                  ? 'bg-emerald-50 dark:bg-emerald-900/30 scale-[1.02]'
                  : 'hover:bg-slate-50 dark:hover:bg-slate-800/50 active:scale-95'
                }
              `}
              aria-current={isActive ? 'page' : undefined}
            >
              <Icon
                size={24}
                strokeWidth={isActive ? 2.5 : 2}
                className={`
                  transition-all duration-300 ease-out
                  ${isActive
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-slate-400 dark:text-slate-500'
                  }
                `}
              />
              <span
                className={`
                  text-xs mt-1.5 transition-all duration-300
                  ${isActive
                    ? 'text-emerald-600 dark:text-emerald-400 font-semibold'
                    : 'text-slate-500 dark:text-slate-400 font-medium'
                  }
                `}
              >
                {tab.label}
              </span>
              {/* Active indicator pill */}
              <span
                className={`
                  absolute -bottom-0.5 h-1 rounded-full bg-emerald-500 dark:bg-emerald-400
                  transition-all duration-300 ease-out
                  ${isActive ? 'w-5 opacity-100' : 'w-0 opacity-0'}
                `}
              />
            </button>
          )
        })}
      </div>
    </nav>
  )
}

// Export the TabId type for use in parent components
export type { TabId }
