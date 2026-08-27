import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'motion/react'
import { api } from '@/lib/api'
import { clearInstanceConfig, readInstanceConfig, saveInstanceConfig } from '@/services/runtimeConfig'
import { FuzeButton, FuzeField, FuzeInput } from '@/components/fuze'

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

  return <div className="fuze-service-screen">
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="fuze-service-wrap fuze-service-wrap--setup">
      <section className="fuze-service-card">
        <img src="/brand/fuze-lockup.svg" alt="Fuze" className="fuze-service-logo" />
        <header className="fuze-service-header"><span className="fuze-service-eyebrow">SELF-HOSTED AUDIO</span><h1>Connect your Fuze instance</h1>
        <p>Enter the public addresses from your self-hosted installation.</p></header>

        {error && <div role="alert" className="fuze-service-alert">{error}</div>}

        <form onSubmit={handleSubmit} className="fuze-service-form">
          <FuzeField label="Backend address"><FuzeInput id="backend-url" type="text" inputMode="url" autoCapitalize="none" autoCorrect="off" placeholder="https://api.example.com" value={backendUrl} onChange={(event) => setBackendUrl(event.target.value)} required /><small>Base domain without <code>/api/v1</code></small></FuzeField>
          <FuzeField label="Frontend address"><FuzeInput id="frontend-url" type="text" inputMode="url" autoCapitalize="none" autoCorrect="off" placeholder="https://music.example.com" value={frontendUrl} onChange={(event) => setFrontendUrl(event.target.value)} required /><small>Public address of the hosted Fuze web app</small></FuzeField>
          <FuzeButton type="submit" variant="primary" disabled={loading} className="fuze-service-submit">
            {loading ? 'Checking connection…' : 'Continue'}
          </FuzeButton>
        </form>
      </section>
    </motion.div>
  </div>
}
