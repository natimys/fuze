'use client'

import { MusicNote } from '@phosphor-icons/react'
import { useLocation } from 'react-router-dom'
import { usePlayerStore } from '@/lib/store'
import { Controls } from './Controls'
import { ProgressBar } from './ProgressBar'
import { VolumeControl } from './VolumeControl'

export function MiniPlayer() {
  const { pathname } = useLocation()
  const track = usePlayerStore((state) => state.currentTrack)
  const playbackEnabled = usePlayerStore((state) => state.config?.features.playback)
  if (pathname === '/player' || !track || !playbackEnabled) return null

  return <aside aria-label="Mini player" className="fuze-mini">
    <ProgressBar />
    <div className="flex min-w-0 items-center gap-3">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-surface-raised">{track.cover_url ? <img src={track.cover_url} alt="" className="h-full w-full object-cover" /> : <MusicNote className="text-text-muted" />}</div>
      <div className="min-w-0 flex-1"><div className="truncate text-sm font-medium text-text-primary">{track.title}</div><div className="truncate text-xs text-text-muted">{track.artist}</div></div>
      <Controls compact />
      <div className="hidden sm:block"><VolumeControl /></div>
    </div>
  </aside>
}
