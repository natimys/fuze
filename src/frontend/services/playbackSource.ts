import { mediaStorage } from './mediaStorage'
import { resolveRemoteUrl } from './runtimeConfig'

export async function resolvePlaybackSource(trackId: number, remoteUrl: string): Promise<string> {
  return await mediaStorage.resolvePlaybackSource(String(trackId)) ?? resolveRemoteUrl(remoteUrl)
}
