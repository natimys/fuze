'use client'

import { usePlayerStore } from '@/lib/store'
import { api } from '@/lib/api'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useEffect, useRef, useState } from 'react'
import {
  House,
  ListMagnifyingGlass,
  Gear,
  ShieldCheck,
  SignOut,
  DownloadSimple,
  Download,
  MagnifyingGlass,
  X,
} from '@phosphor-icons/react'
import { motion, AnimatePresence } from 'motion/react'
import { useI18n } from '@/lib/i18n'

interface SidebarProps {
  isOpen: boolean
  onClose: () => void
  onSearch?: () => void
}

export function Sidebar({ isOpen, onClose, onSearch }: SidebarProps) {
  const { t } = useI18n()
  const navItems = [
    { icon: House, label: t('home'), href: '/player' },
    { icon: ListMagnifyingGlass, label: t('playlists'), href: '/player/playlists' },
    { icon: DownloadSimple, label: t('downloads'), href: '/player/downloads' },
    { icon: Download, label: t('importMusic'), href: '/player/playlists?import=1' },
  ]
  const user = usePlayerStore((s) => s.user)
  const setUser = usePlayerStore((s) => s.setUser)
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const [logoutError, setLogoutError] = useState<string | null>(null)
  const panelRef = useRef<HTMLElement>(null)

  useEffect(() => {
    if (!isOpen) return
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const panel = panelRef.current
    const selector = 'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'
    window.requestAnimationFrame(() => panel?.querySelector<HTMLElement>(selector)?.focus())
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); onClose(); return }
      if (event.key !== 'Tab' || !panel) return
      const controls = [...panel.querySelectorAll<HTMLElement>(selector)]
      if (!controls.length) { event.preventDefault(); return }
      const index = controls.indexOf(document.activeElement as HTMLElement)
      if (event.shiftKey && index <= 0) { event.preventDefault(); controls.at(-1)?.focus() }
      else if (!event.shiftKey && index === controls.length - 1) { event.preventDefault(); controls[0].focus() }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => { document.removeEventListener('keydown', onKeyDown); previous?.focus() }
  }, [isOpen, onClose])

  async function handleLogout() {
    setLogoutError(null)
    try {
      await api.auth.logout()
      setUser(null)
      navigate('/auth')
    } catch (error) {
      setLogoutError(error instanceof Error ? error.message : t('signOutFailed'))
    }
  }

  return (
    <>
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-40 bg-black/50"
            onClick={onClose}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isOpen && (
          <motion.aside
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label={t('navigation')}
            initial={{ x: -280 }}
            animate={{ x: 0 }}
            exit={{ x: -280 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            className="fuze-sidebar"
          >
            <header className="fuze-sidebar__header"><Link to="/player" onClick={onClose}><img src="/brand/fuze-lockup.svg" alt="Fuze" /></Link><button type="button" onClick={onClose} aria-label={t('closeNavigation')}><X /></button></header>

            <nav className="fuze-sidebar__nav" aria-label="Application navigation">
              <span className="fuze-sidebar__eyebrow">{t('library')}</span>
              {navItems.map((item) => (
                <Link
                  key={item.label}
                  to={item.href}
                  aria-current={pathname === item.href || (item.href !== '/player' && pathname.startsWith(`${item.href}/`)) ? 'page' : undefined}
                  onClick={onClose}
                  className={pathname === item.href || (item.href !== '/player' && pathname.startsWith(`${item.href}/`)) ? 'active' : undefined}
                >
                  <item.icon size={18} weight="regular" />
                  <span>{item.label}</span>
                </Link>
              ))}
              {onSearch && <button type="button" onClick={() => { onClose(); onSearch() }}><MagnifyingGlass size={18} /><span>{t('search')}</span><kbd>⌘ K</kbd></button>}
              <span className="fuze-sidebar__eyebrow">Fuze</span>
              <Link to="/player/settings" onClick={onClose} aria-current={pathname === '/player/settings' ? 'page' : undefined} className={pathname === '/player/settings' ? 'active' : undefined}><Gear size={18} /><span>{t('settings')}</span></Link>
              {user?.role === 'admin' && <Link to="/player/admin-settings" onClick={onClose} aria-current={pathname.startsWith('/player/admin-settings') ? 'page' : undefined} className={pathname.startsWith('/player/admin-settings') ? 'active' : undefined}><ShieldCheck size={18} /><span>{t('adminSettings')}</span></Link>}
            </nav>

            <footer className="fuze-sidebar__footer">
              {user && (
                <div className="fuze-sidebar__user">
                  <div className="fuze-sidebar__avatar">
                    {user.name[0]?.toUpperCase()}
                  </div>
                  <div className="fuze-sidebar__identity">
                    <b>{user.name}</b>
                    {user.email && <small>{user.email}</small>}
                  </div>
                  <button
                    onClick={handleLogout}
                    className="fuze-sidebar__logout"
                    aria-label={t('signOut')}
                    title={t('signOut')}
                  >
                    <SignOut size={16} weight="regular" />
                  </button>
                </div>
              )}
              {logoutError && <p role="alert" className="fuze-sidebar__error">{logoutError}</p>}
            </footer>
          </motion.aside>
        )}
      </AnimatePresence>
    </>
  )
}
