'use client'

import { usePlayerStore } from '@/lib/store'
import { SpeakerSimpleHigh, SpeakerSimpleSlash } from '@phosphor-icons/react'
import { useRef, useCallback } from 'react'
import { audioContext } from './Player'

export function VolumeControl() {
  const volume = usePlayerStore((s) => s.volume)
  const isMuted = usePlayerStore((s) => s.isMuted)
  const setVolume = usePlayerStore((s) => s.setVolume)
  const toggleMute = usePlayerStore((s) => s.toggleMute)
  const trackRef = useRef<HTMLDivElement>(null)

  const displayVolume = isMuted ? 0 : volume

  const getVolumeFromEvent = useCallback(
    (e: MouseEvent | React.MouseEvent<HTMLDivElement>) => {
      if (!trackRef.current) return 0
      const rect = trackRef.current.getBoundingClientRect()
      const x = e.clientX - rect.left
      return Math.max(0, Math.min(1, x / rect.width))
    },
    []
  )

  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const vol = getVolumeFromEvent(e)
      setVolume(vol)
      if (audioContext.current) {
        audioContext.current.volume = vol
      }

      const handleMouseMove = (ev: MouseEvent) => {
        const vol = getVolumeFromEvent(ev)
        setVolume(vol)
        if (audioContext.current) {
          audioContext.current.volume = vol
        }
      }

      const handleMouseUp = () => {
        document.removeEventListener('mousemove', handleMouseMove)
        document.removeEventListener('mouseup', handleMouseUp)
      }

      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
    },
    [getVolumeFromEvent, setVolume]
  )

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={toggleMute}
        className={`p-1.5 rounded-md transition-colors ${
          isMuted
            ? 'text-text-muted'
            : 'text-accent-dim hover:text-text-primary'
        }`}
        aria-label={isMuted ? 'Unmute' : 'Mute'}
      >
        {isMuted ? (
          <SpeakerSimpleSlash size={16} weight="regular" />
        ) : (
          <SpeakerSimpleHigh size={16} weight="regular" />
        )}
      </button>

      <div
        ref={trackRef}
        className="relative w-20 h-5 cursor-pointer flex items-center group"
        onMouseDown={handleMouseDown}
      >
        <div className="w-full h-1 rounded-full bg-hover-strong overflow-hidden">
          <div
            className="h-full bg-text-primary rounded-full"
            style={{ width: `${displayVolume * 100}%` }}
          />
        </div>
        <div
          className="absolute w-2.5 h-2.5 rounded-full bg-text-primary opacity-0 group-hover:opacity-100 transition-opacity"
          style={{ left: `calc(${displayVolume * 100}% - 5px)` }}
        />
      </div>
    </div>
  )
}
