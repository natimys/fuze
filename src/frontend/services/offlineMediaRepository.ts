import type { TrackDownloadDescriptor } from '@/lib/types'

export type OfflineDownloadState = 'queued' | 'downloading' | 'verifying' | 'available' | 'paused' | 'failed' | 'stale' | 'removing'

export interface OfflineDownload {
  trackId: number
  title: string
  artist: string
  mediaVersion: string
  contentType: string
  contentLength: number
  etag: string | null
  checksum: string | null
  state: OfflineDownloadState
  attempts: number
  downloadedBytes: number
  error: string | null
  updatedAt: string
}

export interface StorageUsage { usage: number; quota: number | null; persistent: boolean | null }
export type OfflineMediaEvent = { type: 'changed'; download: OfflineDownload } | { type: 'removed'; trackId: number }

const CACHE_NAME = 'fuze-explicit-media-v1'
const DB_NAME = 'fuze-offline-media-v1'
const STORE_NAME = 'downloads'
const MAX_CONCURRENT = 2
const SYSTEM_RESERVE = 64 * 1024 * 1024
const mediaRequest = (trackId: number) => new Request(`/__fuze_offline_media__/${trackId}`)

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1)
    request.onupgradeneeded = () => request.result.createObjectStore(STORE_NAME, { keyPath: 'trackId' })
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function transaction<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const database = await openDatabase()
  return new Promise((resolve, reject) => {
    const tx = database.transaction(STORE_NAME, mode)
    const request = run(tx.objectStore(STORE_NAME))
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
    tx.oncomplete = () => database.close()
  })
}

class BrowserOfflineMediaRepository extends EventTarget {
  private queue: number[] = []
  private controllers = new Map<number, AbortController>()
  private descriptors = new Map<number, TrackDownloadDescriptor>()

  async list(): Promise<OfflineDownload[]> {
    return transaction('readonly', (store) => store.getAll())
  }

  async get(trackId: number): Promise<OfflineDownload | undefined> {
    return transaction('readonly', (store) => store.get(trackId))
  }

  async enqueue(descriptor: TrackDownloadDescriptor, metadata: { title: string; artist: string }): Promise<void> {
    const existing = await this.get(descriptor.track_id)
    const download: OfflineDownload = {
      trackId: descriptor.track_id, title: metadata.title, artist: metadata.artist,
      mediaVersion: descriptor.media_version, contentType: descriptor.content_type,
      contentLength: descriptor.content_length, etag: descriptor.etag, checksum: descriptor.checksum,
      state: 'queued', attempts: existing?.attempts ?? 0, downloadedBytes: 0, error: null,
      updatedAt: new Date().toISOString(),
    }
    this.descriptors.set(download.trackId, descriptor)
    await this.save(download)
    if (!this.queue.includes(download.trackId)) this.queue.push(download.trackId)
    void this.drain()
  }

  async pause(trackId: number): Promise<void> {
    this.queue = this.queue.filter((id) => id !== trackId)
    this.controllers.get(trackId)?.abort()
    const download = await this.get(trackId)
    if (download) await this.save({ ...download, state: 'paused', updatedAt: new Date().toISOString() })
  }

  async resume(trackId: number, descriptor?: TrackDownloadDescriptor): Promise<void> {
    const download = await this.get(trackId)
    if (!download) throw new Error('Download not found')
    if (descriptor) this.descriptors.set(trackId, descriptor)
    if (!this.descriptors.has(trackId)) throw new Error('A fresh download URL is required')
    await this.save({ ...download, state: 'queued', error: null, updatedAt: new Date().toISOString() })
    if (!this.queue.includes(trackId)) this.queue.push(trackId)
    void this.drain()
  }

  async cancel(trackId: number): Promise<void> { await this.pause(trackId); await this.remove(trackId) }

  async remove(trackId: number): Promise<void> {
    this.controllers.get(trackId)?.abort()
    const current = await this.get(trackId)
    if (current) await this.save({ ...current, state: 'removing', updatedAt: new Date().toISOString() })
    await (await caches.open(CACHE_NAME)).delete(mediaRequest(trackId))
    await transaction('readwrite', (store) => store.delete(trackId))
    this.dispatchEvent(new CustomEvent<OfflineMediaEvent>('change', { detail: { type: 'removed', trackId } }))
  }

  async verify(trackId: number): Promise<boolean> {
    const [download, response] = await Promise.all([this.get(trackId), (await caches.open(CACHE_NAME)).match(mediaRequest(trackId))])
    if (!download || !response) return false
    const size = Number(response.headers.get('Content-Length'))
    const valid = (!Number.isFinite(size) || size === download.contentLength) && (!download.etag || response.headers.get('ETag')?.replaceAll('"', '') === download.etag)
    await this.save({ ...download, state: valid ? 'available' : 'stale', error: valid ? null : 'Downloaded file failed verification', updatedAt: new Date().toISOString() })
    if (!valid) await (await caches.open(CACHE_NAME)).delete(mediaRequest(trackId))
    return valid
  }

