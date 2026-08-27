import type { TrackSearchResult } from '@/lib/types'
import { resolveRemoteUrl } from './runtimeConfig'

export function syncMediaSession(track: TrackSearchResult | null, actions: { play(): void; pause(): void; next(): void; previous(): void }): void {
  if (!('mediaSession' in navigator)) return
  navigator.mediaSession.metadata = track ? new MediaMetadata({
    title: track.title,
    artist: track.artist,
    album: track.album ?? '',
    artwork: track.cover_url ? [{ src: resolveRemoteUrl(track.cover_url) }] : [],
  }) : null
  for (const [name, handler] of Object.entries({ play: actions.play, pause: actions.pause, nexttrack: actions.next, previoustrack: actions.previous })) {
    try { navigator.mediaSession.setActionHandler(name as MediaSessionAction, handler) } catch { /* unsupported by this WebView */ }
  }
}
