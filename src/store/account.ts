import { create } from 'zustand'
import { initialData } from '../data/defaults'
import { ApiError, apiAvailable, authApi, stateApi, type PublicUser, type RemoteState, type Session } from '../lib/api'
import { mergeAppData, sameData } from '../lib/merge'
import { getSessionToken, setSessionToken } from '../lib/secrets'
import { appStorage } from '../lib/storage'
import { launchedFromTelegram, loadTelegram } from '../lib/telegram'
import type { AppData } from '../lib/types'
import { parseAppData } from '../lib/validation'
import { useApp } from './app'

/**
 * Аккаунт и синхронизация дневника с сервером.
 * Гость работает как раньше — только на устройстве. После входа весь дневник
 * синхронизируется: изменения отправляются через 2 с, при конфликте с другим
 * устройством делается трёхстороннее слияние (src/lib/merge.ts).
 */

type SyncState = 'idle' | 'syncing' | 'offline' | 'error'

interface AccountState {
  status: 'loading' | 'guest' | 'authed'
  user: PublicUser | null
  inTelegram: boolean
  notice: string | null
  sync: { state: SyncState; at: number | null; error: string | null }
}

export const useAccount = create<AccountState>(() => ({
  status: 'loading',
  user: null,
  inTelegram: false,
  notice: null,
  sync: { state: 'idle', at: null, error: null },
}))

interface SyncBase {
  userId: string
  revision: number
  /** Версия дневника на сервере для этой ревизии (null — сервер пуст). */
  data: AppData | null
}

const BASE_KEY = 'bodytrain-sync'
const USER_KEY = 'bodytrain-account'
const DATA_KEYS = ['exercises', 'workouts', 'activeWorkout', 'foodLog', 'bodyWeight', 'profile', 'settings'] as const

let token: string | null = null
let base: SyncBase | null = null
let applying = false
let timer: ReturnType<typeof setTimeout> | undefined
let running: Promise<void> | null = null
let again = false
let lastRun = 0
let started = false

const localData = (): AppData => {
  const s = useApp.getState()
  return {
    exercises: s.exercises, workouts: s.workouts, activeWorkout: s.activeWorkout, foodLog: s.foodLog,
    bodyWeight: s.bodyWeight, profile: s.profile, settings: s.settings,
  }
}

function apply(data: AppData) {
  applying = true
  try {
    useApp.setState(data)
  } finally {
    applying = false
  }
}

function setBase(next: SyncBase | null) {
  base = next
  if (next) appStorage.setItem(BASE_KEY, JSON.stringify(next))
  else void appStorage.removeItem(BASE_KEY)
}

function cacheUser(user: PublicUser | null) {
  if (user) appStorage.setItem(USER_KEY, JSON.stringify(user))
  else void appStorage.removeItem(USER_KEY)
}

async function readJson<T>(key: string): Promise<T | null> {
  try {
    const raw = await appStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    return null
  }
}

const setSync = (patch: Partial<AccountState['sync']>) => useAccount.setState((s) => ({ sync: { ...s.sync, ...patch } }))

export const currentToken = () => token

/** Есть ли изменения, которые ещё не дошли до сервера. */
export function hasUnsyncedChanges() {
  return !base || !sameData(localData(), base.data)
}

async function cycle(userId: string, t: string) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const b = base?.userId === userId ? base : null
    const local = localData()
    if (b && b.data && sameData(local, b.data)) {
      // Локально ничего не менялось — забираем изменения с других устройств.
      const remote = await stateApi.get(t)
      if (remote.revision !== b.revision && remote.data) {
        const data = parseAppData(remote.data)
        apply(data)
        setBase({ userId, revision: remote.revision, data })
      }
      return
    }
    try {
      const res = await stateApi.put(t, b?.revision ?? 0, local)
      setBase({ userId, revision: res.revision, data: local })
      return
    } catch (e) {
      if (!(e instanceof ApiError) || e.status !== 409) throw e
      const remote = e.body as RemoteState
      const remoteData = remote.data ? parseAppData(remote.data) : null
      // Слияние и применение без await между ними — правки пользователя не теряются.
      apply(mergeAppData(b?.data ?? null, localData(), remoteData))
      setBase({ userId, revision: remote.revision, data: remoteData })
    }
  }
  throw new Error('Не удалось согласовать дневник с сервером, попробую позже')
}

/** Запускает синхронизацию (или дожидается текущей). */
export function syncNow(): Promise<void> {
  if (timer) clearTimeout(timer)
  const { user, status } = useAccount.getState()
  if (status !== 'authed' || !user || !token) return Promise.resolve()
  if (running) {
    again = true
    return running
  }
  const t = token
  setSync({ state: 'syncing', error: null })
  running = cycle(user.id, t)
    .then(() => setSync({ state: 'idle', at: Date.now(), error: null }))
    .catch((e) => {
      if (e instanceof ApiError && e.status === 401) return expireSession()
      if (e instanceof ApiError && e.status === 0) {
        setSync({ state: 'offline', error: null })
        timer = setTimeout(() => void syncNow(), 30_000)
        return
      }
      setSync({ state: 'error', error: (e as Error).message })
    })
    .finally(() => {
      running = null
      lastRun = Date.now()
      if (again) {
        again = false
        void syncNow()
      }
    })
  return running
}

