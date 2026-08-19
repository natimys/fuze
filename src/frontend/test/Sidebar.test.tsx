import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Sidebar } from '@/components/sidebar/Sidebar'
import { usePlayerStore } from '@/lib/store'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => '/player',
}))
vi.mock('@/lib/api', () => ({ api: { auth: { logout: vi.fn() } } }))

describe('admin navigation', () => {
  beforeEach(() => usePlayerStore.setState({ user: null }))

  it('shows settings only to administrators', () => {
    usePlayerStore.setState({ user: { id: 1, name: 'Admin', email: 'admin@example.com', role: 'admin', is_active: true } })
    const { rerender } = render(<Sidebar isOpen onClose={() => undefined} />)
    expect(screen.getByRole('link', { name: 'Settings' })).toHaveAttribute('href', '/player/settings')

    usePlayerStore.setState({ user: { id: 2, name: 'User', email: 'user@example.com', role: 'user', is_active: true } })
    rerender(<Sidebar isOpen onClose={() => undefined} />)
    expect(screen.queryByRole('link', { name: 'Settings' })).not.toBeInTheDocument()
  })
})
