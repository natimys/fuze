import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useCallback, useEffect, useState } from 'react'
import { DownloadSimple, ImageSquare, PencilSimple, Plus, Trash } from '@phosphor-icons/react'
import { ArtworkEditor } from '@/components/playlists/ArtworkEditor'
import { PlaylistImport } from '@/components/playlists/PlaylistImport'
import { PlaylistShell } from '@/components/playlists/PlaylistShell'
import { PlaylistForm } from '@/components/playlists/PlaylistForm'
import { Dialog } from '@/components/ui/Dialog'
import { api } from '@/lib/api'
import type { PlaylistCreate, PlaylistSummary } from '@/lib/types'
import { FuzeButton, FuzeCollectionItem, FuzePageHeader, FuzeState } from '@/components/fuze'
import '@/components/tracks/track-context-menu.css'

function formatUpdated(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.valueOf()) ? '' : new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(date)
}

export default function PlaylistsPage() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [playlists, setPlaylists] = useState<PlaylistSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [menu, setMenu] = useState<{ playlist: PlaylistSummary; x: number; y: number } | null>(null)
  const [coverPlaylist, setCoverPlaylist] = useState<PlaylistSummary | null>(null)
  const [albumCovers, setAlbumCovers] = useState<string[]>([])
  const [deletePlaylist, setDeletePlaylist] = useState<PlaylistSummary | null>(null)

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true); setError(null)
    try { setPlaylists(await api.playlists.list(signal)) }
    catch (reason) { if (!signal?.aborted) setError(reason instanceof Error ? reason.message : 'Unable to load playlists.') }
    finally { if (!signal?.aborted) setLoading(false) }
  }, [])

  useEffect(() => { const controller = new AbortController(); void load(controller.signal); return () => controller.abort() }, [load])
  useEffect(() => { if (searchParams.get('import') === '1') { setImportOpen(true); setSearchParams({}, { replace: true }) } }, [searchParams, setSearchParams])

  async function create(value: PlaylistCreate) {
    setSaving(true); setFormError(null)
    try {
      const playlist = await api.playlists.create(value)
      setCreateOpen(false)
      navigate(`/player/playlists/${playlist.id}`)
    } catch (reason) { setFormError(reason instanceof Error ? reason.message : 'Unable to create playlist.') }
    finally { setSaving(false) }
  }

  async function openCoverEditor(playlist: PlaylistSummary) {
    setMenu(null); setFormError(null); setAlbumCovers([]); setCoverPlaylist(playlist)
    try {
      const detail = await api.playlists.get(playlist.id)
      setAlbumCovers([...new Set(detail.items.map((item) => item.track.cover_url).filter((url): url is string => Boolean(url)))])
    } catch (reason) { setFormError(reason instanceof Error ? reason.message : 'Не удалось загрузить обложки альбомов.') }
  }

  async function saveCover(value: string | null) {
    if (!coverPlaylist) return
    setSaving(true); setFormError(null)
    try {
      const updated = await api.playlists.update(coverPlaylist.id, { cover_art: value })
      setPlaylists((items) => items.map((item) => item.id === updated.id ? { ...item, ...updated } : item))
      setCoverPlaylist(null)
    } catch (reason) { setFormError(reason instanceof Error ? reason.message : 'Не удалось сохранить обложку.') }
    finally { setSaving(false) }
  }

  async function remove() {
    if (!deletePlaylist) return
    setSaving(true); setFormError(null)
    try {
      await api.playlists.remove(deletePlaylist.id)
      setPlaylists((items) => items.filter((item) => item.id !== deletePlaylist.id))
      setDeletePlaylist(null)
    } catch (reason) { setFormError(reason instanceof Error ? reason.message : 'Не удалось удалить плейлист.') }
    finally { setSaving(false) }
  }

  return <PlaylistShell>
    <FuzePageHeader eyebrow="Tape archive" title="Playlists" description="Keep saved tracks together and arrange them in the order you want." actions={<><FuzeButton onClick={() => setImportOpen(true)} icon={<DownloadSimple size={17} />}>Import</FuzeButton><FuzeButton variant="primary" onClick={() => { setFormError(null); setCreateOpen(true) }} icon={<Plus size={17} weight="bold" />}>New playlist</FuzeButton></>} />

    {error ? <FuzeState kind="error" title="Playlists could not be loaded" action={<FuzeButton onClick={() => void load()}>Try again</FuzeButton>}>{error}</FuzeState>
    : loading ? <FuzeState kind="loading">LOADING TAPES…</FuzeState>
    : playlists.length === 0 ? <FuzeState title="No playlists yet" action={<FuzeButton onClick={() => setCreateOpen(true)}>Create your first playlist</FuzeButton>}>Create one, then search for tracks to add directly.</FuzeState>
    : <ul className="fuze-collections">{playlists.map((playlist) => <li key={playlist.id}><Link to={`/player/playlists/${playlist.id}`} className="fuze-collection" onContextMenu={(event) => { event.preventDefault(); setMenu({ playlist, x: event.clientX, y: event.clientY }) }}><FuzeCollectionItem title={playlist.title} description={playlist.description} cover={playlist.cover_art} meta={`${playlist.tracks_count} ${playlist.tracks_count === 1 ? 'track' : 'tracks'} · ${formatUpdated(playlist.updated_at)}`} /></Link></li>)}</ul>}

    {menu && <><button className="playlist-menu-dismiss" aria-label="Закрыть контекстное меню" onClick={() => setMenu(null)} /><div className="track-menu playlist-context-menu" role="menu" aria-label={`Действия с плейлистом ${menu.playlist.title}`} style={{ left: Math.max(8, Math.min(menu.x, window.innerWidth - 240)), top: Math.max(8, Math.min(menu.y, window.innerHeight - 148)) }}><button onClick={() => navigate(`/player/playlists/${menu.playlist.id}`)}><PencilSimple />Открыть и редактировать</button><button onClick={() => void openCoverEditor(menu.playlist)}><ImageSquare />Изменить обложку</button><div className="track-menu__separator" /><button className="playlist-context-menu__danger" onClick={() => { setDeletePlaylist(menu.playlist); setMenu(null); setFormError(null) }}><Trash />Удалить плейлист</button></div></>}

    <Dialog open={createOpen} title="Create playlist" description="Give it a clear name. You can change these details later." onClose={() => { if (!saving) setCreateOpen(false) }}>
      <PlaylistForm submitLabel="Create playlist" busy={saving} error={formError} onCancel={() => setCreateOpen(false)} onSubmit={create} />
    </Dialog>
    <Dialog open={importOpen} title="Import playlists" description="Choose a provider or upload an export." onClose={() => setImportOpen(false)}>
      <PlaylistImport onDone={() => void load()} />
    </Dialog>
    <Dialog open={coverPlaylist !== null} title="Обложка плейлиста" description="Загрузите своё изображение или выберите обложку альбома из плейлиста." onClose={() => { if (!saving) setCoverPlaylist(null) }}>
      {coverPlaylist && <><ArtworkEditor value={coverPlaylist.cover_art} title={coverPlaylist.title} square albumCovers={albumCovers} onCancel={() => setCoverPlaylist(null)} onSave={(value) => void saveCover(value)} />{formError && <p role="alert" className="mt-3 text-sm text-red-400">{formError}</p>}</>}
    </Dialog>
    <Dialog open={deletePlaylist !== null} title="Удалить плейлист?" description="Плейлист будет удалён, но сохранённые треки останутся в медиатеке." onClose={() => { if (!saving) setDeletePlaylist(null) }}>
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><button type="button" disabled={saving} onClick={() => setDeletePlaylist(null)} className="min-h-11 rounded-lg px-4 text-sm text-text-secondary hover:bg-hover-strong">Отмена</button><button type="button" disabled={saving} onClick={() => void remove()} className="flex min-h-11 items-center justify-center gap-2 rounded-lg bg-red-700 px-4 text-sm font-semibold text-white disabled:opacity-50"><Trash />Удалить</button></div>{formError && <p role="alert" className="mt-3 text-sm text-red-400">{formError}</p>}
    </Dialog>
  </PlaylistShell>
}
