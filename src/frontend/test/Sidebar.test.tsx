import { cleanup, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { Sidebar } from '@/components/sidebar/Sidebar'
import { usePlayerStore } from '@/lib/store'

vi.mock('@/lib/api', () => ({ api: { auth: { logout: vi.fn() } } }))

describe('settings navigation', () => {
  beforeEach(() => { cleanup(); usePlayerStore.setState({ user: null }) })

  it('shows personal settings to everyone and instance settings only to administrators', () => {
    usePlayerStore.setState({ user: { id: 1, name: 'Admin', email: 'admin@example.com', role: 'admin', is_active: true } })
    const { rerender } = render(<MemoryRouter initialEntries={['/player']}><Sidebar isOpen onClose={() => undefined} /></MemoryRouter>)
    expect(screen.getByRole('link', { name: 'Settings' })).toHaveAttribute('href', '/player/settings')
    expect(screen.getByRole('link', { name: 'Admin Settings' })).toHaveAttribute('href', '/player/admin-settings')

    usePlayerStore.setState({ user: { id: 2, name: 'User', email: 'user@example.com', role: 'user', is_active: true } })
    rerender(<MemoryRouter initialEntries={['/player']}><Sidebar isOpen onClose={() => undefined} /></MemoryRouter>)
    expect(screen.getByRole('link', { name: 'Settings' })).toHaveAttribute('href', '/player/settings')
    expect(screen.queryByRole('link', { name: 'Admin Settings' })).not.toBeInTheDocument()
  })

  it('exposes the same complete navigation from every player screen', () => {
    render(<MemoryRouter initialEntries={['/player/downloads']}><Sidebar isOpen onClose={() => undefined} onSearch={() => undefined} /></MemoryRouter>)

    expect(screen.getByRole('link', { name: 'Home' })).toHaveAttribute('href', '/player')
    expect(screen.getByRole('link', { name: 'Playlists' })).toHaveAttribute('href', '/player/playlists')
    expect(screen.getByRole('link', { name: 'Downloads' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: 'Import music' })).toHaveAttribute('href', '/player/playlists?import=1')
    expect(screen.getByRole('button', { name: /Search/ })).toBeInTheDocument()
  })
})
