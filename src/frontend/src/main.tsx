import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import '@fontsource-variable/geist'
import '@fontsource-variable/geist-mono'
import './styles.css'
import { applyPlatformAttributes } from '@/platform'

applyPlatformAttributes()
if (import.meta.env.PROD && !('__TAURI_INTERNALS__' in window)) void import('@/pwa')

createRoot(document.getElementById('root')!).render(
  <StrictMode><BrowserRouter><App /></BrowserRouter></StrictMode>,
)
