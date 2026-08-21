import { Outlet } from 'react-router-dom'
import { AudioEngine } from '@/components/player/AudioEngine'
import { MiniPlayer } from '@/components/player/MiniPlayer'

export default function PlayerLayout() {
  return <><AudioEngine /><Outlet /><MiniPlayer /></>
}
