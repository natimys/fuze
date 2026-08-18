import { create } from 'zustand'
import type { TrackSearchResult, UserPublic } from './types'

interface Store {
  queue: TrackSearchResult[]; currentTrack: TrackSearchResult | null; isPlaying: boolean
  currentTime: number; duration: number; volume: number; isMuted: boolean
  isShuffled: boolean; isRepeating: boolean; isLoading: boolean; playbackError: string | null
  user: UserPublic | null; hydrated: boolean
  setQueue: (v: TrackSearchResult[]) => void; addToQueue: (v: TrackSearchResult) => void
  removeFromQueue: (key: string) => void; setCurrentTrack: (v: TrackSearchResult | null) => void
  setIsPlaying: (v: boolean) => void; togglePlay: () => void; setCurrentTime: (v: number) => void
  setDuration: (v: number) => void; setVolume: (v: number) => void; toggleMute: () => void
  toggleShuffle: () => void; toggleRepeat: () => void; setIsLoading: (v: boolean) => void
  setPlaybackError: (v: string | null) => void; setUser: (v: UserPublic | null) => void
  hydrate: () => void; playNext: () => void; playPrev: () => void
}

const canQueue = (track: TrackSearchResult) => track.capability === 'acquire' && track.track_id !== null && track.availability === 'ready'

export const usePlayerStore = create<Store>((set, get) => ({
  queue: [], currentTrack: null, isPlaying: false, currentTime: 0, duration: 0, volume: 0.7,
  isMuted: false, isShuffled: false, isRepeating: false, isLoading: false, playbackError: null,
  user: null, hydrated: false,
  setQueue: (queue) => set({ queue }),
  addToQueue: (track) => set((state) => canQueue(track) && !state.queue.some((item) => item.key === track.key) ? { queue: [...state.queue, track] } : state),
  removeFromQueue: (key) => set((state) => {
    const index = state.queue.findIndex((item) => item.key === key)
    const queue = state.queue.filter((item) => item.key !== key)
    if (state.currentTrack?.key !== key) return { queue }
    const replacement = queue[index] ?? queue[index - 1] ?? null
    return { queue, currentTrack: replacement, isPlaying: false, currentTime: 0, duration: 0, playbackError: null }
  }),
  setCurrentTrack: (currentTrack) => set({ currentTrack, isPlaying: false, currentTime: 0, duration: 0, playbackError: null }),
  setIsPlaying: (isPlaying) => set({ isPlaying }),
  togglePlay: () => set((state) => state.currentTrack ? { isPlaying: !state.isPlaying } : state),
  setCurrentTime: (currentTime) => set({ currentTime }), setDuration: (duration) => set({ duration }),
  setVolume: (volume) => set({ volume: Math.max(0, Math.min(1, volume)), isMuted: volume === 0 }),
  toggleMute: () => set((state) => ({ isMuted: !state.isMuted })),
  toggleShuffle: () => set((state) => ({ isShuffled: !state.isShuffled })),
  toggleRepeat: () => set((state) => ({ isRepeating: !state.isRepeating })),
  setIsLoading: (isLoading) => set({ isLoading }), setPlaybackError: (playbackError) => set({ playbackError }),
  setUser: (user) => set({ user }),
  hydrate: () => {
    if (typeof window === 'undefined' || get().hydrated) return
    try {
      const raw = localStorage.getItem('fuze-player')
      if (raw) {
        const value = JSON.parse(raw) as { queue?: TrackSearchResult[]; volume?: number }
        set({ queue: Array.isArray(value.queue) ? value.queue.filter(canQueue) : [], volume: typeof value.volume === 'number' ? Math.max(0, Math.min(1, value.volume)) : 0.7, hydrated: true })
        return
      }
    } catch { localStorage.removeItem('fuze-player') }
    set({ hydrated: true })
  },
  playNext: () => set((state) => {
    if (!state.currentTrack || state.queue.length === 0) return state
    const index = state.queue.findIndex((item) => item.key === state.currentTrack?.key)
    if (state.isShuffled && state.queue.length > 1) {
      let next = Math.floor(Math.random() * state.queue.length)
      if (next === index) next = (next + 1) % state.queue.length
      return { currentTrack: state.queue[next], currentTime: 0, duration: 0, isPlaying: false, playbackError: null }
    }
    if (index < 0 || index >= state.queue.length - 1) return { isPlaying: false }
    return { currentTrack: state.queue[index + 1], currentTime: 0, duration: 0, isPlaying: false, playbackError: null }
  }),
  playPrev: () => set((state) => {
    if (!state.currentTrack) return state
    if (state.currentTime > 3) return { currentTime: 0 }
    const index = state.queue.findIndex((item) => item.key === state.currentTrack?.key)
    if (index <= 0) return { currentTime: 0 }
    return { currentTrack: state.queue[index - 1], currentTime: 0, duration: 0, isPlaying: false, playbackError: null }
  }),
}))

if (typeof window !== 'undefined') {
  let persisted = ''
  usePlayerStore.subscribe((state) => {
    if (!state.hydrated) return
    const next = JSON.stringify({ queue: state.queue, volume: state.volume })
    if (next !== persisted) { persisted = next; localStorage.setItem('fuze-player', next) }
  })
}
