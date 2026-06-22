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

  const getTimeFromEvent = useCallback(
    (e: MouseEvent | React.MouseEvent<HTMLDivElement>) => {
      if (!trackRef.current || !duration) return 0
      const rect = trackRef.current.getBoundingClientRect()
      const x = e.clientX - rect.left
      const percent = Math.max(0, Math.min(1, x / rect.width))
      return percent * duration
    },
    [duration]
  )

  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!duration) return
      const time = getTimeFromEvent(e)
      setIsDragging(true)
      setDragTime(time)
      audioContext.isDragging = true

      const handleMouseMove = (ev: MouseEvent) => {
        const time = getTimeFromEvent(ev)
        setDragTime(time)
      }

      const handleMouseUp = (ev: MouseEvent) => {
        setIsDragging(false)
        audioContext.isDragging = false
        const time = getTimeFromEvent(ev)
        if (audioContext.current) {
          audioContext.current.currentTime = time
        }
        document.removeEventListener('mousemove', handleMouseMove)
        document.removeEventListener('mouseup', handleMouseUp)
      }

      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
    },
    [duration, getTimeFromEvent]
  )

  return (
    <div className="w-full">
      <div
        ref={trackRef}
        className="relative w-full h-6 cursor-pointer flex items-center group"
        onMouseDown={handleMouseDown}
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
