import { afterEach, describe, expect, it } from 'vitest'
import { clearInstanceConfig, getApiBaseUrl, readInstanceConfig, saveInstanceConfig } from '@/services/runtimeConfig'

afterEach(clearInstanceConfig)

describe('instance configuration', () => {
  it('normalizes self-hosted addresses and derives the API endpoint', () => {
    const saved = saveInstanceConfig({
      backendUrl: 'api.example.com/',
      frontendUrl: 'https://music.example.com///',
    })

    expect(saved).toEqual({
      backendUrl: 'https://api.example.com',
      frontendUrl: 'https://music.example.com',
    })
    expect(getApiBaseUrl()).toMatch(/\/api\/v1$/)
  })

  it('rejects unsafe or ambiguous addresses', () => {
    expect(() => saveInstanceConfig({ backendUrl: 'ftp://api.example.com', frontendUrl: 'music.example.com' })).toThrow(/HTTP/)
    expect(() => saveInstanceConfig({ backendUrl: 'https://user:secret@api.example.com', frontendUrl: 'music.example.com' })).toThrow(/credentials/)
    expect(readInstanceConfig()).not.toBeNull()
  })
})
