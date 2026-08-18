import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { PlaylistForm } from '@/components/playlists/PlaylistForm'

describe('PlaylistForm', () => {
  it('normalizes values and submits an optional empty description as null', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn(async () => undefined)
    render(<PlaylistForm submitLabel="Create playlist" busy={false} error={null} onCancel={() => undefined} onSubmit={onSubmit} />)

    await user.type(screen.getByLabelText('Name'), '  Morning set  ')
    await user.click(screen.getByRole('button', { name: 'Create playlist' }))

    expect(onSubmit).toHaveBeenCalledWith({ title: 'Morning set', description: null })
  })

  it('exposes backend errors as an alert', () => {
    render(<PlaylistForm submitLabel="Save changes" busy={false} error="Name is already used" onCancel={() => undefined} onSubmit={async () => undefined} />)
    expect(screen.getByRole('alert')).toHaveTextContent('Name is already used')
  })
})
