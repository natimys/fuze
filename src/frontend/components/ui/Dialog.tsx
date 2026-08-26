'use client'

import { useEffect, useId, useRef, type ReactNode } from 'react'
import { X } from '@phosphor-icons/react'

interface DialogProps {
  open: boolean
  title: string
  description?: string
  children: ReactNode
  onClose: () => void
}

const focusable = 'button:not([disabled]), [href], input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

export function Dialog({ open, title, description, children, onClose }: DialogProps) {
  const titleId = useId()
  const descriptionId = useId()
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const panel = panelRef.current
    const first = panel?.querySelector<HTMLElement>(focusable)
    window.requestAnimationFrame(() => first?.focus())
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); onClose(); return }
      if (event.key !== 'Tab' || !panel) return
      const controls = [...panel.querySelectorAll<HTMLElement>(focusable)]
      if (controls.length === 0) { event.preventDefault(); return }
      const current = controls.indexOf(document.activeElement as HTMLElement)
      if (event.shiftKey && current <= 0) { event.preventDefault(); controls.at(-1)?.focus() }
      else if (!event.shiftKey && current === controls.length - 1) { event.preventDefault(); controls[0].focus() }
    }
    document.addEventListener('keydown', onKeyDown)
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = previousOverflow
      previous?.focus()
    }
  }, [open, onClose])

  if (!open) return null
  return <div className="fixed inset-0 z-[60] flex items-end justify-center p-3 sm:items-center sm:p-6">
    <button type="button" className="fuze-dialog-backdrop absolute inset-0 cursor-default" aria-label="Close dialog" onClick={onClose} />
    <div ref={panelRef} role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={description ? descriptionId : undefined} className="fuze-dialog relative max-h-[calc(100dvh-1.5rem)] w-full max-w-lg overflow-y-auto p-5 shadow-2xl sm:p-6">
      <div className="flex items-start gap-4">
        <div className="min-w-0 flex-1">
          <h2 id={titleId} className="text-lg font-semibold tracking-tight text-text-primary">{title}</h2>
          {description && <p id={descriptionId} className="mt-1 text-sm text-text-muted">{description}</p>}
        </div>
        <button type="button" onClick={onClose} className="rounded-lg p-2 text-text-muted hover:bg-hover-strong hover:text-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-text-primary" aria-label="Close"><X size={18} /></button>
      </div>
      <div className="mt-5">{children}</div>
    </div>
  </div>
}
