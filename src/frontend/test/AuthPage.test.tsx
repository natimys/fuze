import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import AuthPage from '@/src/pages/AuthPage'
import { api } from '@/lib/api'

vi.mock('@/lib/api', () => ({
  api: {
    config: vi.fn(),
    auth: { login: vi.fn(), keyLogin: vi.fn(), register: vi.fn() },
  },
}))

const publicConfig = (mode: 'password' | 'key' | 'both', registration: boolean) => ({
  instance_name: 'Fuze',
  setup_required: false,
  auth: { mode, registration },
  features: { playback: true },
  providers: { youtube: true, yandex: false, spotify: false },
})

describe('instance auth capabilities', () => {
  beforeEach(() => { cleanup(); vi.clearAllMocks() })
  const renderPage = () => render(<MemoryRouter><AuthPage /></MemoryRouter>)

  it('shows only key login for a private key-only instance', async () => {
    vi.mocked(api.config).mockResolvedValue(publicConfig('key', false))
    renderPage()
    expect(await screen.findByRole('heading', { name: 'Enter access key' })).toBeInTheDocument()
    expect(screen.getByText('Use your Fuze access key to continue')).toBeInTheDocument()
    expect(await screen.findByLabelText('Access key')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Continue with key' })).toBeInTheDocument()
    expect(screen.queryByLabelText('Email')).not.toBeInTheDocument()
    expect(screen.queryByText('Sign up')).not.toBeInTheDocument()
  })

  it('shows registration only when enabled', async () => {
    vi.mocked(api.config).mockResolvedValue(publicConfig('password', true))
    renderPage()
    const signup = await screen.findByText('Sign up')
    fireEvent.click(signup)
    expect(screen.getByLabelText('Name')).toBeInTheDocument()
    expect(screen.queryByLabelText('Email')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Password')).not.toBeInTheDocument()
  })

  it('offers both configured login methods', async () => {
    vi.mocked(api.config).mockResolvedValue(publicConfig('both', false))
    renderPage()
    const keyButton = await screen.findByRole('button', { name: 'Access key' })
    expect(screen.getByRole('button', { name: 'Password' })).toBeInTheDocument()
    fireEvent.click(keyButton)
    expect(screen.getByLabelText('Access key')).toBeInTheDocument()
  })

  it('shows the exact rescue command until the first admin exists', async () => {
    vi.mocked(api.config).mockResolvedValue({ ...publicConfig('password', false), setup_required: true })
    renderPage()
    expect(await screen.findByRole('heading', { name: 'Administrator setup required' })).toBeInTheDocument()
    expect(screen.getByText('docker compose run --rm backend fuze rescue bootstrap-admin')).toBeInTheDocument()
    expect(screen.queryByLabelText('Email')).not.toBeInTheDocument()
  })
})
