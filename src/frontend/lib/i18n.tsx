import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'

export type Locale = 'ru' | 'en'
const STORAGE_KEY = 'fuze-language'

const messages = {
  ru: {
    loading: 'Загрузка…', home: 'Главная', playlists: 'Плейлисты', downloads: 'Загрузки', importMusic: 'Перенести музыку', search: 'Поиск', settings: 'Настройки', adminSettings: 'Настройки сервера', library: 'Коллекция', navigation: 'Навигация', closeNavigation: 'Закрыть навигацию', signOut: 'Выйти', signOutFailed: 'Не удалось выйти. Попробуйте ещё раз.',
    welcomeEyebrow: 'ПЕРВЫЙ ЗАПУСК', welcomeTitle: 'Вся ваша музыка — в одном месте', welcomeText: 'Fuze собирает плейлисты в кассеты и даёт слушать их в простом, знакомом плеере.', tapes: 'Кассеты', tapesText: 'Ваши плейлисты находятся слева и в коллекции.', player: 'Плеер', playerText: 'Управление воспроизведением всегда внизу.', searchText: 'Добавляйте музыку через поиск или ⌘ K.', essentials: 'Основное', essentialsText: 'Коллекция, загрузки и настройки доступны в меню.', transferTitle: 'Уже есть музыка в другом сервисе?', transferText: 'Перенесите плейлисты из Яндекс Музыки, Spotify или CSV.', start: 'Начать пользоваться Fuze', transfer: 'Перенести мою музыку', language: 'Язык', russian: 'Русский', english: 'English',
    thisDevice: 'Это устройство', settingsTitle: 'Настройки', settingsDescription: 'Язык, воспроизведение и офлайн-медиа на этом устройстве.', offlineMedia: 'Офлайн-медиа', unknown: 'Неизвестно', used: 'использовано', available: 'доступно', persistentStorage: 'Постоянное хранилище браузера', granted: 'разрешено', notGranted: 'не разрешено', unavailable: 'недоступно', storageWarning: 'Браузер может удалить загрузки; приложение для компьютера надёжнее.', requestStorage: 'Запросить постоянное хранилище', clearMedia: 'Удалить локальные медиа', clearConfirm: 'Удалить все офлайн-треки с этого устройства?', quality: 'Качество будущих загрузок', original: 'Оригинал', balanced: 'Сбалансированное', compact: 'Компактное', instance: 'Экземпляр Fuze', changeInstance: 'Сменить экземпляр',
    legal: 'Правовая информация', legalText: 'Fuze — некоммерческий Open Source проект для самостоятельного размещения. Автор проекта не предоставляет и не планирует предоставлять готовый сервис. За работу конкретного экземпляра и обработку данных отвечает его владелец.', privacy: 'Конфиденциальность', terms: 'Условия использования', deleteAccount: 'Удалить аккаунт и данные', deleteWarning: 'Аккаунт, плейлисты и связанные данные будут удалены безвозвратно. Продолжить?', deleteBlocked: 'Последнего активного администратора нельзя удалить. Сначала назначьте другого администратора.',
  },
  en: {
    loading: 'Loading…', home: 'Home', playlists: 'Playlists', downloads: 'Downloads', importMusic: 'Import music', search: 'Search', settings: 'Settings', adminSettings: 'Admin Settings', library: 'Library', navigation: 'Navigation', closeNavigation: 'Close navigation', signOut: 'Sign out', signOutFailed: 'Sign out failed. Please retry.',
    welcomeEyebrow: 'FIRST PLAY', welcomeTitle: 'All your music in one place', welcomeText: 'Fuze gathers playlists into tapes and lets you play them in a simple, familiar player.', tapes: 'Tapes', tapesText: 'Your playlists are in the sidebar and the collection.', player: 'Player', playerText: 'Playback controls are always at the bottom.', searchText: 'Add music through Search or ⌘ K.', essentials: 'Essentials', essentialsText: 'Collection, downloads, and settings are available from the menu.', transferTitle: 'Already have music in another service?', transferText: 'Import playlists from Yandex Music, Spotify, or CSV.', start: 'Start using Fuze', transfer: 'Import my music', language: 'Language', russian: 'Русский', english: 'English',
    thisDevice: 'This device', settingsTitle: 'Settings', settingsDescription: 'Language, playback, and offline-media preferences for this device.', offlineMedia: 'Offline media', unknown: 'Unknown', used: 'used', available: 'available', persistentStorage: 'Persistent browser storage', granted: 'granted', notGranted: 'not granted', unavailable: 'unavailable', storageWarning: 'Browser downloads can be evicted; the desktop app is more reliable.', requestStorage: 'Request persistent storage', clearMedia: 'Clear local media', clearConfirm: 'Remove every offline track from this device?', quality: 'Quality for future downloads', original: 'Original', balanced: 'Balanced', compact: 'Compact', instance: 'Fuze instance', changeInstance: 'Change instance',
    legal: 'Legal', legalText: 'Fuze is a non-commercial Open Source project intended for self-hosting. The project author does not provide and does not plan to provide a hosted service. The operator of each instance is responsible for its operation and data processing.', privacy: 'Privacy', terms: 'Terms of use', deleteAccount: 'Delete account and data', deleteWarning: 'Your account, playlists, and related data will be permanently deleted. Continue?', deleteBlocked: 'The last active administrator cannot be deleted. Assign another administrator first.',
  },
} as const

type MessageKey = keyof typeof messages.en
type I18nValue = { locale: Locale; setLocale: (locale: Locale) => void; t: (key: MessageKey) => string }
const defaultValue: I18nValue = { locale: 'en', setLocale: () => undefined, t: (key) => messages.en[key] }
const I18nContext = createContext<I18nValue>(defaultValue)

function initialLocale(): Locale {
  const stored = localStorage.getItem(STORAGE_KEY)
  if (stored === 'ru' || stored === 'en') return stored
  return navigator.language.toLowerCase().startsWith('ru') ? 'ru' : 'en'
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(initialLocale)
  const setLocale = (value: Locale) => { localStorage.setItem(STORAGE_KEY, value); setLocaleState(value) }
  useEffect(() => { document.documentElement.lang = locale }, [locale])
  const value = useMemo(() => ({ locale, setLocale, t: (key: MessageKey) => messages[locale][key] }), [locale])
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n() {
  return useContext(I18nContext)
}
