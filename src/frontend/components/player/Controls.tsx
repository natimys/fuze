'use client'

import { usePlayerStore } from '@/lib/store'
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Shuffle,
  Repeat,
} from '@phosphor-icons/react'

export function Controls() {
  const isPlaying = usePlayerStore((s) => s.isPlaying)
  const isShuffled = usePlayerStore((s) => s.isShuffled)
  const isRepeating = usePlayerStore((s) => s.isRepeating)
  const queue = usePlayerStore((s) => s.queue)
  const currentTrack = usePlayerStore((s) => s.currentTrack)
  const togglePlay = usePlayerStore((s) => s.togglePlay)
  const toggleShuffle = usePlayerStore((s) => s.toggleShuffle)
  const toggleRepeat = usePlayerStore((s) => s.toggleRepeat)
  const playNext = usePlayerStore((s) => s.playNext)
  const playPrev = usePlayerStore((s) => s.playPrev)

  const hasSingleTrack = queue.length <= 1
  const canGoNext = queue.length > 1 && currentTrack
  const canGoPrev = queue.length > 1 && currentTrack

  return (
    <div className="flex items-center gap-5">
      <button
        onClick={toggleShuffle}
        className={`p-1.5 rounded-md transition-colors ${
          isShuffled
            ? 'text-text-primary'
            : 'text-accent-dim hover:text-text-primary'
        }`}
        aria-label="Shuffle"
      >
        <Shuffle size={16} weight={isShuffled ? 'fill' : 'regular'} />
      </button>

      <button
        onClick={playPrev}
        disabled={!canGoPrev}
        className={`p-1.5 rounded-md transition-colors ${
          canGoPrev
            ? 'text-accent-dim hover:text-text-primary'
            : 'text-text-muted opacity-30 cursor-not-allowed'
        }`}
        aria-label="Previous"
      >
        <SkipBack size={18} weight="fill" />
      </button>

      <button
        onClick={togglePlay}
        className="w-10 h-10 rounded-full bg-hover-strong hover:bg-surface-hover text-text-primary flex items-center justify-center transition-colors active:scale-95"
        aria-label={isPlaying ? 'Pause' : 'Play'}
      >
        {isPlaying ? (
          <Pause size={18} weight="fill" />
        ) : (
          <Play size={18} weight="fill" className="ml-0.5" />
        )}
      </button>

      <button
        onClick={playNext}
        disabled={!canGoNext}
        className={`p-1.5 rounded-md transition-colors ${
          canGoNext
            ? 'text-accent-dim hover:text-text-primary'
            : 'text-text-muted opacity-30 cursor-not-allowed'
        }`}
        aria-label="Next"
      >
        <SkipForward size={18} weight="fill" />
      </button>

      <button
        onClick={toggleRepeat}
        className={`p-1.5 rounded-md transition-colors ${
          isRepeating
            ? 'text-text-primary'
            : 'text-accent-dim hover:text-text-primary'
        }`}
        aria-label="Repeat"
      >
        <Repeat size={16} weight={isRepeating ? 'fill' : 'regular'} />
      </button>
    </div>
  )
}
