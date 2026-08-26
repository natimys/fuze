import { CassetteTape, MagnifyingGlass, Play, SlidersHorizontal } from '@phosphor-icons/react'
import { motion } from 'motion/react'
import { FuzeButton } from '@/components/fuze'

export const onboardingKey = (userId: number) => `fuze-onboarding-complete:${userId}`

export function FirstRunOnboarding({ userId, onFinish, onImport }: { userId: number; onFinish: () => void; onImport: () => void }) {
  function finish(action?: () => void) { localStorage.setItem(onboardingKey(userId), '1'); onFinish(); action?.() }
  return <motion.div className="fuze-onboarding" role="dialog" aria-modal="true" aria-labelledby="fuze-welcome" initial={{opacity:0}} animate={{opacity:1}}>
    <div className="fuze-onboarding-card"><img src="/brand/fuze-lockup.svg" alt="Fuze"/><header><span>FIRST PLAY</span><h1 id="fuze-welcome">Вся ваша музыка — в одном месте</h1><p>Fuze собирает плейлисты в кассеты и даёт слушать их в простом, знакомом плеере.</p></header>
      <div className="fuze-onboarding-guide"><div><CassetteTape/><b>Кассеты</b><small>Ваши плейлисты находятся слева и в Collection.</small></div><div><Play weight="fill"/><b>Плеер</b><small>Управление воспроизведением всегда внизу.</small></div><div><MagnifyingGlass/><b>Поиск</b><small>Добавляйте музыку через Search или ⌘ K.</small></div><div><SlidersHorizontal/><b>Основное</b><small>Коллекция, загрузки и настройки доступны в меню.</small></div></div>
      <div className="fuze-onboarding-transfer"><CassetteTape/><span><b>Уже есть музыка в другом сервисе?</b><small>Перенесите плейлисты из Яндекс Музыки, Spotify или CSV.</small></span></div>
      <div className="fuze-onboarding-actions"><FuzeButton onClick={()=>finish()}>Начать пользоваться Fuze</FuzeButton><FuzeButton variant="primary" onClick={()=>finish(onImport)}>Перенести мою музыку</FuzeButton></div>
    </div>
  </motion.div>
}
