'use client'
import { useState } from 'react'
import { api } from '@/lib/api'
import type { ImportedTrack, ImportSource, TrackSource } from '@/lib/types'
import { mapImportedTracks, parseCsv } from '@/lib/playlistImport'

export function PlaylistImport({ onDone }: { onDone: () => void }) {
  const [token, setToken] = useState(''), [sources, setSources] = useState<ImportSource[]>([]), [selected, setSelected] = useState<string[]>([])
  const [busy, setBusy] = useState(false), [message, setMessage] = useState<string | null>(null)
  async function connect() { setBusy(true); setMessage(null); try { setSources(await api.playlists.yandexSources(token)) } catch (e) { setMessage(e instanceof Error ? e.message : 'Connection failed') } finally { setBusy(false) } }
  async function importYandex() { setBusy(true); try { const r = await api.playlists.importYandex(token, selected); setMessage(`Imported ${r.tracks_added} tracks`); onDone() } catch (e) { setMessage(e instanceof Error ? e.message : 'Import failed') } finally { setBusy(false) } }
  async function readFile(file: File) {
    setBusy(true); setMessage(null)
    try {
      const text = await file.text(); let rows: Record<string, unknown>[]
      if (file.name.toLowerCase().endsWith('.json')) { const parsed = JSON.parse(text) as unknown; rows = Array.isArray(parsed) ? parsed as Record<string, unknown>[] : (parsed as { tracks?: Record<string, unknown>[] }).tracks ?? [] }
      else rows = parseCsv(text)
      const tracks: ImportedTrack[] = mapImportedTracks(rows, file.name)
      if (!tracks.length) throw new Error('No tracks found. Expected an Exportify CSV or a compatible JSON export.')
      const source: TrackSource = file.name.toLowerCase().includes('yandex') ? 'yandex' : 'spotify'
      const result = await api.playlists.importFile(file.name.replace(/\.(csv|json)$/i, ''), source, tracks); setMessage(`Imported ${result.tracks_added} tracks`); onDone()
    } catch (e) { setMessage(e instanceof Error ? e.message : 'Invalid file') } finally { setBusy(false) }
  }
  return <div className="space-y-6"><section><h3 className="font-semibold">Yandex Music</h3><p className="mt-1 text-sm text-text-muted">Personal OAuth token; it is not stored.</p><div className="mt-3 flex gap-2"><input type="password" value={token} onChange={e => setToken(e.target.value)} placeholder="OAuth token" className="min-h-11 min-w-0 flex-1 rounded-lg border border-border bg-bg px-3" /><button disabled={busy || token.length < 10} onClick={() => void connect()} className="rounded-lg bg-text-primary px-4 text-sm font-semibold text-bg disabled:opacity-40">Connect</button></div>{sources.length > 0 && <div className="mt-3 max-h-48 space-y-2 overflow-auto">{sources.map(p => <label key={p.id} className="flex items-center gap-3 rounded-lg border border-border p-3"><input type="checkbox" checked={selected.includes(p.id)} onChange={e => setSelected(s => e.target.checked ? [...s, p.id] : s.filter(id => id !== p.id))} /><span className="flex-1">{p.title}</span><span className="text-xs text-text-muted">{p.tracks_count}</span></label>)}</div>}{sources.length > 0 && <button disabled={busy || !selected.length} onClick={() => void importYandex()} className="mt-3 min-h-11 rounded-lg bg-text-primary px-4 text-sm font-semibold text-bg disabled:opacity-40">Import selected</button>}</section><section><h3 className="font-semibold">Spotify or file</h3><p className="mt-1 text-sm text-text-muted">Export JSON/CSV from <a className="underline" target="_blank" rel="noreferrer" href="https://www.spotify.com/account/privacy/">Spotify</a> or <a className="underline" target="_blank" rel="noreferrer" href="https://exportify.net/">Exportify</a>.</p><input className="mt-3 block text-sm" type="file" accept=".json,.csv" disabled={busy} onChange={e => { const f = e.target.files?.[0]; if (f) void readFile(f) }} /></section>{message && <p role="status" className="text-sm text-text-muted">{message}</p>}</div>
}
