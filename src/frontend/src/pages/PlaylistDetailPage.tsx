import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowLeft, DotsSixVertical, DownloadSimple, ImageSquare, MusicNotes, PencilSimple, Play, Plus, Spinner, Trash, X } from '@phosphor-icons/react'
import { PlaylistShell } from '@/components/playlists/PlaylistShell'
import { PlaylistForm } from '@/components/playlists/PlaylistForm'
import { ArtworkEditor } from '@/components/playlists/ArtworkEditor'
import { Dialog } from '@/components/ui/Dialog'
import { SearchModal } from '@/components/search/SearchModal'
import { api } from '@/lib/api'
import { usePlayerStore } from '@/lib/store'
import type { PlaylistDetail, PlaylistTrack, TrackRead, TrackSearchResult } from '@/lib/types'
import { FuzeButton, FuzePageHeader, FuzeState } from '@/components/fuze'
import { offlineMediaRepository } from '@/services/offlineMediaRepository'
import { TrackContextMenu, TrackPreview, useTrackContextMenu } from '@/components/tracks/TrackContextMenu'

function playable(track: TrackRead): TrackSearchResult {
  return { key: `track:${track.id}`, track_id: track.id, source: track.source, capability: 'acquire', availability: track.download_status, title: track.title, artist: track.artist, album: track.album, year: track.release_year, duration_ms: track.duration_ms, cover_url: track.cover_url, source_id: track.source_id, external_url: null, error_code: track.download_error_code, error_message: track.download_error_message }
}

function duration(ms: number | null) {
  if (!ms) return '--:--'
  const seconds = Math.floor(ms / 1000)
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}

