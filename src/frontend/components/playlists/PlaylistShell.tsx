'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { List, MagnifyingGlass, MusicNote } from '@phosphor-icons/react'
import { Sidebar } from '@/components/sidebar/Sidebar'
import { SearchModal } from '@/components/search/SearchModal'
import { api } from '@/lib/api'
import { usePlayerStore } from '@/lib/store'

export function PlaylistShell({ children }: { children: ReactNode }) {
  const [authState, setAuthState] = useState<'checking' | 'ready' | 'denied'>('checking')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const navigate = useNavigate()
  const setUser = usePlayerStore((state) => state.setUser)
  const setConfig = usePlayerStore((state) => state.setConfig)
  const hydrate = usePlayerStore((state) => state.hydrate)
  const currentTrack = usePlayerStore((state) => state.currentTrack)

  useEffect(() => {
    hydrate()
    const controller = new AbortController()
    void Promise.all([api.auth.me(), api.config()]).then(([user, config]) => {
      if (!controller.signal.aborted) { setUser(user); setConfig(config); setAuthState('ready') }
    }).catch(() => {
      if (!controller.signal.aborted) { setAuthState('denied'); navigate('/auth', { replace: true }) }
    })
    return () => controller.abort()
  }, [hydrate, navigate, setUser, setConfig])

  if (authState !== 'ready') return <div className="flex min-h-[100dvh] items-center justify-center bg-bg text-sm text-text-muted" role="status">{authState === 'checking' ? 'Checking session...' : 'Redirecting...'}</div>

  return <div className="h-[100dvh] overflow-y-auto bg-bg text-text-primary">
    <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
    <SearchModal isOpen={searchOpen} onClose={() => setSearchOpen(false)} />
    <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-border bg-bg/95 px-4 backdrop-blur sm:px-6">
      <button type="button" onClick={() => setSidebarOpen(true)} className="rounded-lg p-2 text-text-muted hover:bg-hover hover:text-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-text-primary" aria-label="Open navigation"><List size={19} /></button>
      <Link to="/player" className="flex items-center gap-2 rounded-lg px-2 py-1 text-sm font-semibold tracking-tight focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-text-primary"><MusicNote size={17} weight="fill" />Fuze</Link>
      <div className="flex-1" />
      <button type="button" onClick={() => setSearchOpen(true)} className="flex min-h-10 items-center gap-2 rounded-lg border border-border bg-surface px-3 text-sm text-text-secondary hover:border-border-thick hover:text-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-text-primary"><MagnifyingGlass size={16} /><span className="hidden sm:inline">Search music</span></button>
    </header>
    <main className={`mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 sm:py-10 ${currentTrack ? 'pb-32 sm:pb-32' : ''}`}>{children}</main>
  </div>
}
