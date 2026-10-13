import { Preferences } from '@capacitor/preferences'
import { BodyVision } from './bodyVision'
import { isNative } from './http'
import type { AIProvider } from './types'

/**
 * Личный ключ не входит в состояние дневника и резервные копии.
 * На iOS — Keychain, в веб-версии — Preferences (localStorage).
 */
const read = async (name: string) => isNative ? (await BodyVision.getSecret({ name })).value : (await Preferences.get({ key: name })).value ?? ''

const write = async (name: string, value: string) => {
  if (isNative) return BodyVision.setSecret({ name, value: value.trim() })
  if (value.trim()) await Preferences.set({ key: name, value: value.trim() })
  else await Preferences.remove({ key: name })
}

export const getAIKey = (provider: AIProvider = 'groq') => read(`${provider}_api_key`)
export const setAIKey = (value: string, provider: AIProvider = 'groq') => write(`${provider}_api_key`, value)
export const getCloudflareAccount = () => read('cloudflare_account_id')
export const setCloudflareAccount = (value: string) => write('cloudflare_account_id', value)

/** Токен сессии BodyTrain (вход/регистрация). На iOS — Keychain. */
export const getSessionToken = () => read('bodytrain_session')
export const setSessionToken = (value: string) => write('bodytrain_session', value)
