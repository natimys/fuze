import { useEffect, useState } from 'react'
import { Minus, Square, X } from '@phosphor-icons/react'

export function DesktopTitlebar() {
  const [appWindow, setAppWindow] = useState<Awaited<ReturnType<typeof import('@tauri-apps/api/window')['getCurrentWindow']>> | null>(null)
  const [maximized, setMaximized] = useState(false)

  useEffect(() => {
    let unlisten: (() => void) | undefined
    let active = true

    void import('@tauri-apps/api/window').then(async ({ getCurrentWindow }) => {
      if (!active) return
      const currentWindow = getCurrentWindow()
      setAppWindow(currentWindow)
      const updateMaximized = () => void currentWindow.isMaximized().then(setMaximized)
      updateMaximized()
      unlisten = await currentWindow.onResized(updateMaximized)
    })

    return () => {
      active = false
      unlisten?.()
    }
  }, [])

  return (
    <header className="desktop-titlebar" data-tauri-drag-region onDoubleClick={(event) => {
      if (!(event.target as HTMLElement).closest('.desktop-titlebar__controls')) void appWindow?.toggleMaximize()
    }}>
      <div className="desktop-titlebar__identity" data-tauri-drag-region>
        <span className="desktop-titlebar__mark" aria-hidden="true" />
        <span data-tauri-drag-region>Fuze</span>
      </div>
      <div className="desktop-titlebar__controls">
        <button type="button" onClick={() => void appWindow?.minimize()} aria-label="Свернуть окно">
          <Minus size={14} weight="bold" />
        </button>
        <button type="button" onClick={() => void appWindow?.toggleMaximize()} aria-label={maximized ? 'Восстановить окно' : 'Развернуть окно'}>
          <span className={maximized ? 'desktop-titlebar__restore' : undefined}><Square size={12} /></span>
        </button>
        <button type="button" className="desktop-titlebar__close" onClick={() => void appWindow?.close()} aria-label="Закрыть окно">
          <X size={14} weight="bold" />
        </button>
      </div>
    </header>
  )
}
