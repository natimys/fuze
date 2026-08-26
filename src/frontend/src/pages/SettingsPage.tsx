import { useEffect, useState } from 'react'
import { PlaylistShell } from '@/components/playlists/PlaylistShell'
import { FuzeButton, FuzeField, FuzePageHeader, FuzePanel, FuzeSelect } from '@/components/fuze'
import { offlineMediaRepository, type StorageUsage } from '@/services/offlineMediaRepository'
import { useNavigate } from 'react-router-dom'
import { platform } from '@/platform'
import { readInstanceConfig } from '@/services/runtimeConfig'

const formatBytes = (bytes: number | null) => bytes === null ? 'Unknown' : new Intl.NumberFormat(undefined, { style: 'unit', unit: 'megabyte', maximumFractionDigits: 1 }).format(bytes / 1024 ** 2)

export default function SettingsPage() {
  const navigate = useNavigate()
  const [usage, setUsage] = useState<StorageUsage | null>(null)
  const [quality, setQuality] = useState(() => localStorage.getItem('fuze-download-quality') ?? 'original')
  const refresh = () => void offlineMediaRepository.usage().then(setUsage)
  useEffect(refresh, [])
  return <PlaylistShell>
    <FuzePageHeader eyebrow="This device" title="Settings" description="Playback and offline-media preferences for this client." />
    <FuzePanel title="Offline media">
      <p>{formatBytes(usage?.usage ?? null)} used · {formatBytes(usage?.quota ?? null)} available quota</p>
      <p>Persistent browser storage: {usage?.persistent === true ? 'granted' : usage?.persistent === false ? 'not granted' : 'unavailable'}. Browser downloads can still be evicted; the desktop app is more reliable.</p>
      <div className="fuze-actions"><FuzeButton onClick={async () => { await offlineMediaRepository.requestPersistentStorage(); refresh() }}>Request persistent storage</FuzeButton><FuzeButton variant="danger" onClick={async () => { if (window.confirm('Remove every offline track from this device?')) { await offlineMediaRepository.clear(); refresh() } }}>Clear local media</FuzeButton></div>
      <FuzeField label="Quality for future downloads"><FuzeSelect value={quality} onChange={(event) => { setQuality(event.target.value); localStorage.setItem('fuze-download-quality', event.target.value) }}><option value="original">Original</option><option value="balanced">Balanced</option><option value="compact">Compact</option></FuzeSelect></FuzeField>
    </FuzePanel>
    {platform.isNative && <FuzePanel title="Fuze instance">
      <p>Backend: {readInstanceConfig()?.backendUrl}</p>
      <p>Frontend: {readInstanceConfig()?.frontendUrl}</p>
      <div className="fuze-actions"><FuzeButton onClick={() => navigate('/setup')}>Change instance</FuzeButton></div>
    </FuzePanel>}
  </PlaylistShell>
}
