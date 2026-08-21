import { platform } from '@/platform'

export type OfflineAvailability = 'online' | 'cached' | 'downloaded' | 'unavailable'

export interface MediaStorage {
  has(trackId: string): Promise<boolean>
  save(trackId: string, data: Blob): Promise<void>
  remove(trackId: string): Promise<void>
  resolvePlaybackSource(trackId: string): Promise<string | null>
}

const safeKey = (trackId: string) => trackId.replace(/[^a-zA-Z0-9._-]/g, '_')

class BrowserMediaStorage implements MediaStorage {
  private cache = 'fuze-explicit-media-v1'
  private request(trackId: string) { return new Request(`/__fuze_offline_media__/${safeKey(trackId)}`) }
  async has(trackId: string) { return Boolean(await (await caches.open(this.cache)).match(this.request(trackId))) }
  async save(trackId: string, data: Blob) { await (await caches.open(this.cache)).put(this.request(trackId), new Response(data)) }
  async remove(trackId: string) { await (await caches.open(this.cache)).delete(this.request(trackId)) }
  async resolvePlaybackSource(trackId: string) {
    const response = await (await caches.open(this.cache)).match(this.request(trackId))
    return response ? URL.createObjectURL(await response.blob()) : null
  }
}

class NativeMediaStorage implements MediaStorage {
  private file(trackId: string) { return `media/${safeKey(trackId)}.bin` }
  async has(trackId: string) {
    const { exists, BaseDirectory } = await import('@tauri-apps/plugin-fs')
    return exists(this.file(trackId), { baseDir: BaseDirectory.AppData })
  }
  async save(trackId: string, data: Blob) {
    const { mkdir, writeFile, BaseDirectory } = await import('@tauri-apps/plugin-fs')
    await mkdir('media', { baseDir: BaseDirectory.AppData, recursive: true })
    await writeFile(this.file(trackId), new Uint8Array(await data.arrayBuffer()), { baseDir: BaseDirectory.AppData })
  }
  async remove(trackId: string) {
    const { remove, BaseDirectory } = await import('@tauri-apps/plugin-fs')
    await remove(this.file(trackId), { baseDir: BaseDirectory.AppData })
  }
  async resolvePlaybackSource(trackId: string) {
    if (!await this.has(trackId)) return null
    const { readFile, BaseDirectory } = await import('@tauri-apps/plugin-fs')
    return URL.createObjectURL(new Blob([await readFile(this.file(trackId), { baseDir: BaseDirectory.AppData })]))
  }
}

export const mediaStorage: MediaStorage = platform.canUseNativeFilesystem ? new NativeMediaStorage() : new BrowserMediaStorage()
