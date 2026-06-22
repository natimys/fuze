'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { api } from '@/lib/api'
import { usePlayerStore } from '@/lib/store'
import type { TrackSearchResult } from '@/lib/types'
import {
  MagnifyingGlass,
  Plus,
  Play,
  Spinner,
  X,
  ArrowDown,
  Check,
} from '@phosphor-icons/react'

interface SearchModalProps {
  isOpen: boolean
  onClose: () => void
}

export function SearchModal({ isOpen, onClose }: SearchModalProps) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<TrackSearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [downloadingId, setDownloadingId] = useState<number | null>(null)
  const addToQueue = usePlayerStore((s) => s.addToQueue)
  const setCurrentTrack = usePlayerStore((s) => s.setCurrentTrack)
  const setIsPlaying = usePlayerStore((s) => s.setIsPlaying)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!isOpen) {
      setQuery('')
      setResults([])
      setDownloadingId(null)
    }
  }, [isOpen])

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus()
    }
  }, [isOpen])

  const search = useCallback(async (q: string) => {
    if (!q.trim()) {
      setResults([])
      return
    }

    setLoading(true)
    try {
      const res = await api.tracks.search(q)
      setResults(res.data)
    } catch {
      setResults([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const timer = setTimeout(() => {
      search(query)
    }, 300)
    return () => clearTimeout(timer)
  }, [query, search])

  async function handlePlay(track: TrackSearchResult) {
    if (downloadingId === track.id) return

    setDownloadingId(track.id)
    try {
      if (!track.already_downloaded) {
        await api.tracks.download(track.id)
      }
      addToQueue(track)
      setCurrentTrack(track)
      setIsPlaying(true)
    } catch {
      // Handle error
    } finally {
      setDownloadingId(null)
    }
  }

  function handleAddToQueue(track: TrackSearchResult) {
    addToQueue(track)
  }

  function formatDuration(ms: number | null): string {
    if (!ms) return '--:--'
    const totalSec = Math.floor(ms / 1000)
    const m = Math.floor(totalSec / 60)
    const s = totalSec % 60
    return `${m}:${String(s).padStart(2, '0')}`
  }

  function getTrackState(track: TrackSearchResult) {
    if (downloadingId === track.id) return 'downloading'
    if (track.already_downloaded) return 'ready'
    return 'remote'
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-50 bg-black/60"
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.98, y: -10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98, y: -10 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="fixed top-[20%] left-1/2 -translate-x-1/2 z-50 w-full max-w-[560px] mx-4"
          >
            <div className="bg-surface rounded-xl border border-border shadow-2xl overflow-hidden">
              <div className="flex items-center gap-3 px-4 h-14 border-b border-border">
                <MagnifyingGlass size={18} className="text-text-muted flex-shrink-0" />
                <input
                  ref={inputRef}
                  type="text"
                  placeholder="Search for music..."
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') onClose()
                  }}
                  className="flex-1 bg-transparent text-sm text-text-primary placeholder:text-text-muted outline-none"
                />
                {query && (
                  <button
                    onClick={() => setQuery('')}
                    className="p-1 rounded-md text-text-muted hover:text-text-primary hover:bg-hover transition-colors"
                  >
                    <X size={16} />
                  </button>
                )}
                <kbd className="text-[10px] text-text-muted bg-surface-raised px-1.5 py-0.5 rounded border border-border">
                  ESC
                </kbd>
              </div>

              <div className="max-h-[400px] overflow-y-auto">
                {loading ? (
                  <div className="flex items-center justify-center py-12">
                    <Spinner size={24} className="text-text-muted animate-spin" />
                  </div>
                ) : results.length > 0 ? (
                  <div className="py-2 pr-2">
                    {results.map((track) => {
                      const state = getTrackState(track)
                      return (
                        <button
                          key={track.id}
                          onClick={() => handlePlay(track)}
                          disabled={state === 'downloading'}
                          className="w-full flex items-center gap-3 pl-4 pr-3 py-2.5 hover:bg-hover rounded-lg transition-colors text-left group disabled:opacity-60"
                        >
                          <div className="w-10 h-10 rounded-md bg-surface-raised flex-shrink-0 overflow-hidden flex items-center justify-center relative">
                            {track.cover_url ? (
                              <img
                                src={track.cover_url}
                                alt={track.title}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <span className="text-xs text-text-muted">♪</span>
                            )}
                            {state === 'downloading' && (
                              <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                                <Spinner size={16} className="text-white animate-spin" />
                              </div>
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium text-text-primary truncate">
                              {track.title}
                            </div>
                            <div className="text-xs text-text-muted truncate">
                              {track.artist}
                            </div>
                          </div>
                          <span className="w-12 text-right text-xs text-text-muted font-mono flex-shrink-0 tabular-nums">
                            {formatDuration(track.duration_ms)}
                          </span>
                          <div className="flex items-center gap-1.5 flex-shrink-0">
                            {state === 'downloading' ? (
                              <span className="p-1.5 rounded-full bg-surface-raised text-text-secondary">
                                <ArrowDown size={12} className="animate-bounce" />
                              </span>
                            ) : state === 'ready' ? (
                              <>
                                <span className="p-1.5 rounded-full bg-surface-raised text-green-400">
                                  <Check size={12} />
                                </span>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    handleAddToQueue(track)
                                  }}
                                  className="p-1.5 rounded-full bg-surface-raised text-text-secondary hover:bg-hover-strong transition-colors opacity-0 group-hover:opacity-100"
                                  title="Add to queue"
                                >
                                  <Plus size={12} />
                                </button>
                              </>
                            ) : (
                              <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1.5">
                                <span className="p-1.5 rounded-full bg-accent text-bg">
                                  <Play size={12} weight="fill" />
                                </span>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    handleAddToQueue(track)
                                  }}
                                  className="p-1.5 rounded-full bg-surface-raised text-text-secondary hover:bg-hover-strong transition-colors"
                                  title="Add to queue"
                                >
                                  <Plus size={12} />
                                </button>
                              </div>
                            )}
                          </div>
                        </button>
                      )
                    })}
                  </div>
                ) : query ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <MagnifyingGlass size={32} className="text-text-muted mb-3 opacity-30" />
                    <p className="text-sm text-text-muted">No results found</p>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <p className="text-sm text-text-muted">Type to search for music</p>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
