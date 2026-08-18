'use client'

import { usePlayerStore } from '@/lib/store'
import { useRef, useCallback, useState } from 'react'
import { audioContext } from './Player'

function formatTime(seconds: number): string {
  if (!seconds || !isFinite(seconds)) return '0:00'
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

export function ProgressBar() {
  const currentTime = usePlayerStore((s) => s.currentTime)
  const duration = usePlayerStore((s) => s.duration)
  const trackRef = useRef<HTMLDivElement>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [dragTime, setDragTime] = useState(0)

  const displayTime = isDragging ? dragTime : currentTime
  const progress = duration > 0 ? (displayTime / duration) * 100 : 0

  const getTimeFromClientX = useCallback(
    (clientX: number) => {
      if (!trackRef.current || !duration) return 0
      const rect = trackRef.current.getBoundingClientRect()
      const x = clientX - rect.left
      const percent = Math.max(0, Math.min(1, x / rect.width))
      return percent * duration
    },
    [duration]
  )

  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!duration) return
      event.currentTarget.setPointerCapture(event.pointerId)
      const time = getTimeFromClientX(event.clientX)
      setIsDragging(true)
      setDragTime(time)
      audioContext.isDragging = true
    },
    [duration, getTimeFromClientX]
  )

  const handlePointerMove = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging) return
    setDragTime(getTimeFromClientX(event.clientX))
  }, [getTimeFromClientX, isDragging])

  const handlePointerUp = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging) return
    const time = getTimeFromClientX(event.clientX)
    setIsDragging(false)
    audioContext.isDragging = false
    if (audioContext.current) audioContext.current.currentTime = time
    usePlayerStore.getState().setCurrentTime(time)
    event.currentTarget.releasePointerCapture(event.pointerId)
  }, [getTimeFromClientX, isDragging])

  return (
    <div className="w-full">
      <div
        ref={trackRef}
        className="relative w-full h-6 cursor-pointer touch-none flex items-center group"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={() => { setIsDragging(false); audioContext.isDragging = false }}
        role="slider"
        tabIndex={duration ? 0 : -1}
        aria-label="Playback position"
        aria-valuemin={0}
        aria-valuemax={Math.floor(duration)}
        aria-valuenow={Math.floor(displayTime)}
        onKeyDown={(event) => {
          if (!audioContext.current || !duration || !['ArrowLeft', 'ArrowRight'].includes(event.key)) return
          event.preventDefault()
          const delta = event.key === 'ArrowRight' ? 5 : -5
          audioContext.current.currentTime = Math.max(0, Math.min(duration, audioContext.current.currentTime + delta))
        }}
      >
        <div className="w-full h-1 rounded-full bg-hover-strong overflow-hidden">
          <div
            className="h-full bg-text-primary rounded-full"
            style={{ width: `${progress}%` }}
          />
        </div>
        <div
          className="absolute w-3 h-3 rounded-full bg-text-primary opacity-0 group-hover:opacity-100 transition-opacity shadow-sm"
          style={{ left: `calc(${progress}% - 6px)` }}
        />
      </div>
      <div className="flex justify-between -mt-1">
        <span className="text-[11px] font-mono text-text-muted">
          {formatTime(displayTime)}
        </span>
        <span className="text-[11px] font-mono text-text-muted">
          {formatTime(duration)}
        </span>
      </div>
    </div>
  )
}
