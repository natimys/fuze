'use client'

import { usePlayerStore } from '@/lib/store'
import { api } from '@/lib/api'
import { useRouter } from 'next/navigation'
import {
  House,
  ListMagnifyingGlass,
  Heart,
  Gear,
  SignOut,
  MusicNote,
} from '@phosphor-icons/react'
import { motion, AnimatePresence } from 'motion/react'

interface SidebarProps {
  isOpen: boolean
  onClose: () => void
}

const navItems = [
  { icon: House, label: 'Home', href: '/player' },
  { icon: ListMagnifyingGlass, label: 'Playlists', href: '#' },
  { icon: Heart, label: 'Favorites', href: '#' },
  { icon: Gear, label: 'Settings', href: '#' },
]

export function Sidebar({ isOpen, onClose }: SidebarProps) {
  const user = usePlayerStore((s) => s.user)
  const setUser = usePlayerStore((s) => s.setUser)
  const router = useRouter()

  async function handleLogout() {
    await api.auth.logout()
    setUser(null)
    router.push('/auth')
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
                  className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-text-secondary hover:text-text-primary hover:bg-hover transition-colors"
                >
                  <item.icon size={18} weight="regular" />
                  <span>{item.label}</span>
                </a>
              ))}
            </nav>

            <div className="p-3 border-t border-border">
              {user && (
                <div className="flex items-center gap-3 px-3 py-2">
                  <div className="w-8 h-8 rounded-full bg-surface-raised flex items-center justify-center text-xs font-semibold text-text-secondary">
                    {user.name[0]?.toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-text-primary truncate">{user.name}</div>
                    <div className="text-xs text-text-muted truncate">{user.email}</div>
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
            </div>
          </motion.aside>
        )}
      </AnimatePresence>
    </>
  )
}
