import { describe, expect, it } from 'vitest'
import { mapImportedTracks, parseCsv } from '@/lib/playlistImport'

describe('Exportify import', () => {
  it('parses quoted Exportify columns and Spotify URI', () => {
    const csv = '"Track URI","Track Name","Artist Name(s)","Album Name","Album Release Date","Album Image URL","Track Duration (ms)"\r\n"spotify:track:abc123","Song, With Comma","Artist","Album","2024-02-01","https://image","140567"\r\n'
    const tracks = mapImportedTracks(parseCsv(csv), 'liked.csv')
    expect(tracks).toEqual([{
      source_id: 'abc123', title: 'Song, With Comma', artist: 'Artist', album: 'Album',
      year: 2024, duration_ms: 140567, cover_url: 'https://image',
    }])
  })
})
