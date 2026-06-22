'use client'

import { useState, useEffect, useRef } from 'react'
import { usePlayerStore } from '@/lib/store'
import { api } from '@/lib/api'
import { Sidebar } from '@/components/sidebar/Sidebar'
import { SearchModal } from '@/components/search/SearchModal'
import { NowPlaying } from './NowPlaying'
import { Queue } from './Queue'
import { ControlStrip } from './ControlStrip'
import {
  List,
  MagnifyingGlass,
  Command,
} from '@phosphor-icons/react'
import { motion } from 'motion/react'

export const audioContext = {
  current: null as HTMLAudioElement | null,
  isDragging: false,
}

export function Player() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const user = usePlayerStore((s) => s.user)
  const setUser = usePlayerStore((s) => s.setUser)
  const currentTrack = usePlayerStore((s) => s.currentTrack)
  const isPlaying = usePlayerStore((s) => s.isPlaying)
  const queue = usePlayerStore((s) => s.queue)
  const volume = usePlayerStore((s) => s.volume)
  const isMuted = usePlayerStore((s) => s.isMuted)
  const setIsPlaying = usePlayerStore((s) => s.setIsPlaying)
  const setCurrentTrack = usePlayerStore((s) => s.setCurrentTrack)
  const setCurrentTime = usePlayerStore((s) => s.setCurrentTime)
  const setDuration = usePlayerStore((s) => s.setDuration)
  const setVolume = usePlayerStore((s) => s.setVolume)
  const playNext = usePlayerStore((s) => s.playNext)
  const playPrev = usePlayerStore((s) => s.playPrev)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  useEffect(() => {
    api.auth.me().then(setUser).catch(() => {
      window.location.href = '/auth'
    })
  }, [setUser])

  useEffect(() => {
    const interval = setInterval(() => {
      api.auth.refresh()
    }, 10 * 60 * 1000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement
      const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable

      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setSearchOpen(true)
        return
      }

      if (isInput) return

      switch (e.key) {
        case ' ':
          e.preventDefault()
          if (currentTrack) {
            setIsPlaying(!isPlaying)
          }
          break
        case 'ArrowUp':
          e.preventDefault()
          setVolume(Math.min(1, volume + 0.05))
          if (audioContext.current) {
            audioContext.current.volume = Math.min(1, volume + 0.05)
          }
          break
        case 'ArrowDown':
          e.preventDefault()
          setVolume(Math.max(0, volume - 0.05))
          if (audioContext.current) {
            audioContext.current.volume = Math.max(0, volume - 0.05)
          }
          break
        case 'ArrowRight':
          e.preventDefault()
          if (queue.length > 1) {
            playNext()
          }
          break
        case 'ArrowLeft':
          e.preventDefault()
          if (queue.length > 1) {
            playPrev()
          }
          break
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [currentTrack, isPlaying, volume, queue.length, setIsPlaying, setVolume, playNext, playPrev])

  useEffect(() => {
    if (!audioRef.current) {
      const audio = new Audio()
      audioRef.current = audio
      audioContext.current = audio

      audio.addEventListener('timeupdate', () => {
        if (!audioContext.isDragging) {
          setCurrentTime(audio.currentTime)
        }
      })

      audio.addEventListener('loadedmetadata', () => {
        setDuration(audio.duration)
      })

      audio.addEventListener('ended', () => {
        setIsPlaying(false)
      })
    }
  }, [setCurrentTime, setDuration, setIsPlaying])

  useEffect(() => {
    const audio = audioRef.current
    if (!audio || !currentTrack) return

    let cancelled = false

    setIsPlaying(true)
    setCurrentTime(0)
    setDuration(0)

    api.tracks.stream(currentTrack.id).then((res) => {
      if (cancelled || !audio) return
      audio.src = res.url
      audio.load()
      audio.play().catch(() => {})
    })

    return () => {
      cancelled = true
    }
  }, [currentTrack, setIsPlaying, setCurrentTime, setDuration])

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return
    if (isPlaying) {
      audio.play().catch(() => {})
    } else {
      audio.pause()
    }
  }, [isPlaying])

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return
    audio.volume = isMuted ? 0 : volume
  }, [volume, isMuted])

  useEffect(() => {
    if (queue.length === 0 && currentTrack) {
      const audio = audioRef.current
      if (audio) {
        audio.pause()
        audio.currentTime = 0
      }
      setCurrentTrack(null)
      setIsPlaying(false)
      setCurrentTime(0)
      setDuration(0)
    }
  }, [queue.length, currentTrack, setCurrentTrack, setIsPlaying, setCurrentTime, setDuration])

  return (
    <div className="flex h-dvh bg-bg overflow-hidden">
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <SearchModal isOpen={searchOpen} onClose={() => setSearchOpen(false)} />

      <div className="flex-1 flex flex-col min-w-0">
        <header className="flex items-center gap-3 px-5 h-14 flex-shrink-0">
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-2 rounded-lg text-text-muted hover:text-text-primary hover:bg-hover transition-colors"
            aria-label="Menu"
          >
            <List size={18} weight="regular" />
          </button>

          <div className="flex-1" />

          <button
            onClick={() => setSearchOpen(true)}
            className="flex items-center gap-2 h-8 px-3 rounded-lg bg-surface hover:bg-surface-raised border border-border text-text-muted hover:text-text-secondary text-sm transition-colors"
          >
            <MagnifyingGlass size={14} />
            <span>Search</span>
            <kbd className="text-[10px] bg-surface-raised px-1.5 py-0.5 rounded border border-border ml-2">
              <Command size={10} className="inline" /> K
            </kbd>
          </button>

          {user && (
            <div className="flex items-center gap-2 ml-2">
              <div className="w-7 h-7 rounded-full bg-surface-raised flex items-center justify-center text-[11px] font-semibold text-text-secondary">
                {user.name[0]?.toUpperCase()}
              </div>
            </div>
          )}
        </header>

        <main className="flex-1 flex items-center justify-center px-8 py-4 overflow-hidden">
          <div className="w-full max-w-4xl grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-8 items-start">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            >
              <NowPlaying />
            </motion.div>

            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.5, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
            >
              <Queue />
            </motion.div>
          </div>
        </main>

        <ControlStrip />
      </div>
    </div>
  )
}
