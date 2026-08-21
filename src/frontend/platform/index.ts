export type PlatformKind = 'web' | 'pwa' | 'tauri'
export type FormFactor = 'desktop' | 'mobile'

const tauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
const supportsMatchMedia = typeof window !== 'undefined' && typeof window.matchMedia === 'function'
const mobile = typeof window !== 'undefined' && ((supportsMatchMedia && window.matchMedia('(pointer: coarse)').matches) || innerWidth < 768)
const standalone = typeof window !== 'undefined' && ((supportsMatchMedia && window.matchMedia('(display-mode: standalone)').matches) || (navigator as Navigator & { standalone?: boolean }).standalone === true)

export const platform = Object.freeze({
  kind: (tauri ? 'tauri' : standalone ? 'pwa' : 'web') as PlatformKind,
  formFactor: (mobile ? 'mobile' : 'desktop') as FormFactor,
  isNative: tauri,
  isDesktop: !mobile,
  isMobile: mobile,
  isStandalone: tauri || standalone,
  canDownload: true,
  canUseNativeFilesystem: tauri,
  canUseMediaKeys: typeof navigator !== 'undefined' && 'mediaSession' in navigator,
  canUseNotifications: typeof Notification !== 'undefined',
})

export function applyPlatformAttributes(): void {
  document.documentElement.dataset.platform = platform.kind
  document.documentElement.dataset.formFactor = platform.formFactor
  document.documentElement.classList.toggle('standalone', platform.isStandalone)
}

export async function handleNativeBack(): Promise<boolean> {
  if (!platform.isNative || !platform.isMobile || history.length <= 1) return false
  history.back()
  return true
}
