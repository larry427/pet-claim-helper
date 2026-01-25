import React from 'react'

type TabId = 'home' | 'expenses' | 'vetbills' | 'meds'

type Props = {
  activeTab: TabId
  onTabChange: (tab: TabId) => void
}

type TabConfig = {
  id: TabId
  label: string
  icon: (isActive: boolean) => React.ReactNode
}

// Home icon (house)
const HomeIcon = ({ active }: { active: boolean }) => (
  <svg
    className={`w-6 h-6 transition-colors ${active ? 'text-emerald-600' : 'text-slate-400'}`}
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
    strokeWidth={active ? 2.5 : 2}
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25"
    />
  </svg>
)

// Dollar/wallet icon for Expenses
const ExpensesIcon = ({ active }: { active: boolean }) => (
  <svg
    className={`w-6 h-6 transition-colors ${active ? 'text-emerald-600' : 'text-slate-400'}`}
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
    strokeWidth={active ? 2.5 : 2}
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
    />
  </svg>
)

// Medical clipboard icon for Vet Bills
const VetBillsIcon = ({ active }: { active: boolean }) => (
  <svg
    className={`w-6 h-6 transition-colors ${active ? 'text-emerald-600' : 'text-slate-400'}`}
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
    strokeWidth={active ? 2.5 : 2}
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z"
    />
  </svg>
)

// Pill icon for Medications
const MedsIcon = ({ active }: { active: boolean }) => (
  <svg
    className={`w-6 h-6 transition-colors ${active ? 'text-emerald-600' : 'text-slate-400'}`}
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
    strokeWidth={active ? 2.5 : 2}
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M4.745 3A23.933 23.933 0 003 12c0 3.183.62 6.22 1.745 9M19.5 3c.967 2.78 1.5 5.817 1.5 9s-.533 6.22-1.5 9M8.25 8.885l1.444-.89a.75.75 0 011.105.402l2.402 7.206a.75.75 0 01-1.105.402l-1.444-.89a.75.75 0 00-.405-.082l-2.206.138a.75.75 0 01-.747-.964l1.52-4.56a.75.75 0 00-.082-.405l-.89-1.444a.75.75 0 01.402-1.105l.89-.444z"
    />
  </svg>
)

const TABS: TabConfig[] = [
  {
    id: 'home',
    label: 'Home',
    icon: (isActive) => <HomeIcon active={isActive} />,
  },
  {
    id: 'expenses',
    label: 'Expenses',
    icon: (isActive) => <ExpensesIcon active={isActive} />,
  },
  {
    id: 'vetbills',
    label: 'Vet Bills',
    icon: (isActive) => <VetBillsIcon active={isActive} />,
  },
  {
    id: 'meds',
    label: 'Meds',
    icon: (isActive) => <MedsIcon active={isActive} />,
  },
]

export default function BottomTabBar({ activeTab, onTabChange }: Props) {
  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 shadow-[0_-4px_20px_rgba(0,0,0,0.08)]"
      style={{
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
      }}
    >
      <div className="flex items-center justify-around h-16 max-w-lg mx-auto px-2">
        {TABS.map((tab) => {
          const isActive = activeTab === tab.id
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onTabChange(tab.id)}
              className={`
                flex flex-col items-center justify-center
                min-w-[64px] min-h-[44px] px-3 py-2
                rounded-xl transition-all duration-200
                ${isActive
                  ? 'bg-emerald-50 dark:bg-emerald-900/20'
                  : 'hover:bg-slate-50 dark:hover:bg-slate-800/50 active:bg-slate-100 dark:active:bg-slate-800'
                }
              `}
              aria-current={isActive ? 'page' : undefined}
            >
              {tab.icon(isActive)}
              <span
                className={`
                  text-[11px] font-medium mt-1 transition-colors
                  ${isActive
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-slate-500 dark:text-slate-400'
                  }
                `}
              >
                {tab.label}
              </span>
              {/* Active indicator dot */}
              {isActive && (
                <span className="absolute -bottom-0.5 w-1 h-1 rounded-full bg-emerald-500" />
              )}
            </button>
          )
        })}
      </div>
    </nav>
  )
}

// Export the TabId type for use in parent components
export type { TabId }
