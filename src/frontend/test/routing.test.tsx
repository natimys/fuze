import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Outlet, useLocation, useParams } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from '@/src/App'

afterEach(cleanup)

vi.mock('@/src/PlayerLayout', () => ({ default: () => <div data-testid="player-layout"><Outlet /></div> }))
vi.mock('@/src/pages/AuthPage', () => ({ default: () => <h1>Auth route</h1> }))
vi.mock('@/src/pages/InstanceSetupPage', () => ({ default: () => <h1>Setup route</h1> }))
vi.mock('@/src/pages/PlayerPage', () => ({ default: () => <h1>Player route</h1> }))
vi.mock('@/src/pages/SettingsPage', () => ({ default: () => <h1>Settings route</h1> }))
vi.mock('@/src/pages/AdminSettingsPage', () => ({ default: () => <h1>Admin route</h1> }))
vi.mock('@/src/pages/PlaylistsPage', () => ({ default: () => <h1>Playlists route</h1> }))
vi.mock('@/src/pages/PlaylistDetailPage', () => ({ default: function PlaylistDetailRoute() { const { id } = useParams(); return <h1>Playlist {id}</h1> } }))

function Location() {
  return <output aria-label="location">{useLocation().pathname}</output>
}

function renderRoute(path: string) {
  return render(<MemoryRouter initialEntries={[path]}><App /><Location /></MemoryRouter>)
}

describe('application routes', () => {
  it('redirects the root to /player', async () => {
    renderRoute('/')
    await waitFor(() => expect(screen.getByLabelText('location')).toHaveTextContent('/player'))
    expect(screen.getByRole('heading', { name: 'Player route' })).toBeInTheDocument()
  })

  it.each([
    ['/setup', 'Setup route'],
    ['/auth', 'Auth route'],
    ['/player', 'Player route'],
    ['/player/settings', 'Settings route'],
    ['/player/admin-settings', 'Admin route'],
    ['/player/playlists', 'Playlists route'],
    ['/player/playlists/42', 'Playlist 42'],
  ])('opens %s directly', (path, heading) => {
    renderRoute(path)
    expect(screen.getByRole('heading', { name: heading })).toBeInTheDocument()
  })

  it('redirects an unknown client URL instead of rendering a dead route', async () => {
    renderRoute('/missing/deep/link')
    await waitFor(() => expect(screen.getByLabelText('location')).toHaveTextContent('/player'))
  })
})
