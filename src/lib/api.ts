import type { AppData } from './types'
import { HttpError, isNative, requestJson } from './http'

/**
 * Клиент сервера BodyTrain (server/).
 * Веб и Telegram Mini App ходят на тот же домен (/api), iOS — на VITE_API_URL.
 */
const API_URL = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '')

export const apiAvailable = !isNative || API_URL.startsWith('http')

export interface PublicUser {
  id: string
  displayName: string
  username: string | null
  telegram: boolean
  telegramUsername: string | null
  hasPassword: boolean
  showInLeaderboard: boolean
}

export interface Session {
  token: string
  user: PublicUser
}

export interface LeaderboardEntry {
  rank: number
  userId: string
  displayName: string
  tonnage: number
  workouts: number
  me: boolean
}

export interface Leaderboard {
  period: 'day' | 'week'
  timeZone: string
  from: string
  to: string
  participants: number
  entries: LeaderboardEntry[]
  me: { rank: number | null; tonnage: number; workouts: number; hidden: boolean }
}

export interface RemoteState {
  revision: number
  data: AppData | null
}

export class ApiError extends Error {
  constructor(public status: number, message: string, public body?: unknown) {
    super(message)
  }
}

async function api<T>(path: string, opts: { method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'; body?: unknown; token?: string | null; timeoutMs?: number } = {}): Promise<T> {
  if (!apiAvailable) throw new ApiError(0, 'Сервер не настроен в этой сборке (VITE_API_URL)')
  try {
    return await requestJson<T>(`${API_URL}${path}`, {
      method: opts.method ?? 'GET',
      body: opts.body,
      headers: opts.token ? { Authorization: `Bearer ${opts.token}` } : {},
      timeoutMs: opts.timeoutMs ?? 20000,
    })
  } catch (e) {
    if (e instanceof HttpError) {
      const msg = (e.body as { error?: string } | null)?.error
      throw new ApiError(e.status, typeof msg === 'string' && msg !== 'conflict' ? msg : `Ошибка сервера (${e.status})`, e.body)
    }
    throw new ApiError(0, 'Нет связи с сервером')
  }
}

export const authApi = {
  register: (username: string, password: string, displayName?: string) =>
    api<Session>('/api/auth/register', { method: 'POST', body: { username, password, displayName } }),
  login: (username: string, password: string) => api<Session>('/api/auth/login', { method: 'POST', body: { username, password } }),
  telegram: (initData: string) => api<Session>('/api/auth/telegram', { method: 'POST', body: { initData } }),
  me: (token: string) => api<{ user: PublicUser }>('/api/me', { token }),
  updateMe: (token: string, patch: { displayName?: string; showInLeaderboard?: boolean }) =>
    api<{ user: PublicUser }>('/api/me', { method: 'PATCH', token, body: patch }),
  setCredentials: (token: string, body: { username?: string; password: string; currentPassword?: string }) =>
    api<Session>('/api/me/credentials', { method: 'POST', token, body }),
  deleteAccount: (token: string, password?: string) => api<{ ok: true }>('/api/me', { method: 'DELETE', token, body: { confirm: true, password } }),
}

export const stateApi = {
  get: (token: string) => api<RemoteState>('/api/state', { token, timeoutMs: 60000 }),
  /** 409 → ApiError с body = { revision, data } текущей версии на сервере. */
  put: (token: string, revision: number, data: AppData) =>
    api<{ revision: number }>('/api/state', { method: 'PUT', token, body: { revision, data }, timeoutMs: 60000 }),
}

export const leaderboardApi = {
  get: (token: string, period: 'day' | 'week') => api<Leaderboard>(`/api/leaderboard?period=${period}`, { token }),
}
