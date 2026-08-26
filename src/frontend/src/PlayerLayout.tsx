import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { Outlet, useLocation } from 'react-router-dom'
import { AudioEngine } from '@/components/player/AudioEngine'
import { MiniPlayer } from '@/components/player/MiniPlayer'

export default function PlayerLayout() {
  const location = useLocation()
  const reduceMotion = useReducedMotion()

  return <>
    <AudioEngine />
    <AnimatePresence mode="sync" initial={false}>
      <motion.div
        key={location.pathname}
        className="fuze-route-stage"
        initial={reduceMotion ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={reduceMotion ? undefined : { opacity: 0 }}
        transition={{ duration: reduceMotion ? 0 : 0.18, ease: [0.16, 1, 0.3, 1] }}
      >
        <Outlet />
      </motion.div>
    </AnimatePresence>
    <AnimatePresence>
      {location.pathname !== '/player' && <motion.div
        key="mini-player"
        initial={reduceMotion ? false : { opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        exit={reduceMotion ? undefined : { opacity: 0, y: 12 }}
        transition={{ duration: reduceMotion ? 0 : 0.28, ease: [0.16, 1, 0.3, 1] }}
      ><MiniPlayer /></motion.div>}
    </AnimatePresence>
  </>
}
