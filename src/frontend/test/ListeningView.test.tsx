import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ListeningView } from '@/components/player/ListeningView'
import { usePlayerStore } from '@/lib/store'
import type { TrackSearchResult } from '@/lib/types'

const track: TrackSearchResult = { key: 'track:1', track_id: 1, source: 'youtube', capability: 'acquire', availability: 'ready', title: 'A Very Long Real Track Title That Must Stay On One Line Without Breaking The Listening Geometry', artist: 'Real Artist', album: 'Real Album', year: 2026, duration_ms: 183000, cover_url: null, source_id: 'one', external_url: null }

vi.mock('@/lib/api', () => ({ api: {
  auth: { me: vi.fn().mockResolvedValue({ id: 1, name: 'Ada', email: null, role: 'user', is_active: true }) },
  config: vi.fn().mockResolvedValue({ instance_name: 'Fuze', setup_required: false, auth: { mode: 'password', registration: true }, features: { playback: true }, providers: { youtube: true, yandex: false, spotify: false } }),
  playlists: {
    list: vi.fn().mockResolvedValue([{ id: 7, owner_id: 1, title: 'Real Playlist', description: null, tracks_count: 1, created_at: '2026-01-01', updated_at: '2026-01-01' }]),
    get: vi.fn().mockResolvedValue({ id: 7, owner_id: 1, title: 'Real Playlist', description: null, tracks_count: 1, created_at: '2026-01-01', updated_at: '2026-01-01', items: [{ id: 9, position: 0, track: { id: 1, title: 'A Very Long Real Track Title That Must Stay On One Line Without Breaking The Listening Geometry', artist: 'Real Artist', album: 'Real Album', release_year: 2026, duration_ms: 183000, cover_url: null, source: 'youtube', source_id: 'one', download_status: 'ready', download_attempts: 1 } }] }),
  },
} }))

afterEach(cleanup)
beforeEach(() => { localStorage.clear(); usePlayerStore.setState({ queue: [track], currentTrack: track, queueMode: 'manual', isPlaying: false, currentTime: 30, duration: 183, volume: .7, isMuted: false, hydrated: true, user: null, config: null }) })

describe('production listening view', () => {
  it('renders real track and playlist state, missing artwork, and playback controls', async () => {
    render(<MemoryRouter><ListeningView /></MemoryRouter>)
    expect(await screen.findByRole('heading', { name: track.title })).toBeInTheDocument()
    expect(screen.getAllByLabelText('Artwork unavailable')).toHaveLength(2)
    expect(await screen.findByRole('button', { name: 'Play playlist Real Playlist' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Play' }))
    expect(usePlayerStore.getState().isPlaying).toBe(true)
    expect(screen.getByRole('slider', { name: 'Playback position' })).toHaveAttribute('aria-valuenow', '30')
    expect(screen.getByRole('slider', { name: 'Volume' })).toHaveAttribute('aria-valuenow', '70')
  })

  it('loads real playlist tracks through cassette interaction', async () => {
    render(<MemoryRouter><ListeningView /></MemoryRouter>)
    fireEvent.click(await screen.findByRole('button', { name: 'Play playlist Real Playlist' }))
    await waitFor(() => expect(usePlayerStore.getState().queueMode).toBe('playlist'))
    expect(screen.getAllByText('Real Playlist')).toHaveLength(2)
  })

  it('seeks relative to the visible progress track', async () => {
    render(<MemoryRouter><ListeningView /></MemoryRouter>)
    const slider = await screen.findByRole('slider', { name: 'Playback position' })
    const trackElement = slider.querySelector('span') as HTMLSpanElement
    vi.spyOn(trackElement, 'getBoundingClientRect').mockReturnValue({ left: 100, right: 500, top: 0, bottom: 3, width: 400, height: 3, x: 100, y: 0, toJSON: () => ({}) })
    slider.setPointerCapture = vi.fn()

    fireEvent.pointerDown(slider, { clientX: 300, pointerId: 1 })

    expect(usePlayerStore.getState().currentTime).toBe(91.5)
  })

  it('changes volume continuously while dragging', async () => {
    render(<MemoryRouter><ListeningView /></MemoryRouter>)
    const slider = await screen.findByRole('slider', { name: 'Volume' })
    vi.spyOn(slider, 'getBoundingClientRect').mockReturnValue({ left: 20, right: 120, top: 0, bottom: 20, width: 100, height: 20, x: 20, y: 0, toJSON: () => ({}) })
    slider.setPointerCapture = vi.fn()

    fireEvent.pointerDown(slider, { clientX: 40, pointerId: 2 })
    fireEvent.pointerMove(slider, { clientX: 90, pointerId: 2 })

    expect(usePlayerStore.getState().volume).toBe(.7)
  })
})
