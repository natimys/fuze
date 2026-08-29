import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SearchModal } from '@/components/search/SearchModal'
import { api } from '@/lib/api'
import { usePlayerStore } from '@/lib/store'

vi.mock('@/lib/api', () => ({
  api: {
    tracks: {
      search: vi.fn(),
      acquire: vi.fn(),
    },
  },
}))

afterEach(cleanup)

describe('SearchModal Spotify attribution', () => {
  it('renders Spotify metadata in a separate attributed section linked to Spotify', async () => {
    vi.mocked(api.tracks.search).mockResolvedValue({
      query: 'test',
      data: [
        {
          key: 'youtube:abcdefghijk', track_id: null, source: 'youtube', capability: 'acquire', availability: 'remote',
          title: 'YouTube Track', artist: 'Video Artist', album: null, year: null, duration_ms: 180000,
          cover_url: null, source_id: 'abcdefghijk', external_url: 'https://www.youtube.com/watch?v=abcdefghijk',
        },
        {
          key: 'spotify:0123456789012345678901', track_id: null, source: 'spotify', capability: 'external', availability: 'remote',
          title: 'Spotify Track', artist: 'Spotify Artist', album: 'Spotify Album', year: 2026, duration_ms: 190000,
          cover_url: 'https://i.scdn.co/image/example', source_id: '0123456789012345678901', external_url: 'https://open.spotify.com/track/0123456789012345678901',
        },
      ],
      providers: {
        yandex: { status: 'ok', cached: false },
        spotify: { status: 'ok', cached: false },
        youtube: { status: 'ok', cached: false },
      },
      spotify_search_url: 'https://open.spotify.com/search/test',
    })

    render(<SearchModal isOpen onClose={() => undefined} />)
    fireEvent.change(screen.getByLabelText('Search query'), { target: { value: 'test' } })

    const spotifySection = await screen.findByRole('region', { name: 'Spotify results' })
    expect(within(spotifySection).getByRole('img', { name: 'Spotify' })).toHaveAttribute('src', '/spotify-full-logo-white.svg')
    expect(within(spotifySection).getByText('Spotify Track')).toBeInTheDocument()
    expect(within(spotifySection).queryByText('YouTube Track')).not.toBeInTheDocument()
    expect(within(spotifySection).getByRole('link', { name: 'OPEN SPOTIFY' })).toHaveAttribute('href', 'https://open.spotify.com/search/test')
    await waitFor(() => expect(api.tracks.search).toHaveBeenCalledWith('test', expect.any(AbortSignal)))
  })

  it('adds a ready search result directly to a playlist without changing the queue', async () => {
    const readyTrack = {
      key: 'youtube:ready-track', track_id: 42, source: 'youtube' as const, capability: 'acquire' as const, availability: 'ready' as const,
      title: 'Ready Track', artist: 'Artist', album: null, year: null, duration_ms: 180000,
      cover_url: null, source_id: 'ready-track', external_url: null,
    }
    vi.mocked(api.tracks.search).mockResolvedValue({
      query: 'ready', data: [readyTrack], providers: { youtube: { status: 'ok', cached: false } },
    })
    usePlayerStore.setState({
      queue: [],
      config: { instance_name: 'Fuze', setup_required: false, auth: { mode: 'password', registration: true }, features: { playback: true }, providers: { youtube: true, yandex: false, spotify: false } },
    })
    const onTrackReady = vi.fn()

    render(<SearchModal isOpen destination="playlist" onTrackReady={onTrackReady} onClose={() => undefined} />)
    fireEvent.change(screen.getByLabelText('Search query'), { target: { value: 'ready' } })
    fireEvent.click(await screen.findByRole('button', { name: 'Add Ready Track to playlist' }))

    await waitFor(() => expect(onTrackReady).toHaveBeenCalledWith(readyTrack))
    expect(usePlayerStore.getState().queue).toEqual([])
  })

  it('retries one transient provider failure while preparing a track', async () => {
    const remoteTrack = {
      key: 'youtube:remote-track', track_id: null, source: 'youtube' as const, capability: 'acquire' as const, availability: 'remote' as const,
      title: 'Remote Track', artist: 'Artist', album: null, year: null, duration_ms: 180000,
      cover_url: null, source_id: 'remote-track', external_url: null,
    }
    vi.mocked(api.tracks.search).mockResolvedValue({ query: 'remote', data: [remoteTrack], providers: { youtube: { status: 'ok', cached: false } } })
    vi.mocked(api.tracks.acquire)
      .mockRejectedValueOnce(Object.assign(new Error('provider_unavailable'), { status: 503 }))
      .mockResolvedValueOnce({ status: 'ready', track_id: 43 })
    usePlayerStore.setState({
      queue: [],
      config: { instance_name: 'Fuze', setup_required: false, auth: { mode: 'password', registration: true }, features: { playback: true }, providers: { youtube: true, yandex: false, spotify: false } },
    })
    const onTrackReady = vi.fn()

    render(<SearchModal isOpen destination="playlist" onTrackReady={onTrackReady} onClose={() => undefined} />)
    fireEvent.change(screen.getByLabelText('Search query'), { target: { value: 'remote' } })
    fireEvent.click(await screen.findByRole('button', { name: 'Add Remote Track to playlist' }))

    await waitFor(() => expect(api.tracks.acquire).toHaveBeenCalledTimes(2), { timeout: 2500 })
    await waitFor(() => expect(onTrackReady).toHaveBeenCalledWith(expect.objectContaining({ track_id: 43, availability: 'ready' })))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})
