export type UserRole = 'admin' | 'user'
export interface UserPublic { id: number; name: string; email: string | null; role: UserRole; is_active: boolean }
export type UserRead = UserPublic
export interface UserRegister { name: string; email: string; password: string }
export interface UserLogin { email: string; password: string }
export interface KeyLogin { key: string }

export interface PublicConfig {
  auth: { mode: 'password' | 'key' | 'both'; registration: boolean }
  features: { playback: boolean }
  providers: { youtube: boolean; yandex: boolean; spotify: boolean }
}

export type TrackSource = 'yandex' | 'youtube' | 'spotify'
export type TrackCapability = 'acquire' | 'external' | 'catalog'
export type TrackAvailability = 'remote' | 'queued' | 'downloading' | 'ready' | 'failed'

export interface TrackSearchResult {
  key: string
  track_id: number | null
  source: TrackSource
  capability: TrackCapability
  availability: TrackAvailability
  title: string
  artist: string
  album: string | null
  year: number | null
  duration_ms: number | null
  cover_url: string | null
  source_id: string
  external_url: string | null
  error_code?: string | null
  error_message?: string | null
}

export interface ProviderState {
  status: 'ok' | 'disabled' | 'unavailable' | 'rate_limited' | 'quota_exceeded'
  cached: boolean
}

export interface TrackSearchResponse {
  data: TrackSearchResult[]
  query: string
  providers: Record<string, ProviderState>
  spotify_search_url?: string | null
}

export interface TrackRead {
  id: number
  title: string
  artist: string
  album: string | null
  release_year: number | null
  duration_ms: number | null
  cover_url: string | null
  source: TrackSource
  source_id: string
  download_status: Exclude<TrackAvailability, 'remote'>
  download_attempts: number
  download_error_code?: string | null
  download_error_message?: string | null
}

export interface TrackStreamResponse { url: string }
export interface TrackAcquireResponse { status: Exclude<TrackAvailability, 'remote'>; track_id: number }

export interface PlaylistSummary {
  id: number
  owner_id: number
  title: string
  description: string | null
  tracks_count: number
  created_at: string
  updated_at: string
}

export interface PlaylistTrack {
  id: number
  position: number
  track: TrackRead
}

export interface PlaylistDetail extends PlaylistSummary {
  items: PlaylistTrack[]
}

export interface PlaylistCreate { title: string; description?: string | null }
export interface PlaylistUpdate { title?: string; description?: string | null }
export interface PlaylistReorder { item_ids: number[] }
