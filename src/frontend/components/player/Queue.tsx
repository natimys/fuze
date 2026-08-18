'use client'

import { usePlayerStore } from '@/lib/store'
import { motion, AnimatePresence } from 'motion/react'
import { X, Play } from '@phosphor-icons/react'

function formatDuration(ms: number | null): string {
  if (!ms) return '--:--'
  const totalSec = Math.floor(ms / 1000)
  const m = Math.floor(totalSec / 60)
  const s = totalSec % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

export function Queue() {
  const queue = usePlayerStore((s) => s.queue)
  const currentTrack = usePlayerStore((s) => s.currentTrack)
  const setCurrentTrack = usePlayerStore((s) => s.setCurrentTrack)
  const setIsPlaying = usePlayerStore((s) => s.setIsPlaying)
  const removeFromQueue = usePlayerStore((s) => s.removeFromQueue)
  function handlePlayTrack(track: typeof queue[0]) {
    if (track.key === currentTrack?.key) { setIsPlaying(true); return }
    setCurrentTrack(track)
  }

  return (
    <div className="flex flex-col min-w-0">
      <div className="text-[11px] font-medium tracking-wider uppercase text-text-muted mb-3">
        Up Next
      </div>

      {queue.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <p className="text-sm text-text-muted">Queue is empty</p>
          <p className="text-xs text-text-muted mt-1">Add tracks from search</p>
        </div>
      ) : (
        <div className="flex flex-col gap-0.5 overflow-y-auto max-h-[400px]">
          <AnimatePresence mode="popLayout">
            {queue.map((track, i) => {
              const isActive = track.key === currentTrack?.key
              return (
                <motion.div
                  key={track.key}
                  layout
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.2 }}
                  className={`group flex items-center gap-2 px-2 py-1 rounded-lg transition-colors ${
                    isActive
                      ? 'bg-hover-strong'
                      : 'hover:bg-hover'
                  }`}
                >
                  <button type="button" onClick={() => handlePlayTrack(track)} className="flex flex-1 min-w-0 items-center gap-3 px-1 py-1 text-left rounded focus-visible:outline focus-visible:outline-2" aria-label={`Play ${track.title}`}>
                    <span className="w-5 text-[11px] font-mono text-text-muted text-center flex-shrink-0">
                    {isActive ? (
                      <Play size={10} weight="fill" className="text-text-primary inline" />
                    ) : (
                      i + 1
                    )}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-text-primary truncate">
                      {track.title}
                    </div>
                    <div className="text-xs text-text-muted truncate">
                      {track.artist}
                    </div>
                  </div>
                  <span className="text-xs font-mono text-text-muted">
                    {formatDuration(track.duration_ms)}
                  </span>
                  </button>
                  <button
                    onClick={() => {
                      removeFromQueue(track.key)
                    }}
                    className="opacity-60 group-hover:opacity-100 focus:opacity-100 p-2 rounded-md text-text-muted hover:text-text-primary hover:bg-hover transition-all flex-shrink-0"
                    aria-label={`Remove ${track.title} from queue`}
                  >
                    <X size={14} />
                  </button>
                </motion.div>
              )
            })}
          </AnimatePresence>
        </div>
      )}
    </div>
  )
}
