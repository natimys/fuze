import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { FuzeButton, FuzeCollectionItem, FuzePageHeader, FuzeState } from '@/components/fuze'

describe('Fuze components', () => {
  it('composes page chrome without hiding accessible content', () => {
    render(<><FuzePageHeader eyebrow="Archive" title="Playlists" description="Saved music" actions={<FuzeButton>Import</FuzeButton>} /><FuzeState title="No playlists">Create one</FuzeState></>)
    expect(screen.getByRole('heading', { name: 'Playlists' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Import' })).toBeInTheDocument()
    expect(screen.getByText('Create one')).toBeInTheDocument()
  })

  it('renders cassette collection metadata', () => {
    render(<a className="fuze-collection" href="/player/playlists/1"><FuzeCollectionItem title="Night Tape" description="Late rotation" meta="4 tracks" /></a>)
    expect(screen.getByRole('heading', { name: 'Night Tape' })).toBeInTheDocument()
    expect(screen.getByText('4 tracks')).toBeInTheDocument()
  })
})
