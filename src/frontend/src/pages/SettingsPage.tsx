import { Gear, UserCircle } from '@phosphor-icons/react'
import { PlaylistShell } from '@/components/playlists/PlaylistShell'

export default function SettingsPage() {
  return <PlaylistShell>
    <div className="flex items-center gap-3"><div className="flex h-11 w-11 items-center justify-center rounded-xl bg-surface-raised"><Gear size={22} /></div><div><h1 className="text-3xl font-semibold tracking-tight">Settings</h1><p className="mt-1 text-sm text-text-muted">Personal settings for this client.</p></div></div>
    <section className="mt-8 rounded-xl border border-dashed border-border-thick bg-surface/40 p-8 text-center">
      <UserCircle size={32} className="mx-auto text-text-muted" />
      <h2 className="mt-4 font-semibold">Personal settings are coming soon</h2>
      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-text-muted">This page is reserved for playback, appearance, and account preferences. Instance administration is available separately to administrators.</p>
    </section>
  </PlaylistShell>
}
