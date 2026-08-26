import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { useNavigate } from 'react-router-dom'
import { CaretRight, DotsThree, Gear, List, MagnifyingGlass, MusicNote, Pause, Play, Queue as QueueIcon, Shuffle, SkipBack, SkipForward, SpeakerHigh, SpeakerSlash, SquaresFour, X } from '@phosphor-icons/react'
import { SearchModal } from '@/components/search/SearchModal'
import { api } from '@/lib/api'
import { usePlayerStore } from '@/lib/store'
import type { PlaylistDetail, PlaylistSummary, PlaylistTrack, TrackRead, TrackSearchResult } from '@/lib/types'
import { audioContext } from './audioContext'
import './listening-view.css'
import { Dialog } from '@/components/ui/Dialog'
import { PlaylistImport } from '@/components/playlists/PlaylistImport'
import { FirstRunOnboarding, onboardingKey } from '@/components/onboarding/FirstRunOnboarding'

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

function CassetteSpine({ playlist, index, active, onClick }: { playlist: PlaylistSummary; index: number; active: boolean; onClick: () => void }) {
  return <button className={`lv-spine ${tapeStyles[index % tapeStyles.length]} ${active ? 'active' : ''}`} onClick={onClick} aria-label={`Play playlist ${playlist.title}`}>
    <span className="lv-plastic"><i /><i /></span>
    <span className="lv-label"><em>{tapeMarks[index % tapeMarks.length]}</em><span><b>{playlist.title}</b><small>{playlist.description || `${playlist.tracks_count} ${playlist.tracks_count === 1 ? 'track' : 'tracks'}`}</small></span><code>{String(index + 1).padStart(2, '0')}</code></span>
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
  const progressRef = useRef<HTMLDivElement>(null)
  const progressTrackRef = useRef<HTMLSpanElement>(null)
  const volumeRef = useRef<HTMLDivElement>(null)
  const seekingRef = useRef(false)
  const changingVolumeRef = useRef(false)

  const state = usePlayerStore()
  const { currentTrack, queue, currentTime, duration, volume, isMuted, isPlaying, isShuffled, isLoading, playbackError } = state
  const activePlaylistTitle = selectedPlaylist?.title ?? (state.queueMode === 'playlist' ? 'Playlist' : 'Queue')
  const remaining = Math.max(0, duration - currentTime)

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

  if (authState !== 'ready') return <div className="lv-status" role="status">{authState === 'checking' ? 'Checking session…' : 'Redirecting…'}</div>

  return <div className="lv-shell">
    <SearchModal isOpen={searchOpen} onClose={() => setSearchOpen(false)} />
    {state.user && onboardingOpen && <FirstRunOnboarding userId={state.user.id} onFinish={()=>setOnboardingOpen(false)} onImport={()=>setImportOpen(true)}/>}
    <Dialog open={importOpen} title="Перенести музыку" description="Выберите источник — инструкции появятся на следующем шаге." onClose={()=>setImportOpen(false)}><PlaylistImport onDone={()=>{ void api.playlists.list().then(setPlaylists) }}/></Dialog>
    <header className="lv-header"><img src="/brand/fuze-lockup.svg" alt="Fuze" /><div className="lv-header-actions"><button onClick={() => navigate('/player/playlists')}><SquaresFour /> Collection</button><button onClick={() => setSearchOpen(true)}><MagnifyingGlass /> Search <kbd>⌘ K</kbd></button><button onClick={() => navigate('/player/settings')} aria-label="Settings"><Gear /></button></div></header>
    <aside className="lv-shelf">
      <nav className={`lv-nav ${navigationOpen ? 'open' : ''}`} aria-label="Application navigation"><button className="lv-nav-toggle" aria-label={navigationOpen ? 'Close navigation' : 'Open navigation'} onClick={() => setNavigationOpen(!navigationOpen)}>{navigationOpen ? <X /> : <List />}</button><div className="lv-nav-items" aria-hidden={!navigationOpen}><button onClick={() => navigate('/player/playlists')}><SquaresFour /><span>Collection</span></button><button onClick={() => setSearchOpen(true)}><MagnifyingGlass /><span>Search</span></button><button onClick={() => navigate('/player/settings')}><Gear /><span>Settings</span></button></div></nav>
      <section className="lv-stack-zone" aria-label="Playlist cassettes"><div className="lv-stack">{playlistsLoading ? <span className="lv-tape-state">loading tapes…</span> : playlists.length === 0 ? <button className="lv-tape-state" onClick={() => navigate('/player/playlists')}>no tapes yet<br /><b>open collection</b></button> : visibleTapes.map(({ playlist, index, slot }) => <div key={playlist.id} className={`lv-tape ${slot === 0 ? 'current' : ''}`} style={{ '--slot': slot } as CSSProperties}><CassetteSpine playlist={playlist} index={index} active={slot === 0} onClick={() => void loadPlaylist(playlist)} /></div>)}</div></section>
    </aside>
    <main className="lv-listening">
      <section className="lv-artwork"><div className="lv-art"><Artwork url={currentTrack?.cover_url} title={currentTrack?.album ?? currentTrack?.title} /></div><div className="lv-album-copy"><span>{currentTrack?.album ?? (currentTrack ? 'Unknown album' : 'Nothing playing')}</span><small>{currentTrack?.year ? `${currentTrack.year} · ` : ''}{currentTrack?.source ?? 'Choose a track'}</small></div></section>
      <section className="lv-queue"><div className="lv-queue-heading"><span>Playing from</span><b>{activePlaylistTitle}</b><button onClick={() => navigate('/player/playlists')} aria-label="Queue options"><DotsThree /></button></div><div className="lv-queue-list">{queue.length === 0 ? <div className="lv-empty-queue"><span>Queue is empty</span><button onClick={() => setSearchOpen(true)}>Search for music</button></div> : queue.slice(0, 7).map((track, index) => <button className={track.key === currentTrack?.key ? 'active' : ''} key={track.key} onClick={() => state.setCurrentTrack(track)}><span className="lv-index">{track.key === currentTrack?.key ? <Play weight="fill" /> : index + 1}</span><span className="lv-track-copy"><b>{track.title}</b><small>{track.artist}</small></span><time>{formatDuration(track.duration_ms)}</time><DotsThree /></button>)}</div><button className="lv-edit" onClick={() => navigate('/player/playlists')}>Edit queue <CaretRight /></button></section>
      <section className="lv-identity"><button className="lv-artist" onClick={() => setSearchOpen(true)}>{currentTrack?.artist ?? 'Fuze'} <CaretRight /></button><h1>{currentTrack?.title ?? 'Choose something to play'}</h1><p>{currentTrack?.album ?? 'Your music is ready'}{currentTrack?.year ? <><span>·</span>{currentTrack.year}</> : null}</p>{isLoading && <small>Preparing audio…</small>}{playbackError && <small role="alert">{playbackError}</small>}</section>
    </main>
    <footer className="lv-transport"><div ref={progressRef} className="lv-progress" role="slider" tabIndex={duration ? 0 : -1} aria-label="Playback position" aria-valuemin={0} aria-valuemax={Math.floor(duration)} aria-valuenow={Math.floor(currentTime)} onPointerDown={(event) => { if (!duration) return; seekingRef.current = true; audioContext.isDragging = true; event.currentTarget.setPointerCapture(event.pointerId); seek(event.clientX) }} onPointerMove={(event) => { if (seekingRef.current) seek(event.clientX) }} onPointerUp={(event) => { if (!seekingRef.current) return; seek(event.clientX); seekingRef.current = false; audioContext.isDragging = false; event.currentTarget.releasePointerCapture(event.pointerId) }} onPointerCancel={() => { seekingRef.current = false; audioContext.isDragging = false }} onKeyDown={(event) => { if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); const rect = progressTrackRef.current?.getBoundingClientRect(); if (rect) seek(rect.left + rect.width * Math.max(0, Math.min(1, (currentTime + (event.key === 'ArrowRight' ? 5 : -5)) / duration))) } }}><time>{formatTime(currentTime)}</time><span ref={progressTrackRef}><i style={{ width: `${duration ? currentTime / duration * 100 : 0}%` }} /></span><time>-{formatTime(remaining)}</time></div><div className="lv-now"><span className="lv-cover"><Artwork url={currentTrack?.cover_url} /></span><span><b>{currentTrack?.title ?? 'No track selected'}</b><small>{currentTrack?.artist ?? 'Search or choose a tape'}</small></span></div><div className="lv-controls"><button className={isShuffled ? 'active' : ''} onClick={state.toggleShuffle} aria-label="Shuffle"><Shuffle /></button><button onClick={state.playPrev} disabled={!currentTrack} aria-label="Previous"><SkipBack weight="fill" /></button><button className="lv-play" onClick={state.togglePlay} disabled={!currentTrack} aria-label={isPlaying ? 'Pause' : 'Play'}>{isPlaying ? <Pause weight="fill" /> : <Play weight="fill" />}</button><button onClick={state.playNext} disabled={queue.length < 2} aria-label="Next"><SkipForward weight="fill" /></button><button onClick={() => navigate('/player/playlists')} aria-label="Queue"><QueueIcon /></button></div><div className="lv-volume"><button onClick={state.toggleMute} aria-label={isMuted ? 'Unmute' : 'Mute'}>{isMuted ? <SpeakerSlash /> : <SpeakerHigh />}</button><div ref={volumeRef} role="slider" tabIndex={0} aria-label="Volume" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round((isMuted ? 0 : volume) * 100)} onPointerDown={(event) => { changingVolumeRef.current = true; event.currentTarget.setPointerCapture(event.pointerId); setVolumeAt(event.clientX) }} onPointerMove={(event) => { if (changingVolumeRef.current) setVolumeAt(event.clientX) }} onPointerUp={(event) => { if (!changingVolumeRef.current) return; setVolumeAt(event.clientX); changingVolumeRef.current = false; event.currentTarget.releasePointerCapture(event.pointerId) }} onPointerCancel={() => { changingVolumeRef.current = false }} onKeyDown={(event) => { if (['ArrowLeft','ArrowDown','ArrowRight','ArrowUp'].includes(event.key)) { event.preventDefault(); state.setVolume(volume + (['ArrowRight','ArrowUp'].includes(event.key) ? .05 : -.05)) } }}><i style={{ width: `${(isMuted ? 0 : volume) * 100}%` }} /></div></div></footer>
  </div>
}
