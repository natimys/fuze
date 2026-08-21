import { platform } from '@/platform'

const trimSlash = (value: string) => value.replace(/\/+$/, '')
const configured = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim()

if (platform.isNative && !configured && import.meta.env.PROD) {
  throw new Error('VITE_API_BASE_URL is required for production native builds')
}

export const apiBaseUrl = `${configured ? trimSlash(configured) : ''}/api/v1`

export function resolveRemoteUrl(url: string): string {
  if (/^(https?:|blob:|data:|asset:)/.test(url)) return url
  return new URL(url, configured || window.location.origin).toString()
}