  async open(trackId: number): Promise<string | null> {
    const download = await this.get(trackId)
    if (download?.state !== 'available') return null
    return (await (await caches.open(CACHE_NAME)).match(mediaRequest(trackId))) ? mediaRequest(trackId).url : null
  }

  async usage(): Promise<StorageUsage> {
    const estimate = await navigator.storage?.estimate?.()
    const persistent = navigator.storage?.persisted ? await navigator.storage.persisted() : null
    return { usage: estimate?.usage ?? 0, quota: estimate?.quota ?? null, persistent }
  }

  async requestPersistentStorage(): Promise<boolean | null> {
    return navigator.storage?.persist ? navigator.storage.persist() : null
  }

  async clear(): Promise<void> {
    for (const controller of this.controllers.values()) controller.abort()
    this.queue = []
    await caches.delete(CACHE_NAME)
    const downloads = await this.list()
    await Promise.all(downloads.map((item) => transaction('readwrite', (store) => store.delete(item.trackId))))
    downloads.forEach((item) => this.dispatchEvent(new CustomEvent<OfflineMediaEvent>('change', { detail: { type: 'removed', trackId: item.trackId } })))
  }

  subscribe(listener: (event: OfflineMediaEvent) => void): () => void {
    const handler = (event: Event) => listener((event as CustomEvent<OfflineMediaEvent>).detail)
    this.addEventListener('change', handler)
    return () => this.removeEventListener('change', handler)
  }

  private async save(download: OfflineDownload): Promise<void> {
    await transaction('readwrite', (store) => store.put(download))
    this.dispatchEvent(new CustomEvent<OfflineMediaEvent>('change', { detail: { type: 'changed', download } }))
  }

  private async drain(): Promise<void> {
    while (this.controllers.size < MAX_CONCURRENT && this.queue.length) {
      const trackId = this.queue.shift()!
      const descriptor = this.descriptors.get(trackId)
      if (!descriptor) continue
      const controller = new AbortController()
      this.controllers.set(trackId, controller)
      void this.download(descriptor, controller).finally(() => { this.controllers.delete(trackId); void this.drain() })
    }
  }

  private async download(descriptor: TrackDownloadDescriptor, controller: AbortController): Promise<void> {
    const current = await this.get(descriptor.track_id)
    if (!current) return
    try {
      const estimate = await navigator.storage?.estimate?.()
      if (estimate?.quota && estimate.quota - (estimate.usage ?? 0) < descriptor.content_length + SYSTEM_RESERVE) throw new Error('Not enough device storage')
      await this.save({ ...current, state: 'downloading', attempts: current.attempts + 1, error: null, updatedAt: new Date().toISOString() })
      const response = await fetch(descriptor.url, { signal: controller.signal })
      if (!response.ok || !response.body) throw new Error(`Download failed (${response.status})`)
      let downloadedBytes = 0
      let lastReported = 0
      const progress = new TransformStream<Uint8Array, Uint8Array>({ transform: async (chunk, stream) => {
        downloadedBytes += chunk.byteLength
        stream.enqueue(chunk)
        if (downloadedBytes - lastReported >= 512 * 1024) {
          lastReported = downloadedBytes
          const active = await this.get(descriptor.track_id)
          if (active?.state === 'downloading') await this.save({ ...active, downloadedBytes, updatedAt: new Date().toISOString() })
        }
      } })
      const headers = new Headers(response.headers)
      headers.set('Content-Type', descriptor.content_type)
      headers.set('Content-Length', String(descriptor.content_length))
      if (descriptor.etag) headers.set('ETag', descriptor.etag)
      await (await caches.open(CACHE_NAME)).put(mediaRequest(descriptor.track_id), new Response(response.body.pipeThrough(progress), { status: 200, headers }))
      const downloaded = await this.get(descriptor.track_id)
      if (!downloaded) return
      await this.save({ ...downloaded, state: 'verifying', downloadedBytes, updatedAt: new Date().toISOString() })
      if (!await this.verify(descriptor.track_id)) throw new Error('Downloaded file failed verification')
    } catch (error) {
      if (controller.signal.aborted) return
      await (await caches.open(CACHE_NAME)).delete(mediaRequest(descriptor.track_id))
      const failed = await this.get(descriptor.track_id)
      if (failed) await this.save({ ...failed, state: 'failed', error: error instanceof Error ? error.message : 'Download failed', updatedAt: new Date().toISOString() })
    }
  }
}

export const offlineMediaRepository = new BrowserOfflineMediaRepository()
