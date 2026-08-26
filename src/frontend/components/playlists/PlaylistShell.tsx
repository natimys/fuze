'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { List, MagnifyingGlass } from '@phosphor-icons/react'
import { Sidebar } from '@/components/sidebar/Sidebar'
import { SearchModal } from '@/components/search/SearchModal'
import { api } from '@/lib/api'
import { usePlayerStore } from '@/lib/store'
import { FuzePage } from '@/components/fuze'

export function PlaylistShell({ children }: { children: ReactNode }) {
  const [authState, setAuthState] = useState<'checking' | 'ready' | 'denied'>('checking')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const navigate = useNavigate()
  const setUser = usePlayerStore((state) => state.setUser)
  const setConfig = usePlayerStore((state) => state.setConfig)
  const hydrate = usePlayerStore((state) => state.hydrate)

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

  return <div className="fuze-frame">
    <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
    <SearchModal isOpen={searchOpen} onClose={() => setSearchOpen(false)} />
    <header className="fuze-header">
      <button type="button" onClick={() => setSidebarOpen(true)} aria-label="Open navigation"><List size={19} /></button>
      <Link to="/player" className="fuze-header__brand"><img src="/brand/fuze-lockup.svg" alt="Fuze" /></Link>
      <div className="fuze-header__actions"><button type="button" onClick={() => setSearchOpen(true)}><MagnifyingGlass size={16} /><span className="fuze-header__action-label">Search</span><kbd>⌘ K</kbd></button></div>
    </header>
    <div className="fuze-body"><Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} inline /><FuzePage>{children}</FuzePage></div>
  </div>
}
