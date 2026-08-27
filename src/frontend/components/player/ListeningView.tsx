import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'motion/react'
import { CaretRight, CheckCircle, DotsSixVertical, DotsThree, Gear, ImageSquare, List, MagnifyingGlass, MusicNote, PaintBrush, Palette, Pause, PencilSimple, Play, Queue as QueueIcon, Shuffle, SkipBack, SkipForward, SpeakerHigh, SpeakerSlash, SpinnerGap, SquaresFour, Trash, WarningCircle } from '@phosphor-icons/react'
import { SearchModal } from '@/components/search/SearchModal'
import { api } from '@/lib/api'
import { usePlayerStore } from '@/lib/store'
import type { PlaylistDetail, PlaylistSummary, PlaylistTrack, TrackRead, TrackSearchResult } from '@/lib/types'
import { audioContext } from './audioContext'
import './listening-view.css'
import { Dialog } from '@/components/ui/Dialog'
import { PlaylistImport } from '@/components/playlists/PlaylistImport'
import { FirstRunOnboarding, onboardingKey } from '@/components/onboarding/FirstRunOnboarding'
import { Sidebar } from '@/components/sidebar/Sidebar'
import { TrackContextMenu, TrackPreview, useTrackContextMenu } from '@/components/tracks/TrackContextMenu'

const ArtworkEditor = lazy(() => import('@/components/playlists/ArtworkEditor').then((module) => ({ default: module.ArtworkEditor })))

const tapeStyles = ['aged', 'archival', 'stripe', 'blue', 'yellow', 'minimal', 'redline', 'typed', 'white', 'green']
const tapeMarks = ['✶', '〰', '☼', '↗', '☺', '', '//', 'K', '♥', '→']

function playable(track: TrackRead): TrackSearchResult {
  return { key: `track:${track.id}`, track_id: track.id, source: track.source, capability: 'acquire', availability: track.download_status, title: track.title, artist: track.artist, album: track.album, year: track.release_year, duration_ms: track.duration_ms, cover_url: track.cover_url, source_id: track.source_id, external_url: null, error_code: track.download_error_code, error_message: track.download_error_message }
}

function formatTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds <= 0) return '0:00'
  return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`
}

function formatDuration(milliseconds: number | null) { return milliseconds ? formatTime(milliseconds / 1000) : '--:--' }

function Artwork({ url, title }: { url?: string | null; title?: string }) {
  return url ? <img className="lv-art-image" src={url} alt={title ? `${title} artwork` : ''} /> : <div className="lv-art-fallback" role="img" aria-label="Artwork unavailable"><i /><i /><MusicNote /></div>
}

function DownloadStatus({ track }: { track: TrackSearchResult }) {
  if (track.availability === 'ready') return <span className="lv-download-status ready" role="img" aria-label="Downloaded" title="Downloaded"><CheckCircle weight="fill" /></span>
  if (track.availability === 'failed') {
    const message = track.error_message ? `Download failed: ${track.error_message}` : 'Download failed'
    return <span className="lv-download-status failed" role="img" aria-label={message} title={message}><WarningCircle weight="fill" /></span>
  }
  return <span className="lv-download-status downloading" role="img" aria-label="Downloading" title="Downloading"><SpinnerGap /></span>
}

function CassetteSpine({ playlist, index, active, onClick, onContextMenu }: { playlist: PlaylistSummary; index: number; active: boolean; onClick: () => void; onContextMenu: (event: React.MouseEvent) => void }) {
  return <button className={`lv-spine ${playlist.label_style || tapeStyles[index % tapeStyles.length]} ${active ? 'active' : ''}`} onClick={onClick} onContextMenu={onContextMenu} aria-label={`Play playlist ${playlist.title}`}>
    <span className="lv-plastic"><i /><i /></span>
    <span className="lv-label">{playlist.label_art ? <img src={playlist.label_art} alt="" /> : <><em>{tapeMarks[index % tapeMarks.length]}</em><span><b>{playlist.title}</b><small>{playlist.description || `${playlist.tracks_count} ${playlist.tracks_count === 1 ? 'track' : 'tracks'}`}</small></span><code>{String(index + 1).padStart(2, '0')}</code></>}</span>
  </button>
}

export function ListeningView() {
  const navigate = useNavigate()
  const [authState, setAuthState] = useState<'checking' | 'ready' | 'denied'>('checking')
  const [playlists, setPlaylists] = useState<PlaylistSummary[]>([])
  const [playlistsLoading, setPlaylistsLoading] = useState(true)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [selectedPlaylist, setSelectedPlaylist] = useState<PlaylistDetail | null>(null)
  const [searchOpen, setSearchOpen] = useState(false)
  const [navigationOpen, setNavigationOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [onboardingOpen, setOnboardingOpen] = useState(false)
  const [cassetteMenu, setCassetteMenu] = useState<{ playlist: PlaylistSummary; x: number; y: number } | null>(null)
  const [queueMenu, setQueueMenu] = useState<{ x: number; y: number } | null>(null)
  const [clearQueueOpen, setClearQueueOpen] = useState(false)
  const [artEditor, setArtEditor] = useState<{ playlist: PlaylistSummary; kind: 'label' | 'cover' } | null>(null)
  const progressRef = useRef<HTMLDivElement>(null)
  const progressTrackRef = useRef<HTMLSpanElement>(null)
  const volumeRef = useRef<HTMLDivElement>(null)
  const seekingRef = useRef(false)
  const changingVolumeRef = useRef(false)
  const [draggingKey, setDraggingKey] = useState<string | null>(null)
  const [dragTargetKey, setDragTargetKey] = useState<string | null>(null)
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set())
  const selectionAnchor = useRef<number | null>(null)
  const swipeStart = useRef<{ key: string; x: number } | null>(null)
  const [swipe, setSwipe] = useState<{ key: string; x: number } | null>(null)
  const trackMenu = useTrackContextMenu()

  const state = usePlayerStore()
  const { currentTrack, queue, currentTime, duration, volume, isMuted, isPlaying, isShuffled, isLoading, playbackError } = state
  const activePlaylistTitle = selectedPlaylist?.title ?? (state.queueMode === 'playlist' ? 'Playlist' : 'Queue')
  const remaining = Math.max(0, duration - currentTime)
  const visibleQueue = useMemo(() => {
    const currentIndex = queue.findIndex((track) => track.key === currentTrack?.key)
    const start = currentIndex > 0 ? currentIndex - 1 : 0
    return queue.slice(start, start + 7).map((track, offset) => ({ track, index: start + offset }))
  }, [currentTrack?.key, queue])

  const loadPlaylist = useCallback(async (playlist: PlaylistSummary) => {
    setSelectedId(playlist.id)
    try {
      const detail = await api.playlists.get(playlist.id)
      setSelectedPlaylist(detail)
      const tracks = detail.items.map((item: PlaylistTrack) => playable(item.track))
      state.setQueue(tracks, 'playlist')
      if (tracks.length) state.setCurrentTrack(tracks[0])
    } catch { setSelectedPlaylist(null) }
  }, [state])

  const updateArtwork = async (playlist: PlaylistSummary, patch: { label_style?: string; label_art?: string | null; cover_art?: string | null }) => {
    const updated = await api.playlists.update(playlist.id, patch)
    setPlaylists((values) => values.map((value) => value.id === playlist.id ? { ...value, ...updated } : value))
    if (selectedId === playlist.id) setSelectedPlaylist(updated)
  }

  useEffect(() => {
    const store = usePlayerStore.getState()
    store.hydrate()
    const controller = new AbortController()
    void Promise.all([api.auth.me(), api.config(), api.playlists.list(controller.signal)]).then(([user, config, values]) => {
      if (controller.signal.aborted) return
      store.setUser(user); store.setConfig(config); setPlaylists(values); setPlaylistsLoading(false); setAuthState('ready'); setOnboardingOpen(!localStorage.getItem(onboardingKey(user.id)))
    }).catch(() => { if (!controller.signal.aborted) { setAuthState('denied'); navigate('/auth', { replace: true }) } })
    return () => controller.abort()
  }, [navigate])

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); setSearchOpen(true); return }
      if (target.matches('input,textarea,[contenteditable="true"]')) return
      if (event.key === ' ' && currentTrack) { event.preventDefault(); state.togglePlay() }
      else if (event.key === 'ArrowRight' && queue.length > 1) { event.preventDefault(); state.playNext() }
      else if (event.key === 'ArrowLeft' && currentTrack) { event.preventDefault(); state.playPrev() }
      else if (event.key === 'ArrowUp') { event.preventDefault(); state.setVolume(volume + .05) }
      else if (event.key === 'ArrowDown') { event.preventDefault(); state.setVolume(volume - .05) }
    }
    window.addEventListener('keydown', keydown)
    return () => window.removeEventListener('keydown', keydown)
  }, [currentTrack, queue.length, volume, state])

  useEffect(() => {
    if (authState !== 'ready') return
    const button = document.querySelector<HTMLButtonElement>('button[aria-label="Queue options"]')
    if (!button) return
    const openQueueMenu = (event: MouseEvent) => {
      event.stopPropagation()
      const rect = button.getBoundingClientRect()
      setQueueMenu((current) => current ? null : { x: rect.right, y: rect.bottom })
    }
    button.addEventListener('click', openQueueMenu)
    return () => button.removeEventListener('click', openQueueMenu)
  }, [authState])

  const visibleTapes = useMemo(() => {
    const selected = Math.max(0, playlists.findIndex((playlist) => playlist.id === selectedId))
    return playlists.map((playlist, index) => ({ playlist, index, slot: index - selected })).filter(({ slot }) => Math.abs(slot) <= 3)
  }, [playlists, selectedId])

  const seek = (clientX: number) => {
    if (!progressTrackRef.current || !duration) return
    const rect = progressTrackRef.current.getBoundingClientRect()
    const next = Math.max(0, Math.min(duration, ((clientX - rect.left) / rect.width) * duration))
    if (audioContext.current) audioContext.current.currentTime = next
    state.setCurrentTime(next)
  }
  const setVolumeAt = (clientX: number) => {
    if (!volumeRef.current) return
    const rect = volumeRef.current.getBoundingClientRect()
    state.setVolume((clientX - rect.left) / rect.width)
  }
  const selectQueueTrack = (event: React.MouseEvent, key: string, index: number) => {
    if (!event.ctrlKey && !event.metaKey && !event.shiftKey) { setSelectedKeys(new Set()); selectionAnchor.current = null; return }
    event.preventDefault()
    if (event.shiftKey && selectionAnchor.current !== null) {
      const [start, end] = [Math.min(selectionAnchor.current, index), Math.max(selectionAnchor.current, index)]
      setSelectedKeys(new Set(queue.slice(start, end + 1).map((item) => item.key)))
    } else { setSelectedKeys((current) => { const next = new Set(current); if (next.has(key)) next.delete(key); else next.add(key); return next }); selectionAnchor.current = index }
  }
  const startQueueDrag = (event: MouseEvent | PointerEvent | TouchEvent, key: string) => {
    setDraggingKey(key)
    const dataTransfer = (event as DragEvent).dataTransfer
    if (dataTransfer) dataTransfer.effectAllowed = 'move'
  }

  if (authState !== 'ready') return <div className="lv-status" role="status">{authState === 'checking' ? 'Checking session…' : 'Redirecting…'}</div>

  return <div className="lv-shell">
    <Sidebar isOpen={navigationOpen} onClose={() => setNavigationOpen(false)} onSearch={() => setSearchOpen(true)} />
    <SearchModal isOpen={searchOpen} onClose={() => setSearchOpen(false)} />
    {state.user && onboardingOpen && <FirstRunOnboarding userId={state.user.id} onFinish={()=>setOnboardingOpen(false)} onImport={()=>setImportOpen(true)}/>}
    <Dialog open={importOpen} title="Перенести музыку" description="Выберите источник — инструкции появятся на следующем шаге." onClose={()=>setImportOpen(false)}><PlaylistImport onDone={()=>{ void api.playlists.list().then(setPlaylists) }}/></Dialog>
    <Dialog open={artEditor !== null} title={artEditor?.kind === 'cover' ? 'Обложка плейлиста' : 'Рисунок на наклейке'} description={artEditor?.kind === 'cover' ? 'Загрузите изображение, выберите обложку альбома или нарисуйте свою.' : 'Рисуйте, добавляйте название и готовые значки.'} onClose={() => setArtEditor(null)}>{artEditor && <Suspense fallback={<div role="status">Загрузка редактора…</div>}><ArtworkEditor value={artEditor.kind === 'cover' ? artEditor.playlist.cover_art : artEditor.playlist.label_art} title={artEditor.playlist.title} square={artEditor.kind === 'cover'} albumCovers={[...new Set((selectedPlaylist?.id === artEditor.playlist.id ? selectedPlaylist.items : []).map((item) => item.track.cover_url).filter((url): url is string => Boolean(url)))]} onCancel={() => setArtEditor(null)} onSave={(value) => { void updateArtwork(artEditor.playlist, artEditor.kind === 'cover' ? { cover_art: value } : { label_art: value }).then(() => setArtEditor(null)) }} /></Suspense>}</Dialog>
    <Dialog open={clearQueueOpen} title="Очистить очередь?" description="Все треки будут удалены из очереди, а воспроизведение остановится." onClose={() => setClearQueueOpen(false)}><div className="lv-clear-actions"><button className="fuze-button fuze-button--secondary" onClick={() => setClearQueueOpen(false)}>Отмена</button><button className="fuze-button fuze-button--danger" onClick={() => { state.clearQueue(); setSelectedPlaylist(null); setSelectedId(null); setSelectedKeys(new Set()); setClearQueueOpen(false) }}><Trash />Очистить очередь</button></div></Dialog>
    <header className="lv-header"><img src="/brand/fuze-lockup.svg" alt="Fuze" /><div className="lv-header-actions"><button onClick={() => navigate('/player/playlists')}><SquaresFour /> Collection</button><button onClick={() => setSearchOpen(true)}><MagnifyingGlass /> Search <kbd>⌘ K</kbd></button><button onClick={() => navigate('/player/settings')} aria-label="Settings"><Gear /></button></div></header>
    <aside className="lv-shelf">
      <nav className="lv-nav" aria-label="Application navigation"><button className="lv-nav-toggle" aria-label="Open navigation" onClick={() => setNavigationOpen(true)}><List /></button></nav>
      <section className="lv-stack-zone" aria-label="Playlist cassettes"><div className="lv-stack">{playlistsLoading ? <span className="lv-tape-state">loading tapes…</span> : playlists.length === 0 ? <button className="lv-tape-state" onClick={() => navigate('/player/playlists')}>no tapes yet<br /><b>open collection</b></button> : visibleTapes.map(({ playlist, index, slot }) => <div key={playlist.id} className={`lv-tape ${slot === 0 ? 'current' : ''}`} style={{ '--slot': slot } as CSSProperties}><CassetteSpine playlist={playlist} index={index} active={slot === 0} onClick={() => void loadPlaylist(playlist)} onContextMenu={(event) => { event.preventDefault(); event.stopPropagation(); setCassetteMenu({ playlist, x: event.clientX, y: event.clientY }) }} /></div>)}</div></section>
    </aside>
    <main className="lv-listening">
      <section className="lv-artwork"><div className="lv-art"><Artwork url={currentTrack?.cover_url} title={currentTrack?.album ?? currentTrack?.title} /></div><div className="lv-album-copy"><span>{currentTrack?.album ?? (currentTrack ? 'Unknown album' : 'Nothing playing')}</span><small>{currentTrack?.year ? `${currentTrack.year} · ` : ''}{currentTrack?.source ?? 'Choose a track'}</small></div></section>
      <section className="lv-queue"><div className="lv-queue-heading"><span>Playing from</span><b>{activePlaylistTitle}</b><button onClick={() => navigate('/player/playlists')} aria-label="Queue options"><DotsThree /></button></div><div className="lv-queue-list">{queue.length === 0 ? <div className="lv-empty-queue"><span>Queue is empty</span><button onClick={() => setSearchOpen(true)}>Search for music</button></div> : <AnimatePresence initial={false} mode="popLayout">{visibleQueue.map(({ track, index }) => <motion.div layout initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0, x: swipe?.key === track.key ? Math.max(-90, Math.min(90, swipe.x)) : 0 }} exit={{ opacity: 0, y: -18 }} transition={{ duration: .22, ease: 'easeOut' }} draggable style={swipe?.key === track.key ? { zIndex: 1 } : undefined} onPointerDown={(event) => { if (event.pointerType === 'touch') swipeStart.current = { key: track.key, x: event.clientX } }} onPointerMove={(event) => { if (swipeStart.current?.key === track.key) setSwipe({ key: track.key, x: event.clientX - swipeStart.current.x }) }} onPointerUp={(event) => { const start = swipeStart.current; swipeStart.current = null; setSwipe(null); if (!start) return; const delta = event.clientX - start.x; if (delta < -72) state.removeFromQueue(track.key); else if (delta > 72) state.playNextTrack(track) }} onDragStart={(event) => startQueueDrag(event, track.key)} onDragEnter={() => { setDragTargetKey(track.key); const from = queue.findIndex((item) => item.key === draggingKey); if (from >= 0) state.reorderQueue(from, index) }} onDragOver={(event) => event.preventDefault()} onDragEnd={() => { setDraggingKey(null); setDragTargetKey(null) }} onContextMenu={(event) => trackMenu.openMenu(event, track, queue.filter((item) => selectedKeys.has(item.key)))} className={`has-track-preview ${track.key === currentTrack?.key ? 'active' : ''} ${draggingKey === track.key ? 'is-dragging' : ''} ${dragTargetKey === track.key && draggingKey !== track.key ? 'is-drop-target' : ''} ${selectedKeys.has(track.key) ? 'is-selected' : ''}`} key={track.key}><button onClick={(event) => { selectQueueTrack(event, track.key, index); if (!event.ctrlKey && !event.metaKey && !event.shiftKey) state.setCurrentTrack(track) }} onDoubleClick={() => { state.setCurrentTrack(track); state.setIsPlaying(true) }}><span className="lv-index">{selectedKeys.has(track.key) ? '✓' : track.key === currentTrack?.key ? <Play weight="fill" /> : index + 1}</span><span className="lv-track-copy"><b>{track.title}</b><small>{track.artist}</small></span><time>{formatDuration(track.duration_ms)}</time><DownloadStatus track={track} /></button><span className="lv-queue-grip" title="Перетащить трек" aria-hidden="true"><DotsSixVertical weight="bold" /></span><TrackPreview track={track} /></motion.div>)}</AnimatePresence>}</div><button className="lv-edit" onClick={() => navigate('/player/playlists')}>Edit queue <CaretRight /></button></section>
      <section className="lv-identity"><button className="lv-artist" onClick={() => setSearchOpen(true)}>{currentTrack?.artist ?? 'Fuze'} <CaretRight /></button><h1>{currentTrack?.title ?? 'Choose something to play'}</h1><p>{currentTrack?.album ?? 'Your music is ready'}{currentTrack?.year ? <><span>·</span>{currentTrack.year}</> : null}</p>{isLoading && <small>Preparing audio…</small>}{playbackError && <small role="alert">{playbackError}</small>}</section>
    </main>
    {queueMenu && <><button className="lv-menu-dismiss" aria-label="Закрыть меню очереди" onClick={() => setQueueMenu(null)} /><div className="track-menu lv-queue-menu" role="menu" aria-label="Действия с очередью" style={{ left: Math.max(8, Math.min(queueMenu.x - 232, window.innerWidth - 240)), top: Math.min(queueMenu.y, window.innerHeight - 58) }}><button role="menuitem" className="lv-queue-menu__danger" disabled={queue.length === 0} onClick={() => { setQueueMenu(null); setClearQueueOpen(true) }}><Trash />Очистить очередь</button></div></>}
    {cassetteMenu && <><button className="lv-menu-dismiss" aria-label="Закрыть меню" onClick={() => setCassetteMenu(null)} /><div className="track-menu lv-cassette-menu" role="menu" style={{ left: Math.min(cassetteMenu.x, window.innerWidth - 244), top: Math.min(cassetteMenu.y, window.innerHeight - 310) }}><button onClick={() => { void loadPlaylist(cassetteMenu.playlist); setCassetteMenu(null) }}><Play />Выбрать</button><button onClick={() => navigate(`/player/playlists/${cassetteMenu.playlist.id}`)}><PencilSimple />Редактировать</button><button onClick={() => { setArtEditor({ playlist: cassetteMenu.playlist, kind: 'label' }); setCassetteMenu(null) }}><PaintBrush />Рисовать на наклейке</button><button onClick={() => { setArtEditor({ playlist: cassetteMenu.playlist, kind: 'cover' }); setCassetteMenu(null) }}><ImageSquare />Выбрать обложку</button><div className="track-menu__separator"/><span className="lv-menu-label"><Palette />Цвет наклейки</span><div className="lv-label-swatches">{tapeStyles.map((style) => <button key={style} className={`lv-label-swatch ${style} ${cassetteMenu.playlist.label_style === style ? 'active' : ''}`} onClick={() => { void updateArtwork(cassetteMenu.playlist, { label_style: style }); setCassetteMenu(null) }} aria-label={`Наклейка ${style}`} />)}</div></div></>}
    <TrackContextMenu menu={trackMenu.menu} onClose={trackMenu.closeMenu} onShowInPlaylist={selectedPlaylist ? (track) => navigate(`/player/playlists/${selectedPlaylist.id}`, { state: { highlightTrackId: track.track_id } }) : undefined} />
    <footer className="lv-transport"><div ref={progressRef} className="lv-progress" role="slider" tabIndex={duration ? 0 : -1} aria-label="Playback position" aria-valuemin={0} aria-valuemax={Math.floor(duration)} aria-valuenow={Math.floor(currentTime)} onPointerDown={(event) => { if (!duration) return; seekingRef.current = true; audioContext.isDragging = true; event.currentTarget.setPointerCapture(event.pointerId); seek(event.clientX) }} onPointerMove={(event) => { if (seekingRef.current) seek(event.clientX) }} onPointerUp={(event) => { if (!seekingRef.current) return; seek(event.clientX); seekingRef.current = false; audioContext.isDragging = false; event.currentTarget.releasePointerCapture(event.pointerId) }} onPointerCancel={() => { seekingRef.current = false; audioContext.isDragging = false }} onKeyDown={(event) => { if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); const rect = progressTrackRef.current?.getBoundingClientRect(); if (rect) seek(rect.left + rect.width * Math.max(0, Math.min(1, (currentTime + (event.key === 'ArrowRight' ? 5 : -5)) / duration))) } }}><time>{formatTime(currentTime)}</time><span ref={progressTrackRef}><i style={{ width: `${duration ? currentTime / duration * 100 : 0}%` }} /></span><time>-{formatTime(remaining)}</time></div><div className="lv-now"><span className="lv-cover"><Artwork url={currentTrack?.cover_url} /></span><span><b>{currentTrack?.title ?? 'No track selected'}</b><small>{currentTrack?.artist ?? 'Search or choose a tape'}</small></span></div><div className="lv-controls"><button className={isShuffled ? 'active' : ''} onClick={state.toggleShuffle} aria-label="Shuffle"><Shuffle /></button><button onClick={state.playPrev} disabled={!currentTrack} aria-label="Previous"><SkipBack weight="fill" /></button><button className="lv-play" onClick={state.togglePlay} disabled={!currentTrack} aria-label={isPlaying ? 'Pause' : 'Play'}>{isPlaying ? <Pause weight="fill" /> : <Play weight="fill" />}</button><button onClick={state.playNext} disabled={queue.length < 2} aria-label="Next"><SkipForward weight="fill" /></button><button onClick={() => navigate('/player/playlists')} aria-label="Queue"><QueueIcon /></button></div><div className="lv-volume"><button onClick={state.toggleMute} aria-label={isMuted ? 'Unmute' : 'Mute'}>{isMuted ? <SpeakerSlash /> : <SpeakerHigh />}</button><div ref={volumeRef} role="slider" tabIndex={0} aria-label="Volume" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round((isMuted ? 0 : volume) * 100)} onPointerDown={(event) => { changingVolumeRef.current = true; event.currentTarget.setPointerCapture(event.pointerId); setVolumeAt(event.clientX) }} onPointerMove={(event) => { if (changingVolumeRef.current) setVolumeAt(event.clientX) }} onPointerUp={(event) => { if (!changingVolumeRef.current) return; setVolumeAt(event.clientX); changingVolumeRef.current = false; event.currentTarget.releasePointerCapture(event.pointerId) }} onPointerCancel={() => { changingVolumeRef.current = false }} onKeyDown={(event) => { if (['ArrowLeft','ArrowDown','ArrowRight','ArrowUp'].includes(event.key)) { event.preventDefault(); state.setVolume(volume + (['ArrowRight','ArrowUp'].includes(event.key) ? .05 : -.05)) } }}><i style={{ width: `${(isMuted ? 0 : volume) * 100}%` }} /></div></div></footer>
  </div>
}
