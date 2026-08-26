import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'motion/react'
import { api } from '@/lib/api'
import { clearInstanceConfig, readInstanceConfig, saveInstanceConfig } from '@/services/runtimeConfig'

export default function InstanceSetupPage() {
  const navigate = useNavigate()
  const current = readInstanceConfig()
  const [backendUrl, setBackendUrl] = useState(current?.backendUrl ?? '')
  const [frontendUrl, setFrontendUrl] = useState(current?.frontendUrl ?? '')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setError('')
    setLoading(true)
    try {
      saveInstanceConfig({ backendUrl, frontendUrl })
      await api.config()
      navigate('/auth', { replace: true })
    } catch (reason) {
      if (current) saveInstanceConfig(current)
      else clearInstanceConfig()
      setError(reason instanceof Error ? reason.message : 'Could not connect to this Fuze instance')
    } finally {
      setLoading(false)
    }
  }

  return <div className="flex min-h-dvh items-center justify-center bg-bg p-4">
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-[420px]">
      <div className="rounded-xl border border-border bg-surface p-8">
        <img src="/brand/fuze-lockup.svg" alt="Fuze" className="mb-8 h-7 w-auto" />
        <h1 className="text-xl font-semibold tracking-tight">Connect your Fuze instance</h1>
        <p className="mt-1 text-sm text-text-muted">Enter the public addresses from your self-hosted installation.</p>

        {error && <div role="alert" className="mt-5 rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">{error}</div>}

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <label htmlFor="backend-url" className="mb-1.5 block text-sm font-medium text-text-secondary">Backend address</label>
            <input id="backend-url" type="text" inputMode="url" autoCapitalize="none" autoCorrect="off" placeholder="https://api.example.com" value={backendUrl} onChange={(event) => setBackendUrl(event.target.value)} required className="h-10 w-full rounded-lg border border-border bg-hover-strong px-3 text-sm outline-none transition-colors placeholder:text-text-muted focus:border-accent-dim" />
            <p className="mt-1.5 text-xs text-text-muted">Base domain without <code>/api/v1</code></p>
          </div>
          <div>
            <label htmlFor="frontend-url" className="mb-1.5 block text-sm font-medium text-text-secondary">Frontend address</label>
            <input id="frontend-url" type="text" inputMode="url" autoCapitalize="none" autoCorrect="off" placeholder="https://music.example.com" value={frontendUrl} onChange={(event) => setFrontendUrl(event.target.value)} required className="h-10 w-full rounded-lg border border-border bg-hover-strong px-3 text-sm outline-none transition-colors placeholder:text-text-muted focus:border-accent-dim" />
            <p className="mt-1.5 text-xs text-text-muted">Public address of the hosted Fuze web app</p>
          </div>
          <button type="submit" disabled={loading} className="h-10 w-full rounded-lg bg-hover-strong text-sm font-medium transition-colors hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-50">
            {loading ? 'Checking connection…' : 'Continue'}
          </button>
        </form>
      </div>
    </motion.div>
  </div>
}
