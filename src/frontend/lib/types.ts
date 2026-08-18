export interface UserPublic {
  name: string
  email: string
}

export interface UserRead {
  id: number
  name: string
  email: string
  role: string
  is_active: boolean
}

export interface UserRegister {
  name: string
  email: string
  password: string
}

export interface UserLogin {
  email: string
  password: string
}

export interface TrackSearchResult {
  key: string
  track_id: number | null
  source: 'yandex' | 'youtube' | 'spotify'
  action: 'playable' | 'external'
  title: string
  artist: string
  album: string | null
  year: number | null
  duration_ms: number | null
  cover_url: string | null
  source_id: string
  external_url: string | null
  already_downloaded: boolean
}

export interface TrackSearchResponse {
  data: TrackSearchResult[]
  query: string
  providers: Record<string, { status: 'ok' | 'unavailable' | 'rate_limited' | 'quota_exceeded'; cached: boolean }>
  spotify_search_url: string
}

export interface TrackRead {
  id: number
  title: string
  artist: string
  album: string | null
  release_year: number | null
  duration_ms: number | null
  cover_url: string | null
  source: string
  source_id: string
}

export interface TrackStreamResponse {
  url: string
}

export interface TrackDownloadResponse {
  status: string
  track_id: number
}
