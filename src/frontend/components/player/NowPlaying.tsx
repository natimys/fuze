'use client'

import { usePlayerStore } from '@/lib/store'
import { motion, AnimatePresence } from 'motion/react'
import { MusicNote, Spinner } from '@phosphor-icons/react'

export function NowPlaying() {
  const currentTrack = usePlayerStore((s) => s.currentTrack)
  const isLoading = usePlayerStore((s) => s.isLoading)

  return (
    <div className="flex flex-col items-center">
      <div className="w-full aspect-square rounded-xl bg-surface-raised overflow-hidden relative">
        <AnimatePresence mode="wait">
          {currentTrack?.cover_url ? (
            <motion.img
              key={currentTrack.id}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
              src={currentTrack.cover_url}
              alt={currentTrack.title}
              className="w-full h-full object-cover"
            />
          ) : (
            <motion.div
              key="placeholder"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="w-full h-full flex items-center justify-center"
            >
              <MusicNote size={48} weight="thin" className="text-text-muted opacity-20" />
            </motion.div>
          )}
        </AnimatePresence>

        {isLoading && (
          <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
            <Spinner size={32} className="text-text-primary animate-spin" />
          </div>
        )}
      </div>

      <div className="mt-6 text-center w-full">
        {currentTrack ? (
          <>
            <h2 className="text-lg font-semibold text-text-primary tracking-tight truncate">
              {currentTrack.title}
            </h2>
            <p className="text-sm text-text-muted mt-0.5 truncate">
              {currentTrack.artist}
            </p>
          </>
        ) : (
          <>
            <h2 className="text-lg font-semibold text-text-primary tracking-tight truncate">
              No track selected
            </h2>
            <p className="text-sm text-text-muted mt-0.5 truncate">
              Search for music to start playing
            </p>
          </>
        )}
      </div>
    </div>
  )
}
