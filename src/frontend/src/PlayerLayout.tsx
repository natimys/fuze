import { Outlet } from 'react-router-dom'
import { AudioEngine } from '@/components/player/AudioEngine'
import { MiniPlayer } from '@/components/player/MiniPlayer'
import { useLocation } from 'react-router-dom'

export default function PlayerLayout() {
  const { pathname } = useLocation()
  return <><AudioEngine /><Outlet />{pathname !== '/player' && <MiniPlayer />}</>
}
