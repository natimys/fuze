import { afterEach, describe, expect, it, vi } from 'vitest'
import { api } from '@/lib/api'

afterEach(() => vi.restoreAllMocks())

describe('API errors', () => {
  it('turns FastAPI validation details into a readable message', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      detail: [
        { loc: ['body', 'title'], msg: 'String should have at least 1 character', type: 'string_too_short' },
        { loc: ['body', 'description'], msg: 'String should have at most 255 characters', type: 'string_too_long' },
      ],
    }), { status: 422, headers: { 'Content-Type': 'application/json' } }))

    await expect(api.playlists.create({ title: '' })).rejects.toEqual(expect.objectContaining({
      name: 'ApiError',
      message: 'String should have at least 1 character. String should have at most 255 characters',
      status: 422,
    }))
  })

  it('preserves AbortError so cancelled UI work stays silent', async () => {
    const controller = new AbortController()
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (_input, init) => {
      controller.abort()
      init?.signal?.throwIfAborted()
      return new Response()
    })

    await expect(api.tracks.search('cancelled', controller.signal)).rejects.toEqual(
      expect.objectContaining({ name: 'AbortError' }),
    )
  })

  it('replaces bare server status errors with a useful user message', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 500 }))
    await expect(api.config()).rejects.toMatchObject({ status: 500, message: expect.not.stringContaining('Request failed') })
  })

  it('shares one refresh and retries each protected request only once', async () => {
    let refreshCalls = 0
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input)
      if (url.endsWith('/auth/refresh')) {
        refreshCalls += 1
        await Promise.resolve()
        return new Response(null, { status: 204 })
      }
      if (url.endsWith('/auth/me')) {
        const meCalls = vi.mocked(globalThis.fetch).mock.calls.filter(([value]) => String(value).endsWith('/auth/me')).length
        if (meCalls <= 2) return new Response(null, { status: 401 })
        return Response.json({ id: 1, name: 'Ada', email: 'ada@example.com', role: 'user', is_active: true })
      }
      return new Response(null, { status: 404 })
    })

    const [first, second] = await Promise.all([api.auth.me(), api.auth.me()])
    expect(first.id).toBe(1)
    expect(second.id).toBe(1)
    expect(refreshCalls).toBe(1)
  })

  it('does not refresh a failed login', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ detail: 'Invalid credentials' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      }),
    )

    await expect(api.auth.login({ email: 'ada@example.com', password: 'wrong-password' })).rejects.toEqual(
      expect.objectContaining({ status: 401 }),
    )
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(String(fetchMock.mock.calls[0][0])).toMatch(/\/auth\/login$/)
  })

  it('sends the readable double-submit CSRF cookie on mutations', async () => {
    document.cookie = 'csrf_access_token=encoded%20token; path=/'
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      Response.json({ id: 3, owner_id: 1, title: 'Focus', description: null, tracks_count: 0, created_at: '', updated_at: '' }),
    )

    await api.playlists.create({ title: 'Focus' })

    const options = fetchMock.mock.calls[0][1]
    expect(new Headers(options?.headers).get('X-CSRF-TOKEN')).toBe('encoded token')
    expect(options?.credentials).toBe('include')
  })
})
