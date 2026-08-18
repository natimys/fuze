'use client'

import Link from 'next/link'
import { use, useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowDown, ArrowLeft, ArrowUp, MusicNotes, PencilSimple, Play, Plus, Spinner, Trash, X } from '@phosphor-icons/react'
import { PlaylistShell } from '@/components/playlists/PlaylistShell'
import { PlaylistForm } from '@/components/playlists/PlaylistForm'
import { Dialog } from '@/components/ui/Dialog'
import { api } from '@/lib/api'
import { usePlayerStore } from '@/lib/store'
import type { PlaylistDetail, PlaylistTrack, TrackRead, TrackSearchResult } from '@/lib/types'

function playable(track: TrackRead): TrackSearchResult {
  return { key: `track:${track.id}`, track_id: track.id, source: track.source, capability: 'acquire', availability: 'ready', title: track.title, artist: track.artist, album: track.album, year: track.release_year, duration_ms: track.duration_ms, cover_url: track.cover_url, source_id: track.source_id, external_url: null }
}

function duration(ms: number | null) {
  if (!ms) return '--:--'
  const seconds = Math.floor(ms / 1000)
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}

export default function PlaylistDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const playlistId = Number(id)
  const router = useRouter()
  const queue = usePlayerStore((state) => state.queue)
  const currentTrack = usePlayerStore((state) => state.currentTrack)
  const addToQueue = usePlayerStore((state) => state.addToQueue)
  const setCurrentTrack = usePlayerStore((state) => state.setCurrentTrack)
  const [playlist, setPlaylist] = useState<PlaylistDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editOpen, setEditOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [itemBusy, setItemBusy] = useState<number | null>(null)

  const candidates = useMemo(() => {
    const values = currentTrack ? [currentTrack, ...queue] : queue
    return [...new Map(values.filter((track) => track.track_id && track.availability === 'ready').map((track) => [track.track_id, track])).values()]
  }, [currentTrack, queue])

  const load = useCallback(async (signal?: AbortSignal) => {
    if (!Number.isInteger(playlistId) || playlistId <= 0) { setError('This playlist address is invalid.'); setLoading(false); return }
    setLoading(true); setError(null)
    try { setPlaylist(await api.playlists.get(playlistId, signal)) }
    catch (reason) { if (!signal?.aborted) setError(reason instanceof Error ? reason.message : 'Unable to load this playlist.') }
    finally { if (!signal?.aborted) setLoading(false) }
  }, [playlistId])
  useEffect(() => { const controller = new AbortController(); void load(controller.signal); return () => controller.abort() }, [load])

  async function update(value: { title: string; description: string | null }) {
    setBusy(true); setActionError(null)
    try { const updated = await api.playlists.update(playlistId, value); setPlaylist((current) => current ? { ...current, ...updated } : current); setEditOpen(false) }
    catch (reason) { setActionError(reason instanceof Error ? reason.message : 'Unable to update playlist.') }
    finally { setBusy(false) }
  }
  async function removePlaylist() {
    setBusy(true); setActionError(null)
    try { await api.playlists.remove(playlistId); router.push('/player/playlists') }
    catch (reason) { setActionError(reason instanceof Error ? reason.message : 'Unable to delete playlist.'); setBusy(false) }
  }
  async function add(trackId: number) {
    setItemBusy(trackId); setActionError(null)
    try {
      const item = await api.playlists.addItem(playlistId, trackId)
      setPlaylist((current) => current ? { ...current, tracks_count: current.tracks_count + 1, items: [...current.items, item] } : current)
      setAddOpen(false)
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
  async function move(itemId: number, delta: -1 | 1) {
    if (!playlist || itemBusy !== null) return
    const from = playlist.items.findIndex((item) => item.id === itemId)
    const to = from + delta
    if (from < 0 || to < 0 || to >= playlist.items.length) return
    const previous = playlist
    const items = [...playlist.items]
    ;[items[from], items[to]] = [items[to], items[from]]
    const positioned = items.map((item, position) => ({ ...item, position }))
    setPlaylist({ ...playlist, items: positioned }); setItemBusy(itemId); setActionError(null)
    try { setPlaylist(await api.playlists.reorder(playlistId, { item_ids: positioned.map((item) => item.id) })) }
    catch (reason) { setPlaylist(previous); setActionError(reason instanceof Error ? reason.message : 'Unable to reorder tracks.') }
    finally { setItemBusy(null) }
  }
  function play(item: PlaylistTrack) { const track = queue.find((value) => value.track_id === item.track.id) ?? playable(item.track); addToQueue(track); setCurrentTrack(track); router.push('/player') }

  return <PlaylistShell>
    <Link href="/player/playlists" className="inline-flex min-h-10 items-center gap-2 rounded-lg pr-3 text-sm text-text-muted hover:text-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-text-primary"><ArrowLeft size={17} />All playlists</Link>
    {error ? <section role="alert" className="mt-6 rounded-xl border border-red-500/20 bg-red-500/10 p-5"><h1 className="font-medium text-red-300">Playlist could not be loaded</h1><p className="mt-1 text-sm text-red-300/80">{error}</p><button type="button" onClick={() => void load()} className="mt-4 min-h-10 rounded-lg border border-red-300/20 px-3 text-sm text-red-200">Try again</button></section>
    : loading || !playlist ? <div className="mt-6" role="status" aria-label="Loading playlist"><div className="h-10 w-64 animate-pulse rounded-lg bg-surface" /><div className="mt-8 h-72 animate-pulse rounded-xl bg-surface" /></div>
    : <>
      <div className="mt-5 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between"><div className="min-w-0"><h1 className="break-words text-3xl font-semibold tracking-tight sm:text-4xl">{playlist.title}</h1>{playlist.description && <p className="mt-2 max-w-2xl text-sm text-text-muted">{playlist.description}</p>}<p className="mt-3 text-xs text-text-muted">{playlist.tracks_count} {playlist.tracks_count === 1 ? 'track' : 'tracks'}</p></div><div className="flex flex-wrap gap-2"><button type="button" onClick={() => { setActionError(null); setEditOpen(true) }} className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg border border-border-thick bg-surface px-4 text-sm hover:bg-surface-raised sm:flex-none"><PencilSimple size={17} />Edit</button><button type="button" onClick={() => { setActionError(null); setAddOpen(true) }} className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg bg-text-primary px-4 text-sm font-semibold text-bg active:scale-[.98] sm:flex-none"><Plus size={17} weight="bold" />Add tracks</button></div></div>
      {actionError && <p role="alert" className="mt-5 rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">{actionError}</p>}
      {playlist.items.length === 0 ? <section className="mt-8 flex min-h-64 flex-col items-center justify-center rounded-xl border border-dashed border-border-thick px-6 text-center"><MusicNotes size={30} className="text-text-muted" /><h2 className="mt-4 font-semibold">This playlist is empty</h2><p className="mt-1 max-w-sm text-sm text-text-muted">Search for music, add it to your queue, then choose it here.</p><button type="button" onClick={() => setAddOpen(true)} className="mt-5 min-h-11 rounded-lg border border-border-thick bg-surface px-4 text-sm font-medium">Choose from queue</button></section>
      : <ol className="mt-8 overflow-hidden rounded-xl border border-border bg-surface" aria-label="Playlist tracks">{playlist.items.map((item, index) => <li key={item.id} className="flex min-w-0 items-center gap-2 border-b border-border p-2 last:border-b-0 sm:gap-3 sm:p-3"><span className="w-7 shrink-0 text-center font-mono text-xs text-text-muted">{index + 1}</span><button type="button" onClick={() => play(item)} className="group flex min-w-0 flex-1 items-center gap-3 rounded-lg p-1 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-text-primary" aria-label={`Play ${item.track.title}`}><div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-surface-raised">{item.track.cover_url ? <img src={item.track.cover_url} alt="" className="h-full w-full object-cover" /> : <MusicNotes className="text-text-muted" />}</div><div className="min-w-0 flex-1"><div className="truncate text-sm font-medium">{item.track.title}</div><div className="truncate text-xs text-text-muted">{item.track.artist}</div></div><span className="hidden font-mono text-xs text-text-muted sm:block">{duration(item.track.duration_ms)}</span><Play size={16} className="hidden shrink-0 text-text-muted group-hover:block sm:block" /></button><div className="flex shrink-0"><button type="button" disabled={index === 0 || itemBusy !== null} onClick={() => void move(item.id, -1)} className="min-h-10 min-w-10 rounded-lg p-2 text-text-muted hover:bg-hover-strong hover:text-text-primary disabled:opacity-25" aria-label={`Move ${item.track.title} up`}><ArrowUp size={16} className="mx-auto" /></button><button type="button" disabled={index === playlist.items.length - 1 || itemBusy !== null} onClick={() => void move(item.id, 1)} className="min-h-10 min-w-10 rounded-lg p-2 text-text-muted hover:bg-hover-strong hover:text-text-primary disabled:opacity-25" aria-label={`Move ${item.track.title} down`}><ArrowDown size={16} className="mx-auto" /></button><button type="button" disabled={itemBusy !== null} onClick={() => void removeItem(item.id)} className="min-h-10 min-w-10 rounded-lg p-2 text-text-muted hover:bg-red-500/10 hover:text-red-300 disabled:opacity-40" aria-label={`Remove ${item.track.title}`}><X size={16} className="mx-auto" /></button></div></li>)}</ol>}
      <button type="button" onClick={() => { setActionError(null); setDeleteOpen(true) }} className="mt-8 flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm text-red-400 hover:bg-red-500/10"><Trash size={17} />Delete playlist</button>
      <Dialog open={editOpen} title="Edit playlist" onClose={() => { if (!busy) setEditOpen(false) }}><PlaylistForm initialTitle={playlist.title} initialDescription={playlist.description} submitLabel="Save changes" busy={busy} error={actionError} onCancel={() => setEditOpen(false)} onSubmit={update} /></Dialog>
      <Dialog open={deleteOpen} title="Delete playlist?" description="The playlist will be removed. Your saved tracks will not be deleted." onClose={() => { if (!busy) setDeleteOpen(false) }}><div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><button type="button" disabled={busy} onClick={() => setDeleteOpen(false)} className="min-h-11 rounded-lg px-4 text-sm text-text-secondary hover:bg-hover-strong">Cancel</button><button type="button" disabled={busy} onClick={() => void removePlaylist()} className="flex min-h-11 items-center justify-center gap-2 rounded-lg bg-red-700 px-4 text-sm font-semibold text-white disabled:opacity-50">{busy && <Spinner className="animate-spin" />}Delete playlist</button></div>{actionError && <p role="alert" className="mt-3 text-sm text-red-400">{actionError}</p>}</Dialog>
      <Dialog open={addOpen} title="Add from your queue" description="Ready tracks from the current player queue are available here." onClose={() => { if (itemBusy === null) setAddOpen(false) }}>{candidates.length === 0 ? <div className="rounded-lg border border-dashed border-border-thick p-6 text-center"><p className="text-sm text-text-secondary">There are no ready tracks in your queue.</p><p className="mt-1 text-xs text-text-muted">Use music search first, then return here.</p></div> : <ul className="max-h-[min(55dvh,360px)] space-y-1 overflow-y-auto">{candidates.map((track) => <li key={track.track_id}><button type="button" disabled={itemBusy !== null} onClick={() => void add(track.track_id!)} className="flex min-h-14 w-full items-center gap-3 rounded-lg px-2 text-left hover:bg-hover-strong disabled:opacity-50"><div className="h-10 w-10 shrink-0 overflow-hidden rounded-lg bg-surface-raised">{track.cover_url && <img src={track.cover_url} alt="" className="h-full w-full object-cover" />}</div><div className="min-w-0 flex-1"><div className="truncate text-sm font-medium">{track.title}</div><div className="truncate text-xs text-text-muted">{track.artist}</div></div>{itemBusy === track.track_id ? <Spinner className="animate-spin" /> : <Plus size={17} />}</button></li>)}</ul>}{actionError && <p role="alert" className="mt-3 text-sm text-red-400">{actionError}</p>}</Dialog>
    </>}
  </PlaylistShell>
}
