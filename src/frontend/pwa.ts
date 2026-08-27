import { registerSW } from 'virtual:pwa-register'

export const updateServiceWorker = registerSW({
  immediate: true,
  onNeedRefresh() { window.dispatchEvent(new CustomEvent('fuze:pwa-update', { detail: updateServiceWorker })) },
})
