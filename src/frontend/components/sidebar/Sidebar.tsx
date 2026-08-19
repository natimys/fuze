'use client'

import { usePlayerStore } from '@/lib/store'
import { api } from '@/lib/api'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import {
  House,
  ListMagnifyingGlass,
  Heart,
  Gear,
  SignOut,
  MusicNote,
} from '@phosphor-icons/react'
import { motion, AnimatePresence } from 'motion/react'
import Link from 'next/link'

interface SidebarProps {
  isOpen: boolean
  onClose: () => void
}

const navItems = [
  { icon: House, label: 'Home', href: '/player' },
  { icon: ListMagnifyingGlass, label: 'Playlists', href: '/player/playlists' },
]

export function Sidebar({ isOpen, onClose }: SidebarProps) {
  const user = usePlayerStore((s) => s.user)
  const setUser = usePlayerStore((s) => s.setUser)
  const router = useRouter()
  const pathname = usePathname()
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
      router.push('/auth')
    } catch (error) {
      setLogoutError(error instanceof Error ? error.message : 'Sign out failed. Please retry.')
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
            aria-label="Navigation"
            initial={{ x: -280 }}
            animate={{ x: 0 }}
            exit={{ x: -280 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            className="fixed top-0 left-0 bottom-0 z-50 w-[280px] bg-surface border-r border-border flex flex-col"
          >
            <div className="px-6 py-5 border-b border-border">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-surface-raised flex items-center justify-center">
                  <MusicNote size={16} weight="fill" className="text-text-primary" />
                </div>
                <span className="text-sm font-semibold text-text-primary tracking-tight">Fuze</span>
              </div>
            </div>

            <nav className="flex-1 py-3 px-3">
              {navItems.map((item) => (
                <a
                  key={item.label}
                  href={item.href}
                  aria-current={pathname === item.href || (item.href !== '/player' && pathname.startsWith(`${item.href}/`)) ? 'page' : undefined}
                  onClick={onClose}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-text-primary ${pathname === item.href || (item.href !== '/player' && pathname.startsWith(`${item.href}/`)) ? 'bg-hover-strong text-text-primary' : 'text-text-secondary hover:text-text-primary hover:bg-hover'}`}
                >
                  <item.icon size={18} weight="regular" />
                  <span>{item.label}</span>
                </a>
              ))}
              <div className="mt-2 flex items-center gap-3 px-3 py-2 text-xs text-text-muted" aria-disabled="true"><Heart size={16} aria-hidden="true" /><span>Favorites <span className="sr-only">is </span>(coming later)</span></div>
              {user?.role === 'admin' && <Link href="/player/settings" onClick={onClose} aria-current={pathname.startsWith('/player/settings') ? 'page' : undefined} className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors ${pathname.startsWith('/player/settings') ? 'bg-hover-strong text-text-primary' : 'text-text-secondary hover:bg-hover hover:text-text-primary'}`}><Gear size={18} /><span>Settings</span></Link>}
            </nav>

            <div className="p-3 border-t border-border">
              {user && (
                <div className="flex items-center gap-3 px-3 py-2">
                  <div className="w-8 h-8 rounded-full bg-surface-raised flex items-center justify-center text-xs font-semibold text-text-secondary">
                    {user.name[0]?.toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-text-primary truncate">{user.name}</div>
                    {user.email && <div className="text-xs text-text-muted truncate">{user.email}</div>}
                  </div>
                  <button
                    onClick={handleLogout}
                    className="p-1.5 rounded-md text-text-muted hover:text-text-primary hover:bg-hover transition-colors"
                    title="Sign out"
                  >
                    <SignOut size={16} weight="regular" />
                  </button>
                </div>
              )}
              {logoutError && <p role="alert" className="px-3 pb-2 text-xs text-red-400">{logoutError}</p>}
            </div>
          </motion.aside>
        )}
      </AnimatePresence>
    </>
  )
}