export default function PlaylistDetailPage() {
  const { id = '' } = useParams<{ id: string }>()
  const playlistId = Number(id)
  const navigate = useNavigate()
  const location = useLocation()
  const queue = usePlayerStore((state) => state.queue)
  const config = usePlayerStore((state) => state.config)
  const addToQueue = usePlayerStore((state) => state.addToQueue)
  const setQueue = usePlayerStore((state) => state.setQueue)
  const setCurrentTrack = usePlayerStore((state) => state.setCurrentTrack)
  const [playlist, setPlaylist] = useState<PlaylistDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editOpen, setEditOpen] = useState(false)
  const [coverOpen, setCoverOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [itemBusy, setItemBusy] = useState<number | null>(null)
  const [draggingId, setDraggingId] = useState<number | null>(null)
  const [dragTargetId, setDragTargetId] = useState<number | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const selectionAnchor = useRef<number | null>(null)
  const swipeStart = useRef<{ id: number; x: number } | null>(null)
  const [swipe, setSwipe] = useState<{ id: number; x: number } | null>(null)
  const trackMenu = useTrackContextMenu()

  const load = useCallback(async (signal?: AbortSignal) => {
    if (!Number.isInteger(playlistId) || playlistId <= 0) { setError('This playlist address is invalid.'); setLoading(false); return }
    setLoading(true); setError(null)
    try { setPlaylist(await api.playlists.get(playlistId, signal)) }
    catch (reason) { if (!signal?.aborted) setError(reason instanceof Error ? reason.message : 'Unable to load this playlist.') }
    finally { if (!signal?.aborted) setLoading(false) }
  }, [playlistId])
  useEffect(() => { const controller = new AbortController(); void load(controller.signal); return () => controller.abort() }, [load])
  useEffect(() => {
    const trackId = (location.state as { highlightTrackId?: number } | null)?.highlightTrackId
    if (!playlist || !trackId) return
    const index = playlist.items.findIndex((item) => item.track.id === trackId)
    requestAnimationFrame(() => document.querySelectorAll<HTMLElement>('.fuze-track-row')[index]?.scrollIntoView({ behavior: 'smooth', block: 'center' }))
  }, [location.state, playlist])

  async function update(value: { title: string; description: string | null }) {
    setBusy(true); setActionError(null)
    try { const updated = await api.playlists.update(playlistId, value); setPlaylist((current) => current ? { ...current, ...updated } : current); setEditOpen(false) }
    catch (reason) { setActionError(reason instanceof Error ? reason.message : 'Unable to update playlist.') }
    finally { setBusy(false) }
  }
  async function removePlaylist() {
    setBusy(true); setActionError(null)
    try { await api.playlists.remove(playlistId); navigate('/player/playlists') }
    catch (reason) { setActionError(reason instanceof Error ? reason.message : 'Unable to delete playlist.'); setBusy(false) }
  }
  async function add(trackId: number) {
    setItemBusy(trackId); setActionError(null)
    try {
      const item = await api.playlists.addItem(playlistId, trackId)
      setPlaylist((current) => current ? { ...current, tracks_count: current.tracks_count + 1, items: [...current.items, item] } : current)
    }
    catch (reason) { setActionError(reason instanceof Error ? reason.message : 'Unable to add track.') }
    finally { setItemBusy(null) }
  }
  async function removeItem(itemId: number) {
    if (!playlist) return
    const previous = playlist
    setItemBusy(itemId); setActionError(null)
    setPlaylist({ ...playlist, tracks_count: Math.max(0, playlist.tracks_count - 1), items: playlist.items.filter((item) => item.id !== itemId).map((item, position) => ({ ...item, position })) })
    try { await api.playlists.removeItem(playlistId, itemId) }
    catch (reason) { setPlaylist(previous); setActionError(reason instanceof Error ? reason.message : 'Unable to remove track.') }
    finally { setItemBusy(null) }
  }
  function dragOver(itemId: number) {
    setDragTargetId(itemId)
    if (!playlist || draggingId === null || draggingId === itemId) return
    const from = playlist.items.findIndex((item) => item.id === draggingId)
    const to = playlist.items.findIndex((item) => item.id === itemId)
    if (from < 0 || to < 0) return
    const items = [...playlist.items]; const [moved] = items.splice(from, 1); items.splice(to, 0, moved)
    setPlaylist({ ...playlist, items: items.map((item, position) => ({ ...item, position })) })
  }
  async function updateCover(value: string | null) {
    setBusy(true); setActionError(null)
    try {
      const updated = await api.playlists.update(playlistId, { cover_art: value })
      setPlaylist(updated)
      setCoverOpen(false)
    } catch (reason) { setActionError(reason instanceof Error ? reason.message : 'Не удалось сохранить обложку.') }
    finally { setBusy(false) }
  }
  async function finishDrag() {
    const current = playlist; setDraggingId(null); setDragTargetId(null)
    if (!current) return
    setItemBusy(-1); setActionError(null)
    try { setPlaylist(await api.playlists.reorder(playlistId, { item_ids: current.items.map((item) => item.id) })) }
    catch (reason) { setActionError(reason instanceof Error ? reason.message : 'Unable to reorder tracks.'); void load() }
    finally { setItemBusy(null) }
  }
  function selectItem(event: React.MouseEvent, itemId: number, index: number) {
    if (!event.ctrlKey && !event.metaKey && !event.shiftKey) { setSelectedIds(new Set()); selectionAnchor.current = null; return }
    event.preventDefault()
    if (event.shiftKey && selectionAnchor.current !== null && playlist) {
      const from = playlist.items.findIndex((item) => item.id === selectionAnchor.current); const [start, end] = [Math.min(from, index), Math.max(from, index)]
      setSelectedIds(new Set(playlist.items.slice(start, end + 1).map((item) => item.id)))
    } else { setSelectedIds((current) => { const next = new Set(current); if (next.has(itemId)) next.delete(itemId); else next.add(itemId); return next }); selectionAnchor.current = itemId }
  }
  function swipeEnd(item: PlaylistTrack, clientX: number) {
    const start = swipeStart.current; swipeStart.current = null; setSwipe(null)
    if (!start || start.id !== item.id) return
    const delta = clientX - start.x
    if (delta < -72) void removeItem(item.id)
    else if (delta > 72) usePlayerStore.getState().playNextTrack(playable(item.track))
  }
  function play(item: PlaylistTrack) { const track = queue.find((value) => value.track_id === item.track.id) ?? playable(item.track); addToQueue(track); setCurrentTrack(track) }
  function playPlaylist() {
    if (!playlist?.items.length) return
    const tracks = playlist.items.map((item) => playable(item.track))
    setQueue(tracks, 'playlist')
    setCurrentTrack(tracks[0])
    navigate('/player')
  }
  async function downloadTrack(track: TrackRead) {
    setItemBusy(track.id); setActionError(null)
    try { await offlineMediaRepository.enqueue(await api.tracks.download(track.id), { title: track.title, artist: track.artist }) }
    catch (reason) { setActionError(reason instanceof Error ? reason.message : 'Unable to start download.') }
    finally { setItemBusy(null) }
  }
  async function downloadPlaylist() {
    if (!playlist) return
    setBusy(true); setActionError(null)
    try {
      const tracks = playlist.items.map((item) => item.track).filter((track) => track.download_status === 'ready')
      const { data } = await api.tracks.downloadBulk(tracks.map((track) => track.id))
      const metadata = new Map(tracks.map((track) => [track.id, track]))
      await Promise.all(data.map((descriptor) => { const track = metadata.get(descriptor.track_id)!; return offlineMediaRepository.enqueue(descriptor, { title: track.title, artist: track.artist }) }))
    } catch (reason) { setActionError(reason instanceof Error ? reason.message : 'Unable to download playlist.') }
    finally { setBusy(false) }
  }

  return <PlaylistShell>
    <Link to="/player/playlists" className="fuze-button fuze-button--ghost"><ArrowLeft size={17} />All playlists</Link>
    {error ? <FuzeState kind="error" title="Playlist could not be loaded" action={<FuzeButton onClick={() => void load()}>Try again</FuzeButton>}>{error}</FuzeState>
    : loading || !playlist ? <FuzeState kind="loading">LOADING PLAYLIST…</FuzeState>
    : <>
      {playlist.cover_art && <div className="fuze-playlist-cover"><img src={playlist.cover_art} alt={`Обложка плейлиста ${playlist.title}`} /></div>}
      <FuzePageHeader eyebrow={`${playlist.tracks_count} ${playlist.tracks_count === 1 ? 'track' : 'tracks'}`} title={playlist.title} description={playlist.description ?? undefined} actions={<><FuzeButton variant="primary" disabled={!config?.features.playback || playlist.items.length === 0} onClick={playPlaylist} icon={<Play size={17} weight="fill" />}>Play</FuzeButton><FuzeButton disabled={busy || playlist.items.length === 0} onClick={() => void downloadPlaylist()} icon={<DownloadSimple size={17} />}>Download</FuzeButton><FuzeButton onClick={() => { setActionError(null); setEditOpen(true) }} icon={<PencilSimple size={17} />}>Edit</FuzeButton><FuzeButton onClick={() => { setActionError(null); setAddOpen(true) }} icon={<Plus size={17} />}>Add tracks</FuzeButton></>} />
      {actionError && <p role="alert" className="fuze-alert">{actionError}</p>}
      {playlist.items.length === 0 ? <FuzeState title="This playlist is empty" action={<FuzeButton onClick={() => setAddOpen(true)}>Search for tracks</FuzeButton>}>Search for music and add tracks directly to this playlist.</FuzeState>
      : <ol className="fuze-track-list" aria-label="Playlist tracks">{playlist.items.map((item, index) => { const track = playable(item.track); return <li key={item.id} draggable={itemBusy === null} style={swipe?.id === item.id ? { transform: `translateX(${Math.max(-100, Math.min(100, swipe.x))}px)` } : undefined} onPointerDown={(event) => { if (event.pointerType === 'touch') swipeStart.current = { id: item.id, x: event.clientX } }} onPointerMove={(event) => { if (swipeStart.current?.id === item.id) setSwipe({ id: item.id, x: event.clientX - swipeStart.current.x }) }} onPointerUp={(event) => swipeEnd(item, event.clientX)} onDragStart={(event) => { setDraggingId(item.id); event.dataTransfer.effectAllowed = 'move' }} onDragEnter={() => dragOver(item.id)} onDragOver={(event) => event.preventDefault()} onDragEnd={() => void finishDrag()} onContextMenu={(event) => trackMenu.openMenu(event, track, playlist.items.filter((value) => selectedIds.has(value.id)).map((value) => playable(value.track)))} className={`fuze-track-row has-track-preview ${draggingId === item.id ? 'is-dragging' : ''} ${dragTargetId === item.id && draggingId !== item.id ? 'is-drop-target' : ''} ${selectedIds.has(item.id) ? 'is-selected' : ''}`}><span className="fuze-track-row__index">{selectedIds.has(item.id) ? '✓' : index + 1}</span><button type="button" disabled={!config?.features.playback} onClick={(event) => { selectItem(event, item.id, index); if (!event.ctrlKey && !event.metaKey && !event.shiftKey) play(item) }} onDoubleClick={() => { play(item); usePlayerStore.getState().setIsPlaying(true) }} className="fuze-track-row__main" aria-label={config?.features.playback ? `Play ${item.track.title}` : `${item.track.title} metadata`}><span className="fuze-track-row__art">{item.track.cover_url ? <img src={item.track.cover_url} alt="" /> : <MusicNotes />}</span><span className="fuze-track-row__copy"><b>{item.track.title}</b><small>{item.track.artist}</small></span></button><time>{duration(item.track.duration_ms)}</time><div className="fuze-track-row__actions"><FuzeButton variant="icon" disabled={itemBusy !== null || item.track.download_status !== 'ready'} onClick={() => void downloadTrack(item.track)} aria-label={`Download ${item.track.title}`}><DownloadSimple /></FuzeButton><FuzeButton variant="icon" disabled={itemBusy !== null} onClick={() => void removeItem(item.id)} aria-label={`Remove ${item.track.title}`}><X /></FuzeButton><span className="fuze-track-row__grip" title="Перетащить трек" aria-hidden="true"><DotsSixVertical weight="bold" /></span></div><TrackPreview track={track} /></li> })}</ol>}
      <TrackContextMenu menu={trackMenu.menu} onClose={trackMenu.closeMenu} />
      <button type="button" onClick={() => { setActionError(null); setDeleteOpen(true) }} className="mt-8 flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm text-red-400 hover:bg-red-500/10"><Trash size={17} />Delete playlist</button>
      <Dialog open={editOpen} title="Edit playlist" onClose={() => { if (!busy) setEditOpen(false) }}><PlaylistForm initialTitle={playlist.title} initialDescription={playlist.description} submitLabel="Save changes" busy={busy} error={actionError} onCancel={() => setEditOpen(false)} onSubmit={update} /><div className="playlist-edit-extras"><button type="button" disabled={busy} onClick={() => { setActionError(null); setEditOpen(false); setCoverOpen(true) }}><ImageSquare />{playlist.cover_art ? 'Изменить обложку' : 'Добавить обложку'}</button><button type="button" disabled={busy} className="danger" onClick={() => { setActionError(null); setEditOpen(false); setDeleteOpen(true) }}><Trash />Удалить плейлист</button></div></Dialog>
      <Dialog open={coverOpen} title="Обложка плейлиста" description="Загрузите своё изображение или выберите обложку альбома из плейлиста." onClose={() => { if (!busy) setCoverOpen(false) }}><ArtworkEditor value={playlist.cover_art} title={playlist.title} square albumCovers={[...new Set(playlist.items.map((item) => item.track.cover_url).filter((url): url is string => Boolean(url)))]} onCancel={() => setCoverOpen(false)} onSave={(value) => void updateCover(value)} />{actionError && <p role="alert" className="mt-3 text-sm text-red-400">{actionError}</p>}</Dialog>
      <Dialog open={deleteOpen} title="Delete playlist?" description="The playlist will be removed. Your saved tracks will not be deleted." onClose={() => { if (!busy) setDeleteOpen(false) }}><div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><button type="button" disabled={busy} onClick={() => setDeleteOpen(false)} className="min-h-11 rounded-lg px-4 text-sm text-text-secondary hover:bg-hover-strong">Cancel</button><button type="button" disabled={busy} onClick={() => void removePlaylist()} className="flex min-h-11 items-center justify-center gap-2 rounded-lg bg-red-700 px-4 text-sm font-semibold text-white disabled:opacity-50">{busy && <Spinner className="animate-spin" />}Delete playlist</button></div>{actionError && <p role="alert" className="mt-3 text-sm text-red-400">{actionError}</p>}</Dialog>
      <SearchModal isOpen={addOpen} onClose={() => setAddOpen(false)} destination="playlist" onTrackReady={(track) => add(track.track_id!)} />
    </>}
  </PlaylistShell>
}
