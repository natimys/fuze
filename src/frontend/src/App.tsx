import { Navigate, Outlet, Route, Routes } from 'react-router-dom'
import PlayerLayout from './PlayerLayout'
import AdminSettingsPage from './pages/AdminSettingsPage'
import AuthPage from './pages/AuthPage'
import PlayerPage from './pages/PlayerPage'
import PlaylistDetailPage from './pages/PlaylistDetailPage'
import PlaylistsPage from './pages/PlaylistsPage'
import SettingsPage from './pages/SettingsPage'
import DownloadsPage from './pages/DownloadsPage'
import InstanceSetupPage from './pages/InstanceSetupPage'
import { platform } from '@/platform'
import { readInstanceConfig } from '@/services/runtimeConfig'

function ConfiguredApp() {
  return platform.isNative && !readInstanceConfig() ? <Navigate to="/setup" replace /> : <Outlet />
}

export default function App() {
  return <Routes>
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
  </Routes>
}
