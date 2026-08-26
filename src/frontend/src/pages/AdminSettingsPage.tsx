import { useCallback, useEffect, useMemo, useState } from 'react'
import { api, ApiError } from '@/lib/api'
import type { AdminSettings, AdminSettingsWrite, ProviderTest, SystemStatus, UserPublic, UserRole } from '@/lib/types'
import { usePlayerStore } from '@/lib/store'
import { PlaylistShell } from '@/components/playlists/PlaylistShell'
import { FuzeButton, FuzePageHeader, FuzePanel, FuzeState } from '@/components/fuze'

const inputClass = 'fuze-input'
const buttonClass = 'fuze-button fuze-button--secondary'

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <FuzePanel title={title}>{children}</FuzePanel>
}

export default function SettingsPage() {
  const currentUser = usePlayerStore((state) => state.user)
  const setPublicConfig = usePlayerStore((state) => state.setConfig)
  const [settings, setSettings] = useState<AdminSettings | null>(null)
  const [draft, setDraft] = useState<AdminSettings | null>(null)
  const [system, setSystem] = useState<SystemStatus | null>(null)
  const [users, setUsers] = useState<UserPublic[]>([])
  const [userPage, setUserPage] = useState(1)
  const [userTotal, setUserTotal] = useState(0)
  const [search, setSearch] = useState('')
  const [credentials, setCredentials] = useState<Record<string, string>>({})
  const [removeCredentials, setRemoveCredentials] = useState<Record<string, boolean>>({})
  const [providerTests, setProviderTests] = useState<Record<string, ProviderTest>>({})
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setError(null)
    try {
      const [nextSettings, nextSystem] = await Promise.all([api.admin.settings(), api.admin.system()])
      setSettings(nextSettings); setDraft(nextSettings); setSystem(nextSystem)
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to load settings') }
  }, [])

  const loadUsers = useCallback(async () => {
    try { const result = await api.admin.users(userPage, 20, search); setUsers(result.data); setUserTotal(result.total) }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to load users') }
  }, [search, userPage])

  useEffect(() => { if (currentUser?.role === 'admin') void load() }, [currentUser?.role, load])
  useEffect(() => { if (currentUser?.role === 'admin') void loadUsers() }, [currentUser?.role, loadUsers])

  const changes = useMemo(() => {
    if (!settings || !draft) return []
    const result: string[] = []
    if (settings.instance_name !== draft.instance_name) result.push('instance name')
    if (JSON.stringify(settings.auth) !== JSON.stringify(draft.auth)) result.push('authentication')
    if (JSON.stringify(settings.features) !== JSON.stringify(draft.features)) result.push('playback')
    if (JSON.stringify(settings.providers) !== JSON.stringify(draft.providers)) result.push('providers')
    if (Object.values(credentials).some(Boolean) || Object.values(removeCredentials).some(Boolean)) result.push('provider credentials')
    return result
  }, [credentials, draft, removeCredentials, settings])

  async function save() {
    if (!draft || !settings || changes.length === 0) return
    const disablesCapability = (settings.auth.mode !== draft.auth.mode) || (Object.keys(settings.providers) as Array<keyof AdminSettings['providers']>).some((key) => typeof settings.providers[key] === 'boolean' && settings.providers[key] && draft.providers[key] === false)
    if (disablesCapability && !window.confirm(`Save changes to ${changes.join(', ')}? Existing sessions or provider operations may be affected.`)) return
    const credentialPayload: Record<string, string | null> = {}
    for (const name of ['yandex_token', 'spotify_client_id', 'spotify_client_secret']) {
      if (removeCredentials[name]) credentialPayload[name] = null
      else if (credentials[name]) credentialPayload[name] = credentials[name]
    }
    const payload: AdminSettingsWrite = { version: settings.version, instance_name: draft.instance_name, auth: draft.auth, features: draft.features, providers: draft.providers }
    if (Object.keys(credentialPayload).length) payload.credentials = credentialPayload
    setBusy(true); setError(null); setMessage(null)
    try {
      const saved = await api.admin.saveSettings(payload)
      setSettings(saved); setDraft(saved); setCredentials({}); setRemoveCredentials({})
      const publicConfig = await api.config(); setPublicConfig(publicConfig)
      setMessage(`Saved configuration version ${saved.version}.`)
    } catch (reason) {
      if (reason instanceof ApiError && reason.status === 409) setError('This configuration was changed elsewhere. Reload the latest version before saving again.')
      else setError(reason instanceof Error ? reason.message : 'Save failed')
    } finally { setBusy(false) }
  }

  async function testProvider(provider: 'youtube' | 'yandex' | 'spotify') {
    setProviderTests((value) => ({ ...value, [provider]: { status: 'unavailable', latency_ms: 0, message: 'Testing…' } }))
    try {
      const result = await api.admin.testProvider(provider)
      setProviderTests((value) => ({ ...value, [provider]: result }))
    }
    catch (reason) { setProviderTests((value) => ({ ...value, [provider]: { status: 'unavailable', latency_ms: 0, message: reason instanceof Error ? reason.message : 'Test failed' } })) }
  }

  async function updateUser(user: UserPublic, values: { role?: UserRole; is_active?: boolean; password?: string }) {
    setError(null)
    try { await api.admin.updateUser(user.id, values); await loadUsers() }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'User update failed') }
  }

  async function createUser(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    try {
      await api.admin.createUser({ name: String(data.get('name')), email: String(data.get('email')), password: String(data.get('password')), role: String(data.get('role')) as UserRole })
      event.currentTarget.reset(); await loadUsers()
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'User creation failed') }
  }

  if (currentUser && currentUser.role !== 'admin') return <PlaylistShell><FuzeState kind="error" title="403 — administrator access required" /></PlaylistShell>

  return <PlaylistShell>
    <FuzePageHeader eyebrow="Instance control" title="Admin Settings" description="Instance configuration is applied to API and workers within five seconds." actions={<FuzeButton onClick={() => void load()}>Reload</FuzeButton>} />
    {error && <div role="alert" className="fuze-alert">{error}</div>}
    {message && <div role="status" className="fuze-alert fuze-alert--success">{message}</div>}
    {!draft ? <FuzeState kind="loading">LOADING SETTINGS…</FuzeState> : <div className="fuze-section-grid">
      <Section title="General"><label className="block text-sm text-text-secondary">Instance name<input className={inputClass} value={draft.instance_name} maxLength={100} onChange={(event) => setDraft({ ...draft, instance_name: event.target.value })} /></label><p className="text-xs text-text-muted">Configuration version {draft.version} · application {system?.app_version ?? '…'} · schema {system?.schema_revision ?? '…'}</p></Section>
      <Section title="Authentication"><label className="block text-sm text-text-secondary">Login methods<select className={inputClass} value={draft.auth.mode} onChange={(event) => setDraft({ ...draft, auth: { ...draft.auth, mode: event.target.value as AdminSettings['auth']['mode'] } })}><option value="password">Password</option><option value="key">Access key</option><option value="both">Password and access key</option></select></label><label className="flex items-center gap-3 text-sm"><input type="checkbox" checked={draft.auth.registration} disabled={draft.auth.mode === 'key'} onChange={(event) => setDraft({ ...draft, auth: { ...draft.auth, registration: event.target.checked } })} />Allow public registration</label></Section>
      <Section title="Providers">
        {(['youtube', 'yandex', 'spotify'] as const).map((provider) => <div key={provider} className="rounded-lg border border-border p-4"><div className="flex flex-wrap items-center gap-3"><label className="flex flex-1 items-center gap-3 text-sm font-medium capitalize"><input type="checkbox" checked={draft.providers[provider]} onChange={(event) => setDraft({ ...draft, providers: { ...draft.providers, [provider]: event.target.checked } })} />{provider}</label><button type="button" className={buttonClass} onClick={() => void testProvider(provider)}>Test connection</button></div>{providerTests[provider] && <p className="mt-2 text-xs text-text-muted">{providerTests[provider].message} {providerTests[provider].latency_ms ? `(${providerTests[provider].latency_ms} ms)` : ''}</p>}</div>)}
        {(['yandex_token', 'spotify_client_id', 'spotify_client_secret'] as const).map((name) => <div key={name}><label className="block text-sm text-text-secondary">{name.replaceAll('_', ' ')} · {draft.credentials[name].configured ? 'configured' : 'not configured'}<input className={inputClass} type="password" autoComplete="off" value={credentials[name] ?? ''} disabled={removeCredentials[name]} placeholder="Leave empty to preserve current value" onChange={(event) => setCredentials({ ...credentials, [name]: event.target.value })} /></label><label className="mt-2 flex items-center gap-2 text-xs text-text-muted"><input type="checkbox" checked={Boolean(removeCredentials[name])} onChange={(event) => setRemoveCredentials({ ...removeCredentials, [name]: event.target.checked })} />Remove saved credential</label></div>)}
        <label className="block text-sm text-text-secondary">Spotify market<input className={inputClass} value={draft.providers.spotify_market} maxLength={2} onChange={(event) => setDraft({ ...draft, providers: { ...draft.providers, spotify_market: event.target.value.toUpperCase() } })} /></label>
      </Section>
      <Section title="Users"><form onSubmit={createUser} className="grid gap-3 sm:grid-cols-4"><input required name="name" placeholder="Name" className={inputClass} /><input required name="email" type="email" placeholder="Email" className={inputClass} /><input required name="password" type="password" minLength={8} placeholder="Initial password" className={inputClass} /><div className="flex gap-2"><select name="role" className={inputClass}><option value="user">User</option><option value="admin">Admin</option></select><button className={buttonClass} type="submit">Create</button></div></form><input aria-label="Search users" value={search} onChange={(event) => { setSearch(event.target.value); setUserPage(1) }} placeholder="Search users" className={inputClass} /><div className="divide-y divide-border">{users.map((user) => <div key={user.id} className="flex flex-wrap items-center gap-3 py-3 text-sm"><div className="min-w-48 flex-1"><div className="font-medium">{user.name}</div><div className="text-xs text-text-muted">{user.email}</div></div><select value={user.role} className="h-9 rounded-lg bg-hover-strong px-2" onChange={(event) => void updateUser(user, { role: event.target.value as UserRole })}><option value="user">User</option><option value="admin">Admin</option></select><button className={buttonClass} onClick={() => void updateUser(user, { is_active: !user.is_active })}>{user.is_active ? 'Deactivate' : 'Activate'}</button><button className={buttonClass} onClick={() => { const password = window.prompt(`New password for ${user.email}`); if (password) void updateUser(user, { password }) }}>Reset password</button></div>)}</div><div className="flex items-center justify-between text-xs text-text-muted"><span>{userTotal} users</span><div className="flex gap-2"><button className={buttonClass} disabled={userPage <= 1} onClick={() => setUserPage((value) => value - 1)}>Previous</button><button className={buttonClass} disabled={userPage * 20 >= userTotal} onClick={() => setUserPage((value) => value + 1)}>Next</button></div></div></Section>
      <Section title="System"><div className="grid gap-2 sm:grid-cols-2">{Object.entries(system?.health ?? {}).map(([name, value]) => <div key={name} className="flex items-center justify-between rounded-lg bg-hover px-3 py-2 text-sm"><span className="capitalize">{name}</span><span className={value === 'ok' ? 'text-green-300' : 'text-yellow-300'}>{value}</span></div>)}</div><p className="text-sm text-text-muted">Last backup: {system?.last_backup ?? 'No backup recorded'} · Media objects are not included in daily backups.</p>{Object.entries(system?.commands ?? {}).map(([name, command]) => <div key={name}><div className="text-xs capitalize text-text-muted">{name}</div><code className="mt-1 block select-text overflow-x-auto rounded-lg bg-bg p-3 text-xs">{command}</code></div>)}</Section>
      <div className="sticky bottom-4 flex items-center justify-between gap-4 rounded-xl border border-border-thick bg-surface/95 p-4 shadow-xl backdrop-blur"><p className="text-xs text-text-muted">{changes.length ? `Pending: ${changes.join(', ')}` : 'No pending changes'}</p><button type="button" disabled={busy || changes.length === 0} onClick={() => void save()} className="min-h-11 rounded-lg bg-text-primary px-5 text-sm font-semibold text-bg disabled:opacity-50">{busy ? 'Saving…' : 'Save changes'}</button></div>
    </div>}
  </PlaylistShell>
}
