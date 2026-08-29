import { expect, test, type Page } from '@playwright/test'

const user = { id: 7, name: 'Ada', email: 'ada@example.com', role: 'user', is_active: true }
const track = {
  id: 101,
  title: 'Midnight Signal',
  artist: 'Night Drive',
  album: 'Neon Lines',
  release_year: 2026,
  duration_ms: 183_000,
  cover_url: null,
  source: 'youtube',
  source_id: 'yt-101',
  download_status: 'ready',
  download_attempts: 1,
  download_error_code: null,
  download_error_message: null,
}

async function installApi(page: Page) {
  let meCalls = 0
  let playlistCreated = false
  let playlistItems: Array<{ id: number; position: number; track: typeof track }> = []
  const calls: string[] = []
  const csrfHeaders: string[] = []

  await page.context().addCookies([
    { name: 'csrf_access_token', value: 'access-csrf', url: 'http://127.0.0.1:3100' },
    { name: 'csrf_refresh_token', value: 'refresh-csrf', url: 'http://127.0.0.1:3100' },
  ])

  await page.route('**/api/v1/**', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    const path = url.pathname.replace('/api/v1', '')
    const method = request.method()
    calls.push(`${method} ${path}`)
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
      csrfHeaders.push(request.headers()['x-csrf-token'] ?? '')
    }

    const json = (body: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
    if (method === 'GET' && path === '/config') return json({
      auth: { mode: 'password', registration: true },
      features: { playback: true },
      providers: { youtube: true, yandex: false, spotify: false },
    })
    if (method === 'POST' && path === '/auth/login') return json(user)
    if (method === 'GET' && path === '/auth/me') {
      meCalls += 1
      return meCalls === 1 ? json({ detail: 'Expired access token' }, 401) : json(user)
    }
    if (method === 'POST' && path === '/auth/refresh') return route.fulfill({ status: 204 })
    if (method === 'GET' && path === '/tracks/search') return json({
      data: [{
        key: 'youtube:yt-101', track_id: null, source: 'youtube', capability: 'acquire', availability: 'remote',
        title: track.title, artist: track.artist, album: track.album, year: track.release_year,
        duration_ms: track.duration_ms, cover_url: null, source_id: track.source_id, external_url: null,
      }],
      query: url.searchParams.get('q'),
      providers: { youtube: { status: 'ok', cached: false } },
    })
    if (method === 'POST' && path === '/tracks/acquire') return json({ status: 'queued', track_id: track.id }, 202)
    if (method === 'GET' && path === `/tracks/${track.id}`) return json(track)
    if (method === 'GET' && path === `/tracks/${track.id}/stream`) {
      return json({ url: 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAESsAAABAAgAZGF0YQAAAAA=' })
    }
    if (method === 'GET' && path === '/playlists') {
      return json(playlistCreated ? [{ id: 1, owner_id: user.id, title: 'Focus Mix', description: 'Deep work', tracks_count: playlistItems.length, created_at: '2026-08-18T00:00:00Z', updated_at: '2026-08-18T00:00:00Z' }] : [])
    }
    if (method === 'POST' && path === '/playlists') {
      playlistCreated = true
      return json({ id: 1, owner_id: user.id, title: 'Focus Mix', description: 'Deep work', tracks_count: 0, created_at: '2026-08-18T00:00:00Z', updated_at: '2026-08-18T00:00:00Z' }, 201)
    }
    if (method === 'GET' && path === '/playlists/1') {
      return json({ id: 1, owner_id: user.id, title: 'Focus Mix', description: 'Deep work', tracks_count: playlistItems.length, created_at: '2026-08-18T00:00:00Z', updated_at: '2026-08-18T00:00:00Z', items: playlistItems })
    }
    if (method === 'POST' && path === '/playlists/1/items') {
      const item = { id: 501, position: playlistItems.length, track }
      playlistItems = [...playlistItems, item]
      return json(item, 201)
    }
    return json({ detail: `Unhandled test route: ${method} ${path}` }, 500)
  })

  return { calls, csrfHeaders }
}

test('login, refresh, acquire, playback, and playlists work as one browser flow', async ({ page }) => {
  const api = await installApi(page)
  await page.setViewportSize({ width: 1440, height: 900 })

  await page.goto('/auth')
  await page.getByLabel('Email').fill('ada@example.com')
  await page.getByLabel('Password').fill('correct-horse')
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page).toHaveURL(/\/player$/)
  await expect(page.getByText('No track selected')).toBeVisible()
  expect(api.calls).toContain('POST /auth/refresh')

  await expect(page.getByRole('dialog', { name: 'Вся ваша музыка — в одном месте' })).toBeVisible()
  await page.getByRole('button', { name: 'Начать пользоваться Fuze' }).click()

  await page.getByRole('button', { name: 'Search ⌘ K' }).click()
  await page.getByLabel('Search query').fill('midnight')
  await page.getByRole('button', { name: `Play ${track.title}` }).click()
  await expect(page.getByRole('heading', { name: track.title })).toBeVisible({ timeout: 10_000 })
  await expect.poll(() => api.calls).toContain(`GET /tracks/${track.id}`)
  await expect.poll(() => api.calls).toContain(`GET /tracks/${track.id}/stream`)
  await page.keyboard.press('Escape')
  await page.screenshot({ path: '../../artifacts/fuze-listening-1440x900.png', fullPage: true })

  await page.getByRole('button', { name: /Collection/ }).click()
  const playlistsHeading = page.getByRole('heading', { name: 'Playlists', exact: true })
  await expect(playlistsHeading).toHaveCount(1)
  await expect(playlistsHeading).toBeVisible()
  await expect(page.getByRole('complementary', { name: 'Mini player' })).toContainText(track.title)
  await page.getByRole('button', { name: 'New playlist' }).click()
  await page.getByLabel('Name').fill('Focus Mix')
  await page.getByLabel(/Description/).fill('Deep work')
  await page.getByRole('button', { name: 'Create playlist' }).click()

  await expect(page).toHaveURL(/\/player\/playlists\/1$/)
  const playlistHeading = page.getByRole('heading', { name: 'Focus Mix' })
  await expect(playlistHeading).toHaveCount(1)
  await expect(playlistHeading).toBeVisible()
  await page.getByRole('button', { name: 'Add tracks' }).click()
  await page.getByLabel('Search query').fill('midnight')
  await page.getByRole('button', { name: `Add ${track.title} to playlist` }).click()
  await expect(page.getByRole('list', { name: 'Playlist tracks' })).toContainText(track.title)

  expect(api.csrfHeaders).toContain('refresh-csrf')
  expect(api.csrfHeaders.filter((value) => value === 'access-csrf').length).toBeGreaterThanOrEqual(3)
})
