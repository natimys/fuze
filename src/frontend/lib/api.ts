import type {
  UserPublic,
  UserRegister,
  UserLogin,
  TrackSearchResponse,
  TrackStreamResponse,
  TrackDownloadResponse,
} from './types'

const API_BASE = '/api'

let isRefreshing = false
let refreshPromise: Promise<boolean> | null = null

async function tryRefresh(): Promise<boolean> {
  if (isRefreshing && refreshPromise) {
    return refreshPromise
  }

  isRefreshing = true
  refreshPromise = (async () => {
    try {
      const res = await fetch(`${API_BASE}/auth/refresh/`, {
        method: 'POST',
        credentials: 'include',
      })
      return res.ok
    } catch {
      return false
    } finally {
      isRefreshing = false
      refreshPromise = null
    }
  })()

  return refreshPromise
}

async function request<T>(
  path: string,
  options: RequestInit = {},
  retryCount = 0,
): Promise<T> {
  const url = `${API_BASE}${path}`
  const res = await fetch(url, {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    ...options,
  })

  if (res.status === 401) {
    if (retryCount >= 2) {
      if (typeof window !== 'undefined') {
        window.location.href = '/auth'
      }
      throw new Error('Unauthorized')
    }

    const refreshed = await tryRefresh()
    if (refreshed) {
      return request<T>(path, options, retryCount + 1)
    }

    if (typeof window !== 'undefined') {
      window.location.href = '/auth'
    }
    throw new Error('Unauthorized')
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.detail || `Request failed: ${res.status}`)
  }

  if (res.status === 204) return undefined as T
  return res.json()
}

export const api = {
  auth: {
    register: (data: UserRegister) =>
      request<UserPublic>('/auth/register/', {
        method: 'POST',
        body: JSON.stringify(data),
      }),

    login: (data: UserLogin) =>
      request<{ access_token: string; refresh_token: string }>('/auth/login/', {
        method: 'POST',
        body: JSON.stringify(data),
      }),

    logout: () =>
      request<void>('/auth/logout/', { method: 'POST' }),

    me: () => request<UserPublic>('/auth/me/'),

    refresh: () => tryRefresh(),
  },

  tracks: {
    search: (q: string) =>
      request<TrackSearchResponse>(`/tracks/search/?q=${encodeURIComponent(q)}`),

    download: (trackId: number) =>
      request<TrackDownloadResponse>(`/tracks/${trackId}/download/`, {
        method: 'POST',
      }),

    stream: (trackId: number) =>
      request<TrackStreamResponse>(`/tracks/${trackId}/stream`),
  },
}
