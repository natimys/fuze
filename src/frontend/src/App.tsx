import { lazy, Suspense } from 'react'
import { Navigate, Outlet, Route, Routes } from 'react-router-dom'
import PlayerLayout from './PlayerLayout'
import { platform } from '@/platform'
import { readInstanceConfig } from '@/services/runtimeConfig'

const AdminSettingsPage = lazy(() => import('./pages/AdminSettingsPage'))
const AuthPage = lazy(() => import('./pages/AuthPage'))
const PlaylistDetailPage = lazy(() => import('./pages/PlaylistDetailPage'))
const PlaylistsPage = lazy(() => import('./pages/PlaylistsPage'))
const SettingsPage = lazy(() => import('./pages/SettingsPage'))
const DownloadsPage = lazy(() => import('./pages/DownloadsPage'))
const InstanceSetupPage = lazy(() => import('./pages/InstanceSetupPage'))
const PlayerPage = lazy(() => import('./pages/PlayerPage'))

const DesktopTitlebar = __FUZE_DESKTOP_BUILD__
  ? lazy(() => import('@/components/desktop/DesktopTitlebar').then((module) => ({ default: module.DesktopTitlebar })))
  : null

function ConfiguredApp() {
  return platform.isNative && !readInstanceConfig() ? <Navigate to="/setup" replace /> : <Outlet />
}

export default function App() {
  const routes = <Suspense fallback={<div role="status">Loading…</div>}><Routes>
    <Route path="/setup" element={<InstanceSetupPage />} />
    <Route element={<ConfiguredApp />}>
      <Route path="/" element={<Navigate to="/player" replace />} />
      <Route path="/auth" element={<AuthPage />} />
      <Route path="/player" element={<PlayerLayout />}>
        <Route index element={<PlayerPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="downloads" element={<DownloadsPage />} />
        <Route path="admin-settings" element={<AdminSettingsPage />} />
        <Route path="playlists" element={<PlaylistsPage />} />
        <Route path="playlists/:id" element={<PlaylistDetailPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/player" replace />} />
    </Route>
  </Routes></Suspense>

  if (!__FUZE_DESKTOP_BUILD__ || !platform.isNative || !platform.isDesktop || !DesktopTitlebar) return routes

  return <div className="desktop-window">
    <Suspense fallback={null}><DesktopTitlebar /></Suspense>
    <main className="desktop-window__content">{routes}</main>
  </div>
}
