import { describe, expect, it } from 'vitest'
import { groupImportedPlaylists, mapImportedTracks, parseCsv } from '@/lib/playlistImport'

describe('Exportify import', () => {
  it('parses quoted Exportify columns and Spotify URI', () => {
    const csv = '"Track URI","Track Name","Artist Name(s)","Album Name","Album Release Date","Album Image URL","Track Duration (ms)"\r\n"spotify:track:abc123","Song, With Comma","Artist","Album","2024-02-01","https://image","140567"\r\n'
    const tracks = mapImportedTracks(parseCsv(csv), 'liked.csv')
    expect(tracks).toEqual([{
      source_id: 'abc123', title: 'Song, With Comma', artist: 'Artist', album: 'Album',
      year: 2024, duration_ms: 140567, cover_url: 'https://image',
    }])
  })

  it('groups common CSV rows by playlist before import', () => {
    const csv = 'playlist,title,artist,album\nRoadtrip,Drive,Artist A,Album A\nLiked Songs,Heart,Artist B,Album B\nRoadtrip,Sun,Artist C,Album C\n'
    const groups = groupImportedPlaylists(parseCsv(csv), 'music.csv')
    expect(groups.map((group) => [group.title, group.tracks.length])).toEqual([['Roadtrip', 2], ['Liked Songs', 1]])
  })
})
