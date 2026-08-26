import type { ImportedTrack } from './types'

export interface ImportedPlaylistPreview {
  id: string
  title: string
  tracks: ImportedTrack[]
}

export function parseCsv(text: string): Record<string, string>[] {
  const table: string[][] = []
  let row: string[] = [], field = '', quoted = false
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i]
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') { field += '"'; i += 1 }
      else if (char === '"') quoted = false
      else field += char
    } else if (char === '"') quoted = true
    else if (char === ',') { row.push(field); field = '' }
    else if (char === '\n') { row.push(field); table.push(row); row = []; field = '' }
    else if (char !== '\r') field += char
  }
  if (field || row.length) { row.push(field); table.push(row) }
  const headers = table.shift()?.map(value => value.trim().toLowerCase()) ?? []
  return table.filter(values => values.some(Boolean)).map(values =>
    Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ''])),
  )
}

export function mapImportedTracks(rows: Record<string, unknown>[], fallback: string): ImportedTrack[] {
  return rows.map((row, index) => {
    const uri = String(row['track uri'] ?? row.source_id ?? row.id ?? '')
    const releaseDate = String(row['album release date'] ?? '')
    const duration = Number(row['track duration (ms)'] ?? row.duration_ms ?? 0)
    return {
      source_id: uri.replace(/^spotify:track:/, '') || `${fallback}-${index}`,
      title: String(row['track name'] ?? row.title ?? row.track ?? row.name ?? ''),
      artist: String(row['artist name(s)'] ?? row.artist ?? row.artists ?? 'Unknown'),
      album: String(row['album name'] ?? row.album ?? '') || null,
      year: /^\d{4}/.test(releaseDate) ? Number(releaseDate.slice(0, 4)) : null,
      duration_ms: Number.isFinite(duration) && duration > 0 ? duration : null,
      cover_url: String(row['album image url'] ?? row.cover_url ?? '') || null,
    }
  }).filter(track => track.title)
}

const playlistKeys = ['playlist', 'playlist name', 'playlist_name', 'list', 'collection']

export function groupImportedPlaylists(rows: Record<string, unknown>[], fileName: string): ImportedPlaylistPreview[] {
  const fallbackTitle = fileName.replace(/\.(csv|json)$/i, '') || 'Imported playlist'
  const groups = new Map<string, Record<string, unknown>[]>()
  for (const row of rows) {
    const rawTitle = playlistKeys.map((key) => row[key]).find((value) => typeof value === 'string' && value.trim())
    const title = typeof rawTitle === 'string' ? rawTitle.trim() : fallbackTitle
    groups.set(title, [...(groups.get(title) ?? []), row])
  }
  return [...groups.entries()].map(([title, values], index) => ({
    id: `${index}:${title}`,
    title,
    tracks: mapImportedTracks(values, `${fileName}-${index}`),
  })).filter((playlist) => playlist.tracks.length > 0)
}
