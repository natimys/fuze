'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/api'
import { motion } from 'motion/react'
import type { PublicConfig } from '@/lib/types'

export default function AuthPage() {
  const router = useRouter()
  const [isLogin, setIsLogin] = useState(true)
  const [method, setMethod] = useState<'password' | 'key'>('password')
  const [config, setConfig] = useState<PublicConfig | null>(null)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [accessKey, setAccessKey] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    void api.config().then((value) => {
      setConfig(value)
      if (value.auth.mode === 'key') setMethod('key')
    }).catch((reason) => setError(reason instanceof Error ? reason.message : 'Unable to load instance configuration'))
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      if (isLogin) {
        if (method === 'key') await api.auth.keyLogin({ key: accessKey })
        else await api.auth.login({ email, password })
      } else {
        await api.auth.register({ name, email, password })
        await api.auth.login({ email, password })
      }
      router.push('/')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  if (!config) {
    return <div className="flex min-h-dvh items-center justify-center bg-bg p-4 text-sm text-text-muted" role="status">{error || 'Loading instance configuration…'}</div>
  }

  return (
    <div className="flex items-center justify-center min-h-dvh bg-bg p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        className="w-full max-w-[360px]"
      >
        <div className="bg-surface rounded-xl border border-border p-8">
          <div className="mb-8">
            <h1 className="text-xl font-semibold text-text-primary tracking-tight">
              {isLogin ? 'Welcome back' : 'Create account'}
            </h1>
            <p className="text-sm text-text-muted mt-1">
              {isLogin ? 'Sign in to your Fuze account' : 'Create your Fuze account'}
            </p>
          </div>

          {error && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              className="bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3 mb-4"
            >
              <p className="text-sm text-red-400">{error}</p>
            </motion.div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {isLogin && config?.auth.mode === 'both' && <div className="grid grid-cols-2 gap-1 rounded-lg bg-hover-strong p-1" role="group" aria-label="Sign-in method">
              <button type="button" onClick={() => setMethod('password')} className={`h-9 rounded-md text-sm ${method === 'password' ? 'bg-surface-raised text-text-primary' : 'text-text-muted'}`}>Password</button>
              <button type="button" onClick={() => setMethod('key')} className={`h-9 rounded-md text-sm ${method === 'key' ? 'bg-surface-raised text-text-primary' : 'text-text-muted'}`}>Access key</button>
            </div>}
            {!isLogin && (
              <div>
                <label htmlFor="name" className="block text-sm font-medium text-text-secondary mb-1.5">
                  Name
                </label>
                <input
                  id="name"
                  type="text"
                  placeholder="Your name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  minLength={1}
                  maxLength={100}
                  className="w-full h-10 bg-hover-strong border border-border rounded-lg px-3 text-sm text-text-primary placeholder:text-text-muted outline-none focus:border-accent-dim transition-colors"
                />
              </div>
            )}

            {method === 'password' && <div>
              <label htmlFor="email" className="block text-sm font-medium text-text-secondary mb-1.5">
                Email
              </label>
              <input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full h-10 bg-hover-strong border border-border rounded-lg px-3 text-sm text-text-primary placeholder:text-text-muted outline-none focus:border-accent-dim transition-colors"
              />
            </div>}

            {method === 'password' && <div>
              <label htmlFor="password" className="block text-sm font-medium text-text-secondary mb-1.5">
                Password
              </label>
              <input
                id="password"
                type="password"
                placeholder="* * * * * * * *"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                maxLength={128}
                className="w-full h-10 bg-hover-strong border border-border rounded-lg px-3 text-sm text-text-primary placeholder:text-text-muted outline-none focus:border-accent-dim transition-colors"
              />
            </div>}

            {isLogin && method === 'key' && <div>
              <label htmlFor="access-key" className="block text-sm font-medium text-text-secondary mb-1.5">Access key</label>
              <input id="access-key" type="password" autoComplete="off" value={accessKey} onChange={(e) => setAccessKey(e.target.value)} required minLength={32} maxLength={512} className="w-full h-10 bg-hover-strong border border-border rounded-lg px-3 text-sm text-text-primary outline-none focus:border-accent-dim transition-colors" />
            </div>}

            <button
              type="submit"
              disabled={loading}
              className="w-full h-10 bg-hover-strong hover:bg-surface-hover text-text-primary rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98]"
            >
              {loading ? 'Loading...' : isLogin ? 'Sign in' : 'Create account'}
            </button>
          </form>

          {config?.auth.registration && method === 'password' && <div className="mt-6 text-center text-sm text-text-muted">
            {isLogin ? "Don't have an account? " : 'Already have an account? '}
            <button
              type="button"
              onClick={() => { setIsLogin(!isLogin); setError('') }}
              className="text-text-secondary hover:text-text-primary transition-colors"
            >
              {isLogin ? 'Sign up' : 'Sign in'}
            </button>
          </div>}
        </div>
      </motion.div>
    </div>
  )
}
