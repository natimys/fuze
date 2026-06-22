import { create } from 'zustand'
import type { TrackSearchResult, UserPublic } from './types'

interface PlayerState {
  queue: TrackSearchResult[]
  currentTrack: TrackSearchResult | null
  isPlaying: boolean
  currentTime: number
  duration: number
  volume: number
  isMuted: boolean
  isShuffled: boolean
  isRepeating: boolean
  isLoading: boolean
  user: UserPublic | null
}

interface PlayerActions {
  setQueue: (queue: TrackSearchResult[]) => void
  addToQueue: (track: TrackSearchResult) => void
  removeFromQueue: (trackId: number) => void
  setCurrentTrack: (track: TrackSearchResult | null) => void
  setIsPlaying: (isPlaying: boolean) => void
  togglePlay: () => void
  setCurrentTime: (time: number) => void
  setDuration: (duration: number) => void
  setVolume: (volume: number) => void
  toggleMute: () => void
  toggleShuffle: () => void
  toggleRepeat: () => void
  setIsLoading: (loading: boolean) => void
  setUser: (user: UserPublic | null) => void
  playNext: () => void
  playPrev: () => void
}

type Store = PlayerState & PlayerActions

export const usePlayerStore = create<Store>((set, get) => ({
  queue: [],
  currentTrack: null,
  isPlaying: false,
  currentTime: 0,
  duration: 0,
  volume: 0.7,
  isMuted: false,
  isShuffled: false,
  isRepeating: false,
  isLoading: false,
  user: null,

  setQueue: (queue) => set({ queue }),

  addToQueue: (track) => {
    const { queue } = get()
    const exists = queue.find((t) => t.id === track.id)
    if (!exists) {
      set({ queue: [...queue, track] })
    }
  },

  removeFromQueue: (trackId) => {
    const { queue } = get()
    set({ queue: queue.filter((t) => t.id !== trackId) })
  },

  setCurrentTrack: (track) => set({ currentTrack: track, currentTime: 0, duration: 0 }),

  setIsPlaying: (isPlaying) => set({ isPlaying }),

  togglePlay: () => set((state) => ({ isPlaying: !state.isPlaying })),

  setCurrentTime: (time) => set({ currentTime: time }),

  setDuration: (duration) => set({ duration }),

  setVolume: (volume) => set({ volume, isMuted: volume === 0 }),

  toggleMute: () => {
    const { isMuted, volume } = get()
    if (isMuted) {
      set({ isMuted: false, volume: volume || 0.7 })
    } else {
      set({ isMuted: true })
    }
  },

  toggleShuffle: () => set((state) => ({ isShuffled: !state.isShuffled })),

  toggleRepeat: () => set((state) => ({ isRepeating: !state.isRepeating })),

  setIsLoading: (loading) => set({ isLoading: loading }),

  setUser: (user) => set({ user }),

  playNext: () => {
    const { queue, currentTrack, isShuffled } = get()
    if (!currentTrack || queue.length <= 1) return

    const idx = queue.findIndex((t) => t.id === currentTrack.id)
    let nextIdx: number

    if (isShuffled) {
      nextIdx = Math.floor(Math.random() * queue.length)
      if (nextIdx === idx && queue.length > 1) {
        nextIdx = (nextIdx + 1) % queue.length
      }
    } else {
      nextIdx = (idx + 1) % queue.length
    }

    set({ currentTrack: queue[nextIdx], currentTime: 0, duration: 0 })
  },

  playPrev: () => {
    const { queue, currentTrack, currentTime } = get()
    if (!currentTrack || queue.length <= 1) return

    if (currentTime > 3) {
      set({ currentTime: 0 })
      return
    }

    const idx = queue.findIndex((t) => t.id === currentTrack.id)
    const prevIdx = idx <= 0 ? queue.length - 1 : idx - 1

    set({ currentTrack: queue[prevIdx], currentTime: 0, duration: 0 })
  },
}))
