import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '@/lib/api'
import { motion } from 'motion/react'
import type { PublicConfig } from '@/lib/types'
import { FuzeButton, FuzeField, FuzeInput } from '@/components/fuze'

export default function AuthPage() {
  const navigate = useNavigate()
  const [isLogin, setIsLogin] = useState(true)
  const [method, setMethod] = useState<'password' | 'key'>('password')
  const [config, setConfig] = useState<PublicConfig | null>(null)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [accessKey, setAccessKey] = useState('')
  const [generatedKey, setGeneratedKey] = useState('')
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
        const registration = await api.auth.register({ name })
        setGeneratedKey(registration.access_key)
        setAccessKey(registration.access_key)
        setMethod('key')
        setIsLogin(true)
        return
      }
      navigate('/')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  if (!config) {
    return <div className="fuze-service-state" role="status">{error || 'Loading instance configuration…'}</div>
  }

  if (config.setup_required) {
    return <div className="fuze-service-screen"><section className="fuze-service-card fuze-service-card--wide"><span className="fuze-service-eyebrow">INSTANCE SETUP</span><h1>Administrator setup required</h1><p>Create the first administrator from the installation directory, then reload this page.</p><code className="fuze-code">docker compose run --rm backend fuze rescue bootstrap-admin</code></section></div>
  }

  const isKeyOnly = config.auth.mode === 'key'

  return (
    <div className="fuze-service-screen">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        className="fuze-service-wrap"
      >
        <section className="fuze-service-card">
          <img className="fuze-service-logo" src="/brand/fuze-lockup.svg" alt="Fuze" />
          <header className="fuze-service-header">
            <span className="fuze-service-eyebrow">YOUR MUSIC, YOUR INSTANCE</span>
            <h1>
              {isLogin ? (isKeyOnly ? 'Enter access key' : 'Welcome back') : 'Create account'}
            </h1>
            <p>
              {isLogin
                ? (isKeyOnly ? 'Use your Fuze access key to continue' : 'Sign in to your Fuze account')
                : 'Create your Fuze account'}
            </p>
          </header>

          {error && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              className="fuze-service-alert"
            >
              <p>{error}</p>
            </motion.div>
          )}

          {generatedKey && <div className="fuze-service-alert" role="status"><p>Access key created. Store it now; it will not be shown again.</p><code className="fuze-code">{generatedKey}</code><FuzeButton type="button" variant="secondary" onClick={() => void navigator.clipboard.writeText(generatedKey)}>Copy key</FuzeButton></div>}

          <form onSubmit={handleSubmit} className="fuze-service-form">
            {isLogin && config?.auth.mode === 'both' && <div className="fuze-segmented" role="group" aria-label="Sign-in method">
              <button type="button" onClick={() => setMethod('password')} aria-pressed={method === 'password'}>Password</button>
              <button type="button" onClick={() => setMethod('key')} aria-pressed={method === 'key'}>Access key</button>
            </div>}
            {!isLogin && (
              <FuzeField label="Name">
                <FuzeInput
                  id="name"
                  type="text"
                  placeholder="Your name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  minLength={1}
                  maxLength={100}
                />
              </FuzeField>
            )}

            {isLogin && method === 'password' && <FuzeField label="Email">
              <FuzeInput
                id="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </FuzeField>}

            {isLogin && method === 'password' && <FuzeField label="Password">
              <FuzeInput
                id="password"
                type="password"
                placeholder="* * * * * * * *"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                maxLength={128}
              />
            </FuzeField>}

            {isLogin && method === 'key' && <FuzeField label="Access key"><FuzeInput id="access-key" type="password" autoComplete="off" value={accessKey} onChange={(e) => setAccessKey(e.target.value)} required minLength={32} maxLength={512} /></FuzeField>}

            <FuzeButton type="submit" variant="primary" disabled={loading} className="fuze-service-submit">
              {loading ? 'Loading...' : isLogin ? (method === 'key' ? 'Continue with key' : 'Sign in') : 'Create account'}
            </FuzeButton>
          </form>

          {config?.auth.registration && <div className="fuze-service-switch">
            {isLogin ? "Don't have an account? " : 'Already have an account? '}
            <button
              type="button"
              onClick={() => { setIsLogin(!isLogin); setGeneratedKey(''); setError('') }}
              className="fuze-service-link"
            >
              {isLogin ? 'Sign up' : 'Sign in'}
            </button>
          </div>}
        </section>
      </motion.div>
    </div>
  )
}
