import { platform } from '@/platform'

const trimSlash = (value: string) => value.replace(/\/+$/, '')
const STORAGE_KEY = 'fuze-instance-config'
const configuredBackend = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim()
const configuredFrontend = (import.meta.env.VITE_FRONTEND_BASE_URL as string | undefined)?.trim()

export interface InstanceConfig {
  backendUrl: string
  frontendUrl: string
}

function normalizeHttpUrl(value: string): string {
  const withProtocol = /^[a-z][a-z\d+.-]*:\/\//i.test(value.trim()) ? value.trim() : `https://${value.trim()}`
  const url = new URL(withProtocol)
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Only HTTP and HTTPS addresses are supported')
  if (url.username || url.password || url.search || url.hash) throw new Error('Enter a domain without credentials, query parameters, or a fragment')
  // localhost and 127.0.0.1 are different cookie sites. Keep local desktop-dev
  // instance URLs on the same host as the WebView so auth cookies survive the
  // navigation from key-login to protected API requests.
  if (typeof window !== 'undefined' && ['localhost', '127.0.0.1'].includes(window.location.hostname) && ['localhost', '127.0.0.1'].includes(url.hostname)) {
    url.hostname = window.location.hostname
  }
  return trimSlash(url.toString())
}

export function readInstanceConfig(): InstanceConfig | null {
  if (!platform.isNative) {
    const origin = typeof window === 'undefined' ? '' : window.location.origin
    return {
      backendUrl: configuredBackend ? normalizeHttpUrl(configuredBackend) : origin,
      frontendUrl: configuredFrontend ? normalizeHttpUrl(configuredFrontend) : origin,
    }
  }
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved) {
      const value = JSON.parse(saved) as Partial<InstanceConfig>
      if (value.backendUrl && value.frontendUrl) return {
        backendUrl: normalizeHttpUrl(value.backendUrl),
        frontendUrl: normalizeHttpUrl(value.frontendUrl),
      }
    }
  } catch { /* Invalid local data is treated as an incomplete setup. */ }
  if (configuredBackend && configuredFrontend) return {
    backendUrl: normalizeHttpUrl(configuredBackend),
    frontendUrl: normalizeHttpUrl(configuredFrontend),
  }
  return null
}

export function saveInstanceConfig(value: InstanceConfig): InstanceConfig {
  const normalized = {
    backendUrl: normalizeHttpUrl(value.backendUrl),
    frontendUrl: normalizeHttpUrl(value.frontendUrl),
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized))
  return normalized
}

export function clearInstanceConfig(): void {
  localStorage.removeItem(STORAGE_KEY)
}

export function getApiBaseUrl(): string {
  const backendUrl = readInstanceConfig()?.backendUrl
  if (!backendUrl) throw new Error('Fuze instance is not configured')
  return `${trimSlash(backendUrl)}/api/v1`
}

export function resolveRemoteUrl(url: string): string {
  if (/^(https?:|blob:|data:|asset:)/.test(url)) return url
  return new URL(url, readInstanceConfig()?.backendUrl || window.location.origin).toString()
}
