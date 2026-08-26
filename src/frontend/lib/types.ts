export type UserRole = 'admin' | 'user'
export interface UserPublic { id: number; name: string; email: string | null; role: UserRole; is_active: boolean }
export type UserRead = UserPublic
export interface UserRegister { name: string; email: string; password: string }
export interface UserLogin { email: string; password: string }
export interface KeyLogin { key: string }

export interface PublicConfig {
  instance_name: string
  setup_required: boolean
  auth: { mode: 'password' | 'key' | 'both'; registration: boolean }
  features: { playback: boolean }
  providers: { youtube: boolean; yandex: boolean; spotify: boolean }
}

export interface AdminSettings {
  version: number
  updated_at: string
  updated_by: number | null
  instance_name: string
  auth: PublicConfig['auth']
  features: PublicConfig['features']
  providers: PublicConfig['providers'] & { spotify_market: string }
  credentials: Record<'yandex_token' | 'spotify_client_id' | 'spotify_client_secret', { configured: boolean }>
}

export interface AdminSettingsWrite {
  version: number
  instance_name: string
  auth: AdminSettings['auth']
  features: AdminSettings['features']
  providers: AdminSettings['providers']
  credentials?: Partial<Record<'yandex_token' | 'spotify_client_id' | 'spotify_client_secret', string | null>>
}

export interface SystemStatus {
  app_version: string
  schema_revision: string
  config_version: number
  health: Record<string, 'ok' | 'unknown' | 'unavailable'>
  last_backup: string | null
  available_version: string | null
  commands: Record<string, string>
}

export interface UsersResponse { data: UserRead[]; total: number; page: number; size: number }
export interface UserCreate { name: string; email: string; password: string; role: UserRole }
export interface KeyUserCreate { name: string; role: UserRole; label?: string }
export interface KeyUserCreated { user: UserPublic; access_key: string }
export interface UserUpdate { name?: string; email?: string; password?: string; role?: UserRole; is_active?: boolean }
export interface ProviderTest { status: 'ok' | 'disabled' | 'unavailable' | 'not_configured'; latency_ms: number; message: string }

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
export interface TrackDownloadDescriptor {
  track_id: number
  url: string
  content_type: string
  content_length: number
  etag: string | null
  checksum: string | null
  expires_at: string
  media_version: string
}
export interface TrackDownloadBulkResponse { data: TrackDownloadDescriptor[] }
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
export interface ImportSource { id: string; title: string; tracks_count: number }
export interface ImportedTrack { source_id: string; title: string; artist: string; album?: string | null; year?: number | null; duration_ms?: number | null; cover_url?: string | null }
export interface ImportResult { playlists_created: number; tracks_added: number }
