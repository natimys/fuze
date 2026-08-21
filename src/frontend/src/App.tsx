import { Navigate, Route, Routes } from 'react-router-dom'
import PlayerLayout from './PlayerLayout'
import AdminSettingsPage from './pages/AdminSettingsPage'
import AuthPage from './pages/AuthPage'
import PlayerPage from './pages/PlayerPage'
import PlaylistDetailPage from './pages/PlaylistDetailPage'
import PlaylistsPage from './pages/PlaylistsPage'
import SettingsPage from './pages/SettingsPage'

export default function App() {
  return <Routes>
    <Route path="/" element={<Navigate to="/player" replace />} />
    <Route path="/auth" element={<AuthPage />} />
    <Route path="/player" element={<PlayerLayout />}>
      <Route index element={<PlayerPage />} />
      <Route path="settings" element={<SettingsPage />} />
      <Route path="admin-settings" element={<AdminSettingsPage />} />
      <Route path="playlists" element={<PlaylistsPage />} />
      <Route path="playlists/:id" element={<PlaylistDetailPage />} />
    </Route>
    <Route path="*" element={<Navigate to="/player" replace />} />
  </Routes>
}
