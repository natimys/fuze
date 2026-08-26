import type { AdminSettings, AdminSettingsWrite, KeyLogin, PlaylistCreate, PlaylistDetail, PlaylistReorder, PlaylistSummary, PlaylistTrack, PlaylistUpdate, ProviderTest, PublicConfig, SystemStatus, TrackAcquireResponse, TrackDownloadBulkResponse, TrackDownloadDescriptor, TrackRead, TrackSearchResponse, TrackSource, TrackStreamResponse, UserCreate, UserLogin, UserPublic, UserRegister, UsersResponse, UserUpdate } from './types'
import type { ImportedTrack, ImportResult, ImportSource } from './types'
import { getApiBaseUrl } from '@/services/runtimeConfig'

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])
let refreshPromise: Promise<boolean> | null = null

export class ApiError extends Error {
  constructor(message: string, public readonly status: number) { super(message); this.name = 'ApiError' }
}

function cookie(name: string): string | undefined {
  if (typeof document === 'undefined') return undefined
  return document.cookie.split('; ').find((part) => part.startsWith(`${name}=`))?.split('=').slice(1).join('=')
}

function headersFor(options: RequestInit): Headers {
  const headers = new Headers(options.headers)
  if (options.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json')
  if (MUTATING.has((options.method ?? 'GET').toUpperCase())) {
    const csrf = cookie('csrf_token') ?? cookie('csrf_access_token')
    if (csrf) headers.set('X-CSRF-TOKEN', decodeURIComponent(csrf))
  }
  return headers
}

async function errorFrom(res: Response): Promise<ApiError> {
  const body = await res.json().catch(() => ({})) as { detail?: unknown; message?: unknown }
  const describe = (value: unknown): string | null => {
    if (typeof value === 'string') return value
    if (Array.isArray(value)) {
      const messages = value.map((item) => {
        if (typeof item === 'string') return item
        if (item && typeof item === 'object' && 'msg' in item && typeof item.msg === 'string') return item.msg
        return null
      }).filter((item): item is string => Boolean(item))
      return messages.length ? messages.join('. ') : null
    }
    if (value && typeof value === 'object' && 'msg' in value && typeof value.msg === 'string') return value.msg
    return null
  }
  return new ApiError(describe(body.detail) ?? describe(body.message) ?? `Request failed: ${res.status}`, res.status)
}

async function tryRefresh(): Promise<boolean> {
  if (refreshPromise) return refreshPromise
  refreshPromise = (async () => {
    try {
      const options: RequestInit = { method: 'POST' }
      const headers = headersFor(options)
      const refreshCsrf = cookie('csrf_refresh_token')
      if (refreshCsrf) headers.set('X-CSRF-TOKEN', decodeURIComponent(refreshCsrf))
      const res = await fetch(`${getApiBaseUrl()}/auth/refresh`, { ...options, credentials: 'include', headers })
      return res.ok
    } catch { return false } finally { refreshPromise = null }
  })()
  return refreshPromise
}

async function request<T>(path: string, options: RequestInit = {}, protectedRequest = true, retried = false): Promise<T> {
  let res: Response
  try {
    res = await fetch(`${getApiBaseUrl()}${path}`, { ...options, credentials: 'include', headers: headersFor(options) })
  } catch (reason) {
    if (reason && typeof reason === 'object' && 'name' in reason && reason.name === 'AbortError') throw reason
    throw new ApiError('Network unavailable. Check your connection and try again.', 0)
  }
  if (res.status === 401 && protectedRequest) {
    if (!retried && await tryRefresh()) return request<T>(path, options, true, true)
    if (typeof window !== 'undefined' && window.location.pathname !== '/auth') window.location.replace('/auth')
  }
  if (!res.ok) throw await errorFrom(res)
  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

export const api = {
  config: () => request<PublicConfig>('/config', {}, false),
  auth: {
    register: (data: UserRegister) => request<UserPublic>('/auth/register', { method: 'POST', body: JSON.stringify(data) }, false),
    login: (data: UserLogin) => request<UserPublic>('/auth/login', { method: 'POST', body: JSON.stringify(data) }, false),
    keyLogin: (data: KeyLogin) => request<UserPublic>('/auth/key-login', { method: 'POST', body: JSON.stringify(data) }, false),
    logout: () => request<void>('/auth/logout', { method: 'POST' }),
    me: () => request<UserPublic>('/auth/me'),
  },
  tracks: {
    search: (q: string, signal?: AbortSignal) => request<TrackSearchResponse>(`/tracks/search?q=${encodeURIComponent(q)}`, { signal }),
    acquire: (source: TrackSource, sourceId: string) => request<TrackAcquireResponse>('/tracks/acquire', { method: 'POST', body: JSON.stringify({ source, source_id: sourceId }) }),
    get: (trackId: number, signal?: AbortSignal) => request<TrackRead>(`/tracks/${trackId}`, { signal }),
    stream: (trackId: number, signal?: AbortSignal) => request<TrackStreamResponse>(`/tracks/${trackId}/stream`, { signal }),
    download: (trackId: number, signal?: AbortSignal) => request<TrackDownloadDescriptor>(`/tracks/${trackId}/download`, { signal }),
    downloadBulk: (trackIds: number[]) => request<TrackDownloadBulkResponse>('/tracks/downloads/bulk', { method: 'POST', body: JSON.stringify({ track_ids: trackIds }) }),
  },
  playlists: {
    list: (signal?: AbortSignal) => request<PlaylistSummary[]>('/playlists', { signal }),
    create: (data: PlaylistCreate) => request<PlaylistSummary>('/playlists', { method: 'POST', body: JSON.stringify(data) }),
    get: (playlistId: number, signal?: AbortSignal) => request<PlaylistDetail>(`/playlists/${playlistId}`, { signal }),
    update: (playlistId: number, data: PlaylistUpdate) => request<PlaylistDetail>(`/playlists/${playlistId}`, { method: 'PATCH', body: JSON.stringify(data) }),
    remove: (playlistId: number) => request<void>(`/playlists/${playlistId}`, { method: 'DELETE' }),
    addItem: (playlistId: number, trackId: number) => request<PlaylistTrack>(`/playlists/${playlistId}/items`, { method: 'POST', body: JSON.stringify({ track_id: trackId }) }),
    removeItem: (playlistId: number, itemId: number) => request<void>(`/playlists/${playlistId}/items/${itemId}`, { method: 'DELETE' }),
    reorder: (playlistId: number, data: PlaylistReorder) => request<PlaylistDetail>(`/playlists/${playlistId}/items/reorder`, { method: 'PUT', body: JSON.stringify(data) }),
    yandexSources: (token: string) => request<ImportSource[]>('/playlists/imports/yandex/playlists', { method: 'POST', body: JSON.stringify({ token }) }),
    importYandex: (token: string, playlistIds: string[]) => request<ImportResult>('/playlists/imports/yandex', { method: 'POST', body: JSON.stringify({ token, playlist_ids: playlistIds }) }),
    importFile: (title: string, source: TrackSource, tracks: ImportedTrack[]) => request<ImportResult>('/playlists/imports/file', { method: 'POST', body: JSON.stringify({ title, source, tracks }) }),
  },
  admin: {
    settings: () => request<AdminSettings>('/admin/settings'),
    saveSettings: (data: AdminSettingsWrite) => request<AdminSettings>('/admin/settings', { method: 'PUT', body: JSON.stringify(data) }),
    system: () => request<SystemStatus>('/admin/system'),
    testProvider: (provider: 'youtube' | 'yandex' | 'spotify') => request<ProviderTest>(`/admin/providers/${provider}/test`, { method: 'POST' }),
    users: (page = 1, size = 20, search = '') => request<UsersResponse>(`/users?page=${page}&size=${size}&search=${encodeURIComponent(search)}`),
    createUser: (data: UserCreate) => request<UserPublic>('/users', { method: 'POST', body: JSON.stringify(data) }),
    updateUser: (id: number, data: UserUpdate) => request<UserPublic>(`/users/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  },
}
