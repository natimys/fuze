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
  id: number
  title: string
  artist: string
  album: string | null
  year: number | null
  duration_ms: number | null
  cover_url: string | null
  source_id: string
  already_downloaded: boolean
}

export interface TrackSearchResponse {
  data: TrackSearchResult[]
  query: string
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
