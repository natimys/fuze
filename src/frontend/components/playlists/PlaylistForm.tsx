'use client'

import { useState, type FormEvent } from 'react'
import { Spinner } from '@phosphor-icons/react'

interface Props {
  initialTitle?: string
  initialDescription?: string | null
  submitLabel: string
  busy: boolean
  error: string | null
  onCancel: () => void
  onSubmit: (value: { title: string; description: string | null }) => Promise<void>
}

export function PlaylistForm({ initialTitle = '', initialDescription = '', submitLabel, busy, error, onCancel, onSubmit }: Props) {
  const [title, setTitle] = useState(initialTitle)
  const [description, setDescription] = useState(initialDescription ?? '')
  async function submit(event: FormEvent) {
    event.preventDefault()
    const normalized = title.trim()
    if (!normalized || busy) return
    await onSubmit({ title: normalized, description: description.trim() || null })
  }
  return <form className="fuze-field" onSubmit={(event) => void submit(event)}>
    <label htmlFor="playlist-title">Name</label>
    <input id="playlist-title" autoComplete="off" required minLength={1} maxLength={100} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Late night rotation" />
    <div className="mt-4 flex items-baseline justify-between gap-3"><label className="text-sm font-medium text-text-secondary" htmlFor="playlist-description">Description <span className="text-text-muted">(optional)</span></label><span className="text-xs text-text-muted">{description.length}/255</span></div>
    <textarea id="playlist-description" maxLength={255} rows={3} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="A short note about this playlist" />
    {error && <p role="alert" className="mt-3 text-sm text-red-400">{error}</p>}
    <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
      <button type="button" onClick={onCancel} disabled={busy} className="fuze-button fuze-button--ghost">Cancel</button>
      <button type="submit" disabled={busy || !title.trim()} className="fuze-button fuze-button--primary">{busy && <Spinner className="animate-spin" aria-hidden="true" />}{submitLabel}</button>
    </div>
  </form>
}
