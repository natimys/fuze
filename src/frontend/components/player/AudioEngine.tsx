'use client'

import { useEffect, useRef } from 'react'
import { api } from '@/lib/api'
import { usePlayerStore } from '@/lib/store'
import { audioContext } from './audioContext'

const wait = (ms: number, signal: AbortSignal) => new Promise<void>((resolve, reject) => {
  const timer = window.setTimeout(resolve, ms)
  signal.addEventListener('abort', () => { window.clearTimeout(timer); reject(new DOMException('Aborted', 'AbortError')) }, { once: true })
})

export function AudioEngine() {
  const config = usePlayerStore((state) => state.config)
  const currentTrack = usePlayerStore((state) => state.currentTrack)
  const isPlaying = usePlayerStore((state) => state.isPlaying)
  const volume = usePlayerStore((state) => state.volume)
  const isMuted = usePlayerStore((state) => state.isMuted)
  const isRepeating = usePlayerStore((state) => state.isRepeating)
  const queue = usePlayerStore((state) => state.queue)
  const hydrate = usePlayerStore((state) => state.hydrate)
  const setIsPlaying = usePlayerStore((state) => state.setIsPlaying)
  const setCurrentTrack = usePlayerStore((state) => state.setCurrentTrack)
  const setCurrentTime = usePlayerStore((state) => state.setCurrentTime)
  const setDuration = usePlayerStore((state) => state.setDuration)
  const setIsLoading = usePlayerStore((state) => state.setIsLoading)
  const setPlaybackError = usePlayerStore((state) => state.setPlaybackError)
  const updateQueueTrack = usePlayerStore((state) => state.updateQueueTrack)
  const playNext = usePlayerStore((state) => state.playNext)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const preparationIdentity = currentTrack ? `${currentTrack.key}:${currentTrack.track_id ?? 'new'}` : null

  useEffect(() => hydrate(), [hydrate])

  useEffect(() => {
    if (!config?.features.playback || audioRef.current) return
    const audio = new Audio()
    const initialState = usePlayerStore.getState()
    audio.volume = initialState.isMuted ? 0 : initialState.volume
    audioRef.current = audio
    audioContext.current = audio

    const onTime = () => { if (!audioContext.isDragging) setCurrentTime(audio.currentTime) }
    const onMetadata = () => setDuration(Number.isFinite(audio.duration) ? audio.duration : 0)
    const onError = () => {
      if (!audio.hasAttribute('src')) return
      setIsPlaying(false); setIsLoading(false); setPlaybackError('Playback failed. Retry the track.')
    }
    audio.addEventListener('timeupdate', onTime)
    audio.addEventListener('loadedmetadata', onMetadata)
    audio.addEventListener('error', onError)
    return () => {
      audio.pause(); audio.removeAttribute('src'); audio.load()
      audio.removeEventListener('timeupdate', onTime)
      audio.removeEventListener('loadedmetadata', onMetadata)
      audio.removeEventListener('error', onError)
      audioContext.current = null
      audioRef.current = null
    }
  }, [config?.features.playback, setCurrentTime, setDuration, setIsPlaying, setIsLoading, setPlaybackError])

  useEffect(() => {
    const track = usePlayerStore.getState().currentTrack
    if (!config?.features.playback || !track?.track_id || track.availability === 'ready') return
    const controller = new AbortController()
    const prepare = async () => {
      setIsLoading(true); setPlaybackError(null)
      try {
        const acquired = await api.tracks.acquire(track.source, track.source_id)
        let status = acquired.status
        let failureMessage: string | null = null
        updateQueueTrack(track.key, { track_id: acquired.track_id, availability: status })
        while (status === 'queued' || status === 'downloading') {
          await wait(1200, controller.signal)
          const detail = await api.tracks.get(acquired.track_id, controller.signal)
          status = detail.download_status
          failureMessage = detail.download_error_message ?? detail.download_error_code ?? null
          updateQueueTrack(track.key, {
            availability: status,
            error_code: detail.download_error_code,
            error_message: detail.download_error_message,
          })
        }
        if (status === 'failed') throw new Error(failureMessage ?? 'Track download failed. Select the track to retry.')
      } catch (error) {
        if (!(error instanceof DOMException && error.name === 'AbortError')) {
          const message = error instanceof Error ? error.message : 'Unable to prepare track.'
          updateQueueTrack(track.key, { error_message: message })
          setPlaybackError(message)
        }
      } finally { if (!controller.signal.aborted) setIsLoading(false) }
    }
    void prepare()
    return () => controller.abort()
  }, [config?.features.playback, preparationIdentity, setIsLoading, setPlaybackError, updateQueueTrack])

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return
    const onEnded = () => {
      if (isRepeating) {
        audio.currentTime = 0
        void audio.play().then(() => setIsPlaying(true)).catch(() => setPlaybackError('Playback could not restart.'))
      } else playNext()
    }
    audio.addEventListener('ended', onEnded)
    return () => audio.removeEventListener('ended', onEnded)
  }, [isRepeating, playNext, setIsPlaying, setPlaybackError])

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return
    audio.pause(); audio.removeAttribute('src'); audio.load()
    setIsPlaying(false); setCurrentTime(0); setDuration(0); setPlaybackError(null)
    if (!currentTrack?.track_id || currentTrack.availability !== 'ready') return
    const controller = new AbortController()
    setIsLoading(true)
    void api.tracks.stream(currentTrack.track_id, controller.signal).then(async (response) => {
      if (controller.signal.aborted) return
      audio.src = response.url
      audio.load()
      await audio.play()
      if (!controller.signal.aborted) setIsPlaying(true)
    }).catch((error: unknown) => {
      if (!controller.signal.aborted) setPlaybackError(error instanceof Error ? error.message : 'Unable to start playback.')
    }).finally(() => { if (!controller.signal.aborted) setIsLoading(false) })
    return () => controller.abort()
  }, [currentTrack, setIsPlaying, setCurrentTime, setDuration, setIsLoading, setPlaybackError])

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return
    if (isPlaying) {
      void audio.play().then(() => setPlaybackError(null)).catch(() => {
        setIsPlaying(false); setPlaybackError('Playback was blocked or the stream is unavailable.')
      })
    } else audio.pause()
  }, [isPlaying, setIsPlaying, setPlaybackError])

  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = isMuted ? 0 : volume
  }, [volume, isMuted])

  useEffect(() => {
    if (queue.length !== 0 || !currentTrack) return
    const audio = audioRef.current
    if (audio) { audio.pause(); audio.currentTime = 0 }
    setCurrentTrack(null); setIsPlaying(false); setCurrentTime(0); setDuration(0)
  }, [queue.length, currentTrack, setCurrentTrack, setIsPlaying, setCurrentTime, setDuration])

  return null
}
