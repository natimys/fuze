import { beforeEach, describe, expect, it, vi } from 'vitest'
import { usePlayerStore } from '@/lib/store'
import type { TrackSearchResult } from '@/lib/types'

const track = (id: number): TrackSearchResult => ({
  key: `youtube:${id}`,
  track_id: id,
  source: 'youtube',
  capability: 'acquire',
  availability: 'ready',
  title: `Track ${id}`,
  artist: 'Artist',
  album: null,
  year: null,
  duration_ms: 180_000,
  cover_url: null,
  source_id: String(id),
  external_url: null,
})

describe('player queue', () => {
  beforeEach(() => {
    localStorage.clear()
    usePlayerStore.setState({ queue: [], currentTrack: null, currentTime: 0, duration: 0, isPlaying: false, hydrated: true })
  })

  it('keeps only one copy of a ready persisted track', () => {
    const value = track(1)
    usePlayerStore.getState().addToQueue(value)
    usePlayerStore.getState().addToQueue(value)
    expect(usePlayerStore.getState().queue).toEqual([value])
  })

  it('keeps pending tracks in playlist mode and updates their status', () => {
    const pending = { ...track(1), availability: 'queued' as const }
    usePlayerStore.getState().setQueue([pending], 'playlist')
    usePlayerStore.getState().setCurrentTrack(pending)
    usePlayerStore.getState().updateQueueTrack(pending.key, { availability: 'downloading' })

    expect(usePlayerStore.getState().queueMode).toBe('playlist')
    expect(usePlayerStore.getState().queue[0].availability).toBe('downloading')
    expect(usePlayerStore.getState().currentTrack?.availability).toBe('downloading')
  })

  it('selects the next track when the active item is removed', () => {
    const first = track(1)
    const second = track(2)
    usePlayerStore.setState({ queue: [first, second], currentTrack: first, isPlaying: true })
    usePlayerStore.getState().removeFromQueue(first.key)
    expect(usePlayerStore.getState().currentTrack).toEqual(second)
    expect(usePlayerStore.getState().isPlaying).toBe(false)
  })

  it('reorders queue tracks and places a chosen track next', () => {
    const tracks = [track(1), track(2), track(3)]
    usePlayerStore.setState({ queue: tracks, currentTrack: tracks[0], isShuffled: true })
    usePlayerStore.getState().reorderQueue(2, 1)
    expect(usePlayerStore.getState().queue.map((item) => item.track_id)).toEqual([1, 3, 2])
    expect(usePlayerStore.getState().isShuffled).toBe(false)
    usePlayerStore.getState().playNextTrack(track(4))
    expect(usePlayerStore.getState().queue.map((item) => item.track_id)).toEqual([1, 4, 3, 2])
  })

  it('materializes the shuffled playback order in the queue', () => {
    const tracks = [track(1), track(2), track(3), track(4)]
    usePlayerStore.setState({ queue: tracks, currentTrack: tracks[1], isShuffled: false })
    vi.spyOn(Math, 'random').mockReturnValue(0)
    usePlayerStore.getState().toggleShuffle()
    expect(usePlayerStore.getState().queue.map((item) => item.track_id)).toEqual([2, 3, 4, 1])
    expect(usePlayerStore.getState().currentTrack).toEqual(tracks[1])
    usePlayerStore.getState().playNext()
    expect(usePlayerStore.getState().currentTrack?.track_id).toBe(3)
  })
})
