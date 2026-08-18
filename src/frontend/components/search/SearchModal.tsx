'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { ArrowSquareOut, Check, MagnifyingGlass, MusicNote, Play, Plus, Spinner, X } from '@phosphor-icons/react'
import { api } from '@/lib/api'
import { usePlayerStore } from '@/lib/store'
import type { TrackAvailability, TrackRead, TrackSearchResult } from '@/lib/types'

interface Props { isOpen: boolean; onClose: () => void }
const sleep = (ms: number, signal: AbortSignal) => new Promise<void>((resolve, reject) => {
  const id = window.setTimeout(resolve, ms)
  signal.addEventListener('abort', () => { clearTimeout(id); reject(new DOMException('Aborted', 'AbortError')) }, { once: true })
})

export function SearchModal({ isOpen, onClose }: Props) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<TrackSearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState<Record<string, TrackAvailability>>({})
  const [error, setError] = useState<string | null>(null)
  const [spotifyUrl, setSpotifyUrl] = useState<string | null>(null)
  const [providerMessages, setProviderMessages] = useState<string[]>([])
  const inputRef = useRef<HTMLInputElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const previousFocus = useRef<HTMLElement | null>(null)
  const searchController = useRef<AbortController | null>(null)
  const acquireControllers = useRef(new Map<string, AbortController>())
  const sequence = useRef(0)
  const addToQueue = usePlayerStore((s) => s.addToQueue)
  const setCurrentTrack = usePlayerStore((s) => s.setCurrentTrack)

  const close = useCallback(() => {
    searchController.current?.abort()
    acquireControllers.current.forEach((controller) => controller.abort())
    acquireControllers.current.clear()
    onClose()
  }, [onClose])

  useEffect(() => {
    if (isOpen) { previousFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null; inputRef.current?.focus() }
    else { setQuery(''); setResults([]); setError(null); setBusy({}); sequence.current += 1 }
    return () => { searchController.current?.abort(); if (isOpen) previousFocus.current?.focus() }
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); close(); return }
      if (event.key !== 'Tab' || !panelRef.current) return
      const controls = [...panelRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], input:not([disabled]), [tabindex]:not([tabindex="-1"])')]
      if (!controls.length) { event.preventDefault(); return }
      const index = controls.indexOf(document.activeElement as HTMLElement)
      if (event.shiftKey && index <= 0) { event.preventDefault(); controls.at(-1)?.focus() }
      else if (!event.shiftKey && index === controls.length - 1) { event.preventDefault(); controls[0].focus() }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [isOpen, close])

  useEffect(() => {
    searchController.current?.abort()
    const q = query.trim()
    if (q.length < 2) {
      setResults([])
      setLoading(false)
      setError(null)
      setSpotifyUrl(null)
      setProviderMessages([])
      return
    }
    const controller = new AbortController()
    searchController.current = controller
    const requestId = ++sequence.current
    const timer = window.setTimeout(async () => {
      setLoading(true); setError(null)
      try {
        const response = await api.tracks.search(q, controller.signal)
        if (requestId !== sequence.current) return
        setResults(response.data)
        setSpotifyUrl(response.spotify_search_url ?? null)
        setProviderMessages(Object.entries(response.providers).filter(([, state]) => state.status !== 'ok').map(([name, state]) => `${name}: ${state.status.replaceAll('_', ' ')}`))
      } catch (reason) {
        if (!controller.signal.aborted && requestId === sequence.current) {
          setResults([])
          setSpotifyUrl(null)
          setProviderMessages([])
          setError(reason instanceof Error ? reason.message : 'Search failed.')
        }
      } finally { if (!controller.signal.aborted && requestId === sequence.current) setLoading(false) }
    }, 300)
    return () => { clearTimeout(timer); controller.abort() }
  }, [query])

  const update = (key: string, patch: Partial<TrackSearchResult>) => setResults((items) => items.map((item) => item.key === key ? { ...item, ...patch } : item))

  async function makeReady(track: TrackSearchResult): Promise<TrackSearchResult> {
    if (track.capability === 'external') throw new Error('This result opens in Spotify and cannot be downloaded.')
    if (track.track_id && track.availability === 'ready') return track
    acquireControllers.current.get(track.key)?.abort()
    const controller = new AbortController()
    acquireControllers.current.set(track.key, controller)
    setError(null); setBusy((value) => ({ ...value, [track.key]: 'queued' })); update(track.key, { availability: 'queued' })
    try {
      const acquired = await api.tracks.acquire(track.source, track.source_id)
      let status = acquired.status
      let detail: TrackRead | null = null
      const deadline = Date.now() + 15 * 60 * 1000
      while (status === 'queued' || status === 'downloading') {
        if (Date.now() >= deadline) throw new Error('Track preparation timed out. You can retry later.')
        setBusy((value) => ({ ...value, [track.key]: status })); update(track.key, { track_id: acquired.track_id, availability: status })
        await sleep(1200, controller.signal)
        detail = await api.tracks.get(acquired.track_id, controller.signal)
        status = detail.download_status
      }
      if (status === 'failed') throw new Error(detail?.download_error_message ?? 'Track preparation failed. Retry later.')
      const ready = { ...track, track_id: acquired.track_id, availability: 'ready' as const }
      update(track.key, ready)
      return ready
    } finally {
      acquireControllers.current.delete(track.key)
      setBusy((value) => { const copy = { ...value }; delete copy[track.key]; return copy })
    }
  }

  async function act(track: TrackSearchResult, play: boolean) {
    if (track.capability === 'external') {
      if (track.external_url) window.open(track.external_url, '_blank', 'noopener,noreferrer')
      return
    }
    if (busy[track.key]) return
    try {
      const ready = await makeReady(track)
      addToQueue(ready)
      if (play) { setCurrentTrack(ready); close() }
    } catch (reason) {
      if (!(reason instanceof DOMException && reason.name === 'AbortError')) setError(reason instanceof Error ? reason.message : 'Unable to prepare track.')
    }
  }

  const duration = (ms: number | null) => ms ? `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}` : '--:--'

  return <AnimatePresence>{isOpen && <>
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 bg-black/60" onClick={close} aria-hidden="true" />
    <motion.div ref={panelRef} role="dialog" aria-modal="true" aria-label="Search music" initial={{ opacity: 0, scale: .98 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} className="fixed top-[max(1rem,8%)] left-1/2 -translate-x-1/2 z-50 w-[calc(100%-2rem)] max-w-[560px]">
      <div className="bg-surface rounded-xl border border-border shadow-2xl overflow-hidden">
        <div className="flex items-center gap-3 px-4 h-14 border-b border-border">
          <MagnifyingGlass size={18} className="text-text-muted" />
          <input ref={inputRef} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search for music…" aria-label="Search query" className="flex-1 bg-transparent text-sm text-text-primary outline-none" />
          {query && <button type="button" onClick={() => setQuery('')} aria-label="Clear search" className="p-1 text-text-muted"><X size={16} /></button>}
          <button type="button" onClick={close} className="text-[10px] text-text-muted border border-border rounded px-1.5 py-1" aria-label="Close search">ESC</button>
        </div>
        <div className="max-h-[min(65dvh,440px)] overflow-y-auto" aria-live="polite">
          {providerMessages.length > 0 && <div className="px-4 py-2 text-xs text-text-muted">{providerMessages.join(', ')}{spotifyUrl && <>. <a href={spotifyUrl} target="_blank" rel="noreferrer" className="underline">Spotify search</a></>}</div>}
          {error && <div role="alert" className="mx-4 mt-3 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-400">{error}</div>}
          {loading ? <div className="flex justify-center py-12"><Spinner className="animate-spin" size={24} /></div> : results.length ? <div className="p-2">
            {results.map((track) => {
              const state = busy[track.key] ?? track.availability
              return <div key={track.key} className="group flex items-center gap-3 p-2 rounded-lg hover:bg-hover">
                <button type="button" onClick={() => void act(track, true)} disabled={Boolean(busy[track.key])} className="flex flex-1 min-w-0 items-center gap-3 text-left disabled:opacity-60" aria-label={`${track.capability === 'external' ? 'Open' : 'Play'} ${track.title}`}>
                  <div className="w-10 h-10 rounded bg-surface-raised overflow-hidden flex items-center justify-center">{track.cover_url ? <img src={track.cover_url} alt="" className="w-full h-full object-cover" /> : <MusicNote size={17} className="text-text-muted" aria-hidden="true" />}</div>
                  <div className="flex-1 min-w-0"><div className="text-sm text-text-primary truncate">{track.title}</div><div className="text-xs text-text-muted truncate">{track.artist} · {track.source}</div></div>
                  <span className="text-xs text-text-muted font-mono">{duration(track.duration_ms)}</span>
                  {state === 'queued' || state === 'downloading' ? <span className="flex items-center gap-1 text-xs text-text-muted"><Spinner className="animate-spin" />{state}</span> : state === 'ready' ? <Check className="text-green-400" /> : track.capability === 'external' ? <ArrowSquareOut /> : <Play />}
                </button>
                {track.capability === 'acquire' && <button type="button" disabled={Boolean(busy[track.key])} onClick={() => void act(track, false)} aria-label={`Add ${track.title} to queue`} className="p-2 rounded-full text-text-secondary hover:bg-hover-strong disabled:opacity-40"><Plus size={15} /></button>}
              </div>
            })}
          </div> : query.length >= 2 ? <p className="py-12 text-center text-sm text-text-muted">No results found</p> : <p className="py-12 text-center text-sm text-text-muted">Type at least two characters</p>}
        </div>
      </div>
    </motion.div>
  </>}</AnimatePresence>
}
