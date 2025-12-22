interface AddToHomeScreenInstance {
  show(locale: string): void
  clearModalDisplayCount(): void
}

interface Window {
  AddToHomeScreenInstance?: AddToHomeScreenInstance
  AddToHomeScreen: (config: {
    appName: string
    appIconUrl: string
    assetUrl: string
    maxModalDisplayCount: number
    displayOptions: { showMobile: boolean; showDesktop: boolean }
    allowClose: boolean
    showArrow: boolean
  }) => AddToHomeScreenInstance
}
