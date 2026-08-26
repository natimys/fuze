import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useCallback, useEffect, useState } from 'react'
import { DownloadSimple, Plus } from '@phosphor-icons/react'
import { PlaylistImport } from '@/components/playlists/PlaylistImport'
import { PlaylistShell } from '@/components/playlists/PlaylistShell'
import { PlaylistForm } from '@/components/playlists/PlaylistForm'
import { Dialog } from '@/components/ui/Dialog'
import { api } from '@/lib/api'
import type { PlaylistCreate, PlaylistSummary } from '@/lib/types'
import { FuzeButton, FuzeCollectionItem, FuzePageHeader, FuzeState } from '@/components/fuze'

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

  return <PlaylistShell>
    <FuzePageHeader eyebrow="Tape archive" title="Playlists" description="Keep saved tracks together and arrange them in the order you want." actions={<><FuzeButton onClick={() => setImportOpen(true)} icon={<DownloadSimple size={17} />}>Import</FuzeButton><FuzeButton variant="primary" onClick={() => { setFormError(null); setCreateOpen(true) }} icon={<Plus size={17} weight="bold" />}>New playlist</FuzeButton></>} />

    {error ? <FuzeState kind="error" title="Playlists could not be loaded" action={<FuzeButton onClick={() => void load()}>Try again</FuzeButton>}>{error}</FuzeState>
    : loading ? <FuzeState kind="loading">LOADING TAPES…</FuzeState>
    : playlists.length === 0 ? <FuzeState title="No playlists yet" action={<FuzeButton onClick={() => setCreateOpen(true)}>Create your first playlist</FuzeButton>}>Create one, then search for tracks to add directly.</FuzeState>
    : <ul className="fuze-collections">{playlists.map((playlist) => <li key={playlist.id}><Link to={`/player/playlists/${playlist.id}`} className="fuze-collection"><FuzeCollectionItem title={playlist.title} description={playlist.description} meta={`${playlist.tracks_count} ${playlist.tracks_count === 1 ? 'track' : 'tracks'} · ${formatUpdated(playlist.updated_at)}`} /></Link></li>)}</ul>}

    <Dialog open={createOpen} title="Create playlist" description="Give it a clear name. You can change these details later." onClose={() => { if (!saving) setCreateOpen(false) }}>
      <PlaylistForm submitLabel="Create playlist" busy={saving} error={formError} onCancel={() => setCreateOpen(false)} onSubmit={create} />
    </Dialog>
    <Dialog open={importOpen} title="Import playlists" description="Choose a provider or upload an export." onClose={() => setImportOpen(false)}>
      <PlaylistImport onDone={() => void load()} />
    </Dialog>
  </PlaylistShell>
}
