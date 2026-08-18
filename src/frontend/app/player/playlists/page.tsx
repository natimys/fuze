'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowRight, MusicNotes, Plus } from '@phosphor-icons/react'
import { PlaylistShell } from '@/components/playlists/PlaylistShell'
import { PlaylistForm } from '@/components/playlists/PlaylistForm'
import { Dialog } from '@/components/ui/Dialog'
import { api } from '@/lib/api'
import type { PlaylistCreate, PlaylistSummary } from '@/lib/types'

function formatUpdated(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.valueOf()) ? '' : new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(date)
}

export default function PlaylistsPage() {
  const router = useRouter()
  const [playlists, setPlaylists] = useState<PlaylistSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true); setError(null)
    try { setPlaylists(await api.playlists.list(signal)) }
    catch (reason) { if (!signal?.aborted) setError(reason instanceof Error ? reason.message : 'Unable to load playlists.') }
    finally { if (!signal?.aborted) setLoading(false) }
  }, [])

  useEffect(() => { const controller = new AbortController(); void load(controller.signal); return () => controller.abort() }, [load])

  async function create(value: PlaylistCreate) {
    setSaving(true); setFormError(null)
    try {
      const playlist = await api.playlists.create(value)
      setCreateOpen(false)
      router.push(`/player/playlists/${playlist.id}`)
    } catch (reason) { setFormError(reason instanceof Error ? reason.message : 'Unable to create playlist.') }
    finally { setSaving(false) }
  }

  return <PlaylistShell>
    <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
      <div><h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Playlists</h1><p className="mt-2 max-w-xl text-sm text-text-muted">Keep saved tracks together and arrange them in the order you want.</p></div>
      <button type="button" onClick={() => { setFormError(null); setCreateOpen(true) }} className="flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-text-primary px-4 text-sm font-semibold text-bg transition-transform active:scale-[.98] sm:w-auto"><Plus size={17} weight="bold" />New playlist</button>
    </div>

    {error ? <section role="alert" className="mt-10 rounded-xl border border-red-500/20 bg-red-500/10 p-5"><h2 className="font-medium text-red-300">Playlists could not be loaded</h2><p className="mt-1 text-sm text-red-300/80">{error}</p><button type="button" onClick={() => void load()} className="mt-4 min-h-10 rounded-lg border border-red-300/20 px-3 text-sm text-red-200 hover:bg-red-500/10">Try again</button></section>
    : loading ? <div className="mt-10 grid gap-3 sm:grid-cols-2" role="status" aria-label="Loading playlists">{[0, 1, 2, 3].map((item) => <div key={item} className="h-32 animate-pulse rounded-xl bg-surface" />)}</div>
    : playlists.length === 0 ? <section className="mt-10 flex min-h-64 flex-col items-center justify-center rounded-xl border border-dashed border-border-thick px-6 text-center"><MusicNotes size={30} className="text-text-muted" aria-hidden="true" /><h2 className="mt-4 text-base font-semibold">No playlists yet</h2><p className="mt-1 max-w-sm text-sm text-text-muted">Create one, then add any ready track from your current queue.</p><button type="button" onClick={() => setCreateOpen(true)} className="mt-5 min-h-11 rounded-lg border border-border-thick bg-surface px-4 text-sm font-medium hover:bg-surface-raised">Create your first playlist</button></section>
    : <ul className="mt-10 grid gap-3 sm:grid-cols-2">{playlists.map((playlist) => <li key={playlist.id}><Link href={`/player/playlists/${playlist.id}`} className="group flex min-h-32 flex-col rounded-xl border border-border bg-surface p-5 transition-colors hover:border-border-thick hover:bg-surface-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-text-primary"><div className="flex items-start gap-4"><div className="min-w-0 flex-1"><h2 className="truncate text-base font-semibold">{playlist.title}</h2>{playlist.description && <p className="mt-1 line-clamp-2 text-sm text-text-muted">{playlist.description}</p>}</div><ArrowRight size={18} className="mt-1 shrink-0 text-text-muted transition-transform group-hover:translate-x-0.5" /></div><div className="mt-auto flex items-center justify-between gap-4 pt-4 text-xs text-text-muted"><span>{playlist.tracks_count} {playlist.tracks_count === 1 ? 'track' : 'tracks'}</span><span>{formatUpdated(playlist.updated_at)}</span></div></Link></li>)}</ul>}

    <Dialog open={createOpen} title="Create playlist" description="Give it a clear name. You can change these details later." onClose={() => { if (!saving) setCreateOpen(false) }}>
      <PlaylistForm submitLabel="Create playlist" busy={saving} error={formError} onCancel={() => setCreateOpen(false)} onSubmit={create} />
    </Dialog>
  </PlaylistShell>
}
