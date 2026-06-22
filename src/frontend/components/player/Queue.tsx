'use client'

import { useState } from 'react'
import { usePlayerStore } from '@/lib/store'
import { api } from '@/lib/api'
import { motion, AnimatePresence } from 'motion/react'
import { X, Play, Spinner, ArrowDown } from '@phosphor-icons/react'

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
  const [downloadingId, setDownloadingId] = useState<number | null>(null)

  async function handlePlayTrack(track: typeof queue[0]) {
    if (downloadingId === track.id) return

    setDownloadingId(track.id)
    try {
      if (!track.already_downloaded) {
        await api.tracks.download(track.id)
      }
      setCurrentTrack(track)
      setIsPlaying(true)
    } catch {
      // Handle error
    } finally {
      setDownloadingId(null)
    }
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
              const isActive = track.id === currentTrack?.id
              const isDownloading = downloadingId === track.id
              return (
                <motion.div
                  key={track.id}
                  layout
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.2 }}
                  onClick={() => handlePlayTrack(track)}
                  className={`group flex items-center gap-3 px-3 py-2 rounded-lg transition-colors cursor-pointer ${
                    isActive
                      ? 'bg-hover-strong'
                      : 'hover:bg-hover'
                  }`}
                >
                  <span className="w-5 text-[11px] font-mono text-text-muted text-center flex-shrink-0">
                    {isDownloading ? (
                      <Spinner size={12} className="text-text-muted animate-spin inline" />
                    ) : isActive ? (
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
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      removeFromQueue(track.id)
                    }}
                    className="opacity-0 group-hover:opacity-100 p-1 rounded-md text-text-muted hover:text-text-primary hover:bg-hover transition-all flex-shrink-0"
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
