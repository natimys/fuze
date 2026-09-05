import { Link, useLocation } from 'react-router-dom'
import { useI18n } from '@/lib/i18n'

export default function LegalPage() {
  const { locale, t } = useI18n()
  const privacy = useLocation().pathname === '/privacy'
  return <main className="fuze-service-screen"><article className="fuze-service-card fuze-service-card--wide">
    <img className="fuze-service-logo" src="/brand/fuze-lockup.svg" alt="Fuze" />
    <h1>{privacy ? t('privacy') : t('terms')}</h1>
    <p>{t('legalText')}</p>
    {privacy ? (locale === 'ru' ? <><h2>Какие данные хранит Fuze</h2><p>Конкретный экземпляр может хранить данные аккаунта, плейлисты, настройки, сессии, ключи доступа и загруженные медиа. Состав и сроки хранения определяет владелец экземпляра.</p><h2>Кто отвечает за данные</h2><p>Оператором данных является владелец self-hosted экземпляра. По вопросам доступа, исправления, экспорта или удаления обращайтесь к нему. Удалить собственный аккаунт и связанные данные можно в настройках.</p></> : <><h2>Data stored by Fuze</h2><p>An instance may store account details, playlists, settings, sessions, access keys, and downloaded media. The instance operator determines retention.</p><h2>Who is responsible</h2><p>The self-hosted instance owner is the data operator. Contact them for access, correction, export, or deletion. You can delete your account and related data in Settings.</p></>) : (locale === 'ru' ? <><h2>Условия</h2><p>Fuze предоставляется как Open Source программное обеспечение без готового публичного сервиса и без гарантий. Устанавливая экземпляр, его владелец отвечает за безопасность, резервное копирование, пользователей и соблюдение применимых правил.</p><h2>Внешние провайдеры</h2><p>Подключаемые YouTube, Яндекс Музыка и Spotify являются независимыми сервисами со своими условиями. Владелец экземпляра обязан включать только те интеграции и способы использования, на которые у него есть право.</p></> : <><h2>Terms</h2><p>Fuze is provided as Open Source software, without a hosted public service or warranties. An instance owner is responsible for security, backups, users, and compliance with applicable rules.</p><h2>External providers</h2><p>Optional YouTube, Yandex Music, and Spotify integrations are independent services with their own terms. The instance owner must enable only integrations and uses they are entitled to use.</p></>)}
    <p><Link className="fuze-service-link" to="/player/settings">← {t('settings')}</Link></p>
  </article></main>
}
