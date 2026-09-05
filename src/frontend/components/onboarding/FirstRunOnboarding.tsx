import { CassetteTape, MagnifyingGlass, Play, SlidersHorizontal } from '@phosphor-icons/react'
import { motion } from 'motion/react'
import { FuzeButton } from '@/components/fuze'
import { useI18n } from '@/lib/i18n'

export const onboardingKey = (userId: number) => `fuze-onboarding-complete:${userId}`

export function FirstRunOnboarding({ userId, onFinish, onImport }: { userId: number; onFinish: () => void; onImport: () => void }) {
  const { locale, setLocale, t } = useI18n()
  function finish(action?: () => void) { localStorage.setItem(onboardingKey(userId), '1'); onFinish(); action?.() }
  return <motion.div className="fuze-onboarding" role="dialog" aria-modal="true" aria-labelledby="fuze-welcome" initial={{opacity:0}} animate={{opacity:1}}>
    <div className="fuze-onboarding-card"><img src="/brand/fuze-lockup.svg" alt="Fuze"/><header><span>{t('welcomeEyebrow')}</span><h1 id="fuze-welcome">{t('welcomeTitle')}</h1><p>{t('welcomeText')}</p></header>
      <label className="fuze-onboarding-language">{t('language')}<select value={locale} onChange={(event) => setLocale(event.target.value as 'ru' | 'en')}><option value="ru">{t('russian')}</option><option value="en">{t('english')}</option></select></label>
      <div className="fuze-onboarding-guide"><div><CassetteTape/><b>{t('tapes')}</b><small>{t('tapesText')}</small></div><div><Play weight="fill"/><b>{t('player')}</b><small>{t('playerText')}</small></div><div><MagnifyingGlass/><b>{t('search')}</b><small>{t('searchText')}</small></div><div><SlidersHorizontal/><b>{t('essentials')}</b><small>{t('essentialsText')}</small></div></div>
      <div className="fuze-onboarding-transfer"><CassetteTape/><span><b>{t('transferTitle')}</b><small>{t('transferText')}</small></span></div>
      <div className="fuze-onboarding-actions"><FuzeButton onClick={()=>finish()}>{t('start')}</FuzeButton><FuzeButton variant="primary" onClick={()=>finish(onImport)}>{t('transfer')}</FuzeButton></div>
    </div>
  </motion.div>
}