function schedule(delay = 2000) {
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => void syncNow(), delay)
}

async function expireSession() {
  token = null
  await setSessionToken('').catch(() => undefined)
  useAccount.setState({ status: 'guest', user: null, notice: 'Сессия истекла — войди снова. Дневник на устройстве сохранён.' })
  setSync({ state: 'idle', error: null })
}

async function signedIn(session: Session) {
  if (base && base.userId !== session.user.id) {
    // На устройстве дневник другого аккаунта (он уже на сервере) — не смешиваем.
    apply({ ...initialData })
    setBase(null)
  }
  token = session.token
  await setSessionToken(session.token)
  cacheUser(session.user)
  useAccount.setState({ status: 'authed', user: session.user, notice: null })
  await syncNow()
}

function startListeners() {
  if (started) return
  started = true
  useApp.subscribe((s, prev) => {
    if (applying || useAccount.getState().status !== 'authed') return
    if (DATA_KEYS.some((k) => s[k] !== prev[k])) schedule()
  })
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && Date.now() - lastRun > 20_000) void syncNow()
  })
  window.addEventListener('online', () => void syncNow())
}

let initOnce: Promise<void> | null = null

/** Вызывать после того, как дневник прочитан с диска (useApp hydrated). */
export function initAccount() {
  initOnce ??= init()
  return initOnce
}

async function init() {
  startListeners()
  const inTelegram = launchedFromTelegram()
  useAccount.setState({ inTelegram })
  base = await readJson<SyncBase>(BASE_KEY)
  if (!apiAvailable) return useAccount.setState({ status: 'guest' })

  if (inTelegram) {
    const tg = await loadTelegram()
    if (tg?.initData) {
      try {
        return await signedIn(await authApi.telegram(tg.initData))
      } catch (e) {
        useAccount.setState({ notice: (e as Error).message })
      }
    }
  }

  token = await getSessionToken().catch(() => '')
  if (!token) return useAccount.setState({ status: 'guest' })
  const cached = await readJson<PublicUser>(USER_KEY)
  // Офлайн-режим: показываем аккаунт из кэша, синхронизируем, когда появится связь.
  useAccount.setState({ status: 'authed', user: cached })
  try {
    const { user } = await authApi.me(token)
    cacheUser(user)
    useAccount.setState({ user })
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) return expireSession()
    if (!cached) return useAccount.setState({ status: 'guest', notice: 'Нет связи с сервером — дневник работает офлайн' })
  }
  void syncNow()
}

export const accountActions = {
  async login(username: string, password: string) {
    await signedIn(await authApi.login(username, password))
  },
  async register(username: string, password: string, displayName: string) {
    await signedIn(await authApi.register(username, password, displayName || undefined))
  },
  async telegramLogin() {
    const tg = await loadTelegram()
    if (!tg?.initData) throw new Error('Открой BodyTrain из Telegram-бота')
    await signedIn(await authApi.telegram(tg.initData))
  },
  async updateMe(patch: { displayName?: string; showInLeaderboard?: boolean }) {
    if (!token) throw new Error('Нужно войти')
    const { user } = await authApi.updateMe(token, patch)
    cacheUser(user)
    useAccount.setState({ user })
  },
  async setCredentials(body: { username?: string; password: string; currentPassword?: string }) {
    if (!token) throw new Error('Нужно войти')
    const session = await authApi.setCredentials(token, body)
    token = session.token
    await setSessionToken(session.token)
    cacheUser(session.user)
    useAccount.setState({ user: session.user })
  },
  /** Выход: дневник остаётся в аккаунте, с устройства он удаляется. */
  async logout() {
    if (timer) clearTimeout(timer)
    await running
    token = null
    await setSessionToken('')
    setBase(null)
    cacheUser(null)
    apply({ ...initialData })
    useAccount.setState({ status: 'guest', user: null, notice: null })
    setSync({ state: 'idle', at: null, error: null })
  },
  /** Удаление аккаунта на сервере. Дневник на устройстве остаётся как гостевой. */
  async deleteAccount(password?: string) {
    if (!token) throw new Error('Нужно войти')
    await authApi.deleteAccount(token, password)
    token = null
    await setSessionToken('')
    setBase(null)
    cacheUser(null)
    useAccount.setState({ status: 'guest', user: null, notice: 'Аккаунт удалён. Дневник остался на этом устройстве.' })
    setSync({ state: 'idle', at: null, error: null })
  },
}
