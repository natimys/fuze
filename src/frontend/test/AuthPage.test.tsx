import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import AuthPage from '@/app/auth/page'
import { api } from '@/lib/api'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('@/lib/api', () => ({
  api: {
    config: vi.fn(),
    auth: { login: vi.fn(), keyLogin: vi.fn(), register: vi.fn() },
  },
}))

const publicConfig = (mode: 'password' | 'key' | 'both', registration: boolean) => ({
  auth: { mode, registration },
  features: { playback: true },
  providers: { youtube: true, yandex: false, spotify: false },
})

describe('instance auth capabilities', () => {
  beforeEach(() => vi.clearAllMocks())

  it('shows only key login for a private key-only instance', async () => {
    vi.mocked(api.config).mockResolvedValue(publicConfig('key', false))
    render(<AuthPage />)
    expect(await screen.findByLabelText('Access key')).toBeInTheDocument()
    expect(screen.queryByLabelText('Email')).not.toBeInTheDocument()
    expect(screen.queryByText('Sign up')).not.toBeInTheDocument()
  })

  it('shows registration only when enabled', async () => {
    vi.mocked(api.config).mockResolvedValue(publicConfig('password', true))
    render(<AuthPage />)
    const signup = await screen.findByText('Sign up')
    fireEvent.click(signup)
    expect(screen.getByLabelText('Name')).toBeInTheDocument()
    expect(screen.getByLabelText('Email')).toBeInTheDocument()
  })

  it('offers both configured login methods', async () => {
    vi.mocked(api.config).mockResolvedValue(publicConfig('both', false))
    render(<AuthPage />)
    const keyButton = await screen.findByRole('button', { name: 'Access key' })
    expect(screen.getByRole('button', { name: 'Password' })).toBeInTheDocument()
    fireEvent.click(keyButton)
    expect(screen.getByLabelText('Access key')).toBeInTheDocument()
  })
})
