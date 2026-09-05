import { useEffect, useState } from 'react'
import { PlaylistShell } from '@/components/playlists/PlaylistShell'
import { FuzeButton, FuzeField, FuzePageHeader, FuzePanel, FuzeSelect } from '@/components/fuze'
import { offlineMediaRepository, type StorageUsage } from '@/services/offlineMediaRepository'
import { useNavigate } from 'react-router-dom'
import { platform } from '@/platform'
import { readInstanceConfig } from '@/services/runtimeConfig'
import { useI18n } from '@/lib/i18n'
import { api, ApiError } from '@/lib/api'

export default function SettingsPage() {
  const { locale, setLocale, t } = useI18n()
  const navigate = useNavigate()
  const [usage, setUsage] = useState<StorageUsage | null>(null)
  const [quality, setQuality] = useState(() => localStorage.getItem('fuze-download-quality') ?? 'original')
  const [accountError, setAccountError] = useState<string | null>(null)
  const formatBytes = (bytes: number | null) => bytes === null ? t('unknown') : new Intl.NumberFormat(locale, { style: 'unit', unit: 'megabyte', maximumFractionDigits: 1 }).format(bytes / 1024 ** 2)
  const refresh = () => void offlineMediaRepository.usage().then(setUsage)
  useEffect(refresh, [])
  return <PlaylistShell>
    <FuzePageHeader eyebrow={t('thisDevice')} title={t('settingsTitle')} description={t('settingsDescription')} />
    <FuzePanel title={t('language')}><FuzeField label={t('language')}><FuzeSelect value={locale} onChange={(event) => setLocale(event.target.value as 'ru' | 'en')}><option value="ru">{t('russian')}</option><option value="en">{t('english')}</option></FuzeSelect></FuzeField></FuzePanel>
    <FuzePanel title={t('offlineMedia')}>
      <p>{formatBytes(usage?.usage ?? null)} {t('used')} · {formatBytes(usage?.quota ?? null)} {t('available')}</p>
      <p>{t('persistentStorage')}: {usage?.persistent === true ? t('granted') : usage?.persistent === false ? t('notGranted') : t('unavailable')}. {t('storageWarning')}</p>
      <div className="fuze-actions"><FuzeButton onClick={async () => { await offlineMediaRepository.requestPersistentStorage(); refresh() }}>{t('requestStorage')}</FuzeButton><FuzeButton variant="danger" onClick={async () => { if (window.confirm(t('clearConfirm'))) { await offlineMediaRepository.clear(); refresh() } }}>{t('clearMedia')}</FuzeButton></div>
      <FuzeField label={t('quality')}><FuzeSelect value={quality} onChange={(event) => { setQuality(event.target.value); localStorage.setItem('fuze-download-quality', event.target.value) }}><option value="original">{t('original')}</option><option value="balanced">{t('balanced')}</option><option value="compact">{t('compact')}</option></FuzeSelect></FuzeField>
    </FuzePanel>
    {platform.isNative && <FuzePanel title={t('instance')}>
      <p>Backend: {readInstanceConfig()?.backendUrl}</p>
      <p>Frontend: {readInstanceConfig()?.frontendUrl}</p>
      <div className="fuze-actions"><FuzeButton onClick={() => navigate('/setup')}>{t('changeInstance')}</FuzeButton></div>
    </FuzePanel>}
    <FuzePanel title={t('legal')}><p>{t('legalText')}</p><div className="fuze-actions"><FuzeButton onClick={() => navigate('/privacy')}>{t('privacy')}</FuzeButton><FuzeButton onClick={() => navigate('/terms')}>{t('terms')}</FuzeButton></div></FuzePanel>
    <FuzePanel title={t('deleteAccount')}><p>{t('deleteWarning')}</p><FuzeButton variant="danger" onClick={async () => { if (!window.confirm(t('deleteWarning'))) return; setAccountError(null); try { await api.auth.deleteAccount(); location.assign('/auth') } catch (reason) { setAccountError(reason instanceof ApiError && reason.status === 409 ? t('deleteBlocked') : reason instanceof Error ? reason.message : t('unavailable')) } }}>{t('deleteAccount')}</FuzeButton>{accountError && <p role="alert" className="fuze-alert">{accountError}</p>}</FuzePanel>
  </PlaylistShell>
}
