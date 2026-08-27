import { useEffect, useState } from 'react'
import { DownloadSimple, Pause, Play, Trash } from '@phosphor-icons/react'
import { PlaylistShell } from '@/components/playlists/PlaylistShell'
import { FuzeButton, FuzePageHeader, FuzeState } from '@/components/fuze'
import { api } from '@/lib/api'
import type { OfflineDownload, OfflineDownloadState } from '@/services/offlineMediaRepository'
import { offlineMediaRepository } from '@/services/offlineMediaRepository'

type Filter = 'active' | 'available' | 'failed'
const activeStates: OfflineDownloadState[] = ['queued', 'downloading', 'verifying', 'paused', 'removing']
const formatBytes = (bytes: number) => new Intl.NumberFormat(undefined, { style: 'unit', unit: bytes >= 1024 ** 2 ? 'megabyte' : 'kilobyte', maximumFractionDigits: 1 }).format(bytes / (bytes >= 1024 ** 2 ? 1024 ** 2 : 1024))

export default function DownloadsPage() {
  const [items, setItems] = useState<OfflineDownload[]>([])
  const [filter, setFilter] = useState<Filter>('active')
  const refresh = () => void offlineMediaRepository.list().then((rows) => setItems(rows.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))))
  useEffect(() => { refresh(); return offlineMediaRepository.subscribe(refresh) }, [])
  const visible = items.filter((item) => filter === 'active' ? activeStates.includes(item.state) : filter === 'available' ? item.state === 'available' : ['failed', 'stale'].includes(item.state))

  async function retry(item: OfflineDownload) {
    const descriptor = await api.tracks.download(item.trackId)
    await offlineMediaRepository.resume(item.trackId, descriptor)
  }

  return <PlaylistShell>
    <FuzePageHeader eyebrow="This device" title="Downloads" description="Explicit offline copies stay on this device until you remove them." />
    <div className="fuze-download-filters" role="tablist" aria-label="Download filters">{(['active', 'available', 'failed'] as const).map((value) => <button key={value} role="tab" aria-selected={filter === value} onClick={() => setFilter(value)}>{value}</button>)}</div>
    {visible.length === 0 ? <FuzeState title={`No ${filter} downloads`}><DownloadSimple size={32} />Downloads you start from a track or playlist will appear here.</FuzeState> : <ul className="fuze-download-list">{visible.map((item) => <li key={item.trackId}>
      <div><b>{item.title}</b><span>{item.artist}</span><small>{item.state} · {formatBytes(item.downloadedBytes || item.contentLength)}{item.error ? ` · ${item.error}` : ''}</small></div>
      {item.contentLength > 0 && activeStates.includes(item.state) && <progress value={item.downloadedBytes} max={item.contentLength} aria-label={`Download progress for ${item.title}`} />}
      <div className="fuze-actions">{item.state === 'downloading' || item.state === 'queued' ? <FuzeButton variant="icon" aria-label={`Pause ${item.title}`} onClick={() => offlineMediaRepository.pause(item.trackId)}><Pause /></FuzeButton> : item.state !== 'available' ? <FuzeButton variant="icon" aria-label={`Retry ${item.title}`} onClick={() => retry(item)}><Play /></FuzeButton> : null}<FuzeButton variant="icon" aria-label={`Remove ${item.title}`} onClick={() => offlineMediaRepository.remove(item.trackId)}><Trash /></FuzeButton></div>
    </li>)}</ul>}
  </PlaylistShell>
}
