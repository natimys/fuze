'use client'

import { ProgressBar } from './ProgressBar'
import { Controls } from './Controls'
import { VolumeControl } from './VolumeControl'

export function ControlStrip() {
  return (
    <div className="px-6 pb-5 pt-2 bg-surface flex flex-col gap-2">
      <ProgressBar />
      <div className="flex items-center justify-between">
        <div className="w-20" />
        <Controls />
        <VolumeControl />
      </div>
    </div>
  )
}
