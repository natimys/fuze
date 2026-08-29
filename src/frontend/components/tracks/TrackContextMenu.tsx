import { useCallback, useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react'
import { Eye, ListPlus, MusicNote, Playlist, Queue } from '@phosphor-icons/react'
import { api } from '@/lib/api'
import { usePlayerStore } from '@/lib/store'
import type { PlaylistSummary, TrackSearchResult } from '@/lib/types'
import './track-context-menu.css'

type MenuState = { tracks: TrackSearchResult[]; x: number; y: number } | null

export function TrackPreview({ track }: { track: TrackSearchResult }) {
  return <span className="track-preview">{track.cover_url ? <img src={track.cover_url} alt="" /> : <span className="track-preview__art"><MusicNote /></span>}<span><b>{track.title}</b><small>{track.artist}</small><small>{track.album ?? track.source}</small></span></span>
}

export function useTrackContextMenu() {
  const [menu, setMenu] = useState<MenuState>(null)
  return {
    menu,
    closeMenu: useCallback(() => setMenu(null), []),
    openMenu: (event: ReactMouseEvent, track: TrackSearchResult, selected: TrackSearchResult[] = []) => {
      event.preventDefault(); event.stopPropagation()
      setMenu({ tracks: selected.some((item) => item.key === track.key) ? selected : [track], x: event.clientX, y: event.clientY })
    },
  }
}

export function TrackContextMenu({ menu, onClose, onShowInPlaylist }: { menu: MenuState; onClose: () => void; onShowInPlaylist?: (track: TrackSearchResult) => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const addToQueue = usePlayerStore((state) => state.addToQueue)
  const playNextTrack = usePlayerStore((state) => state.playNextTrack)
  const [playlists, setPlaylists] = useState<PlaylistSummary[]>([])
  const [showPlaylists, setShowPlaylists] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [toast, setToast] = useState<{ text: string; undo?: () => void | Promise<void> } | null>(null)

  useEffect(() => {
    if (!menu) return
    setShowPlaylists(false); setMessage(null)
    const close = (event: PointerEvent) => { if (!ref.current?.contains(event.target as Node)) onClose() }
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { onClose(); return }
      const buttons = [...(ref.current?.querySelectorAll<HTMLButtonElement>('button:not([disabled])') ?? [])]
      if (!buttons.length || !['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
      event.preventDefault(); const current = buttons.indexOf(document.activeElement as HTMLButtonElement)
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (current + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length
      buttons[next]?.focus()
    }
    window.addEventListener('pointerdown', close); window.addEventListener('keydown', key)
    requestAnimationFrame(() => ref.current?.querySelector<HTMLButtonElement>('button:not([disabled])')?.focus())
    return () => { window.removeEventListener('pointerdown', close); window.removeEventListener('keydown', key) }
  }, [menu, onClose])

  const notify = (text: string, undo?: () => void | Promise<void>) => { setToast({ text, undo }); window.setTimeout(() => setToast(null), 4500) }
  if (!menu) return toast ? <div className="track-toast" role="status"><span>{toast.text}</span>{toast.undo && <button onClick={() => { void toast.undo?.(); setToast(null) }}>Отменить</button>}</div> : null
  const tracks = menu.tracks
  const track = tracks[0]
  const left = Math.min(menu.x, window.innerWidth - 244)
  const top = Math.min(menu.y, window.innerHeight - (showPlaylists ? 330 : 164))
  const canUse = track.capability === 'acquire'
  const resolveTrack = async (value: TrackSearchResult) => {
    if (value.track_id) return value
    const acquired = await api.tracks.acquire(value.source, value.source_id)
    return { ...value, track_id: acquired.track_id, availability: acquired.status }
  }
  const queueAction = async (next: boolean) => {
    setBusy(true); setMessage(null)
    try {
      const before = usePlayerStore.getState(); const resolved = await Promise.all(tracks.map(resolveTrack))
      const ordered = next ? [...resolved].reverse() : resolved
      ordered.forEach((value) => { if (next) playNextTrack(value); else addToQueue(value) }); onClose()
      notify(next ? `${resolved.length} трек(а) поставлено следующими` : `${resolved.length} трек(а) добавлено в очередь`, () => before.setQueue(before.queue, before.queueMode))
    }
    catch (reason) { setMessage(reason instanceof Error ? reason.message : 'Не удалось подготовить трек') }
    finally { setBusy(false) }
  }

  const loadPlaylists = async () => {
    setShowPlaylists(true); setMessage(null)
    if (playlists.length) return
    try { setPlaylists(await api.playlists.list()) }
    catch { setMessage('Не удалось загрузить плейлисты') }
  }
  const addToPlaylist = async (playlistId: number) => {
    setBusy(true); setMessage(null)
    try {
      const resolved = await Promise.all(tracks.map(resolveTrack)); const added = await Promise.all(resolved.map((value) => api.playlists.addItem(playlistId, value.track_id!))); onClose()
      notify(`${added.length} трек(а) добавлено в плейлист`, async () => { await Promise.all(added.map((item) => api.playlists.removeItem(playlistId, item.id))) })
    }
    catch (reason) { setMessage(reason instanceof Error ? reason.message : 'Не удалось добавить трек') }
    finally { setBusy(false) }
  }

  return <><div ref={ref} className="track-menu" role="menu" style={{ left, top }} aria-label={`Действия с ${tracks.length > 1 ? `${tracks.length} треками` : track.title}`}>
    <button role="menuitem" disabled={!canUse || busy} onClick={() => void queueAction(false)}><ListPlus />Добавить в очередь</button>
    <button role="menuitem" disabled={!canUse || busy} onClick={() => void queueAction(true)}><Queue />Играть следующим</button>
    {onShowInPlaylist && <button role="menuitem" onClick={() => { onShowInPlaylist(track); onClose() }}><Eye />Показать в плейлисте</button>}
    <div className="track-menu__separator" />
    <button role="menuitem" disabled={!canUse} onClick={() => void loadPlaylists()}><Playlist />Добавить в плейлист<span>›</span></button>
    {showPlaylists && <div className="track-menu__playlists" role="group" aria-label="Плейлисты">
      {playlists.map((playlist) => <button key={playlist.id} disabled={busy} onClick={() => void addToPlaylist(playlist.id)}>{playlist.title}<small>{playlist.tracks_count}</small></button>)}
      {!playlists.length && !message && <small className="track-menu__empty">Загрузка…</small>}
      {message && <small className="track-menu__error">{message}</small>}
    </div>}
  </div>{toast && <div className="track-toast" role="status"><span>{toast.text}</span>{toast.undo && <button onClick={() => { void toast.undo?.(); setToast(null) }}>Отменить</button>}</div>}</>
}
