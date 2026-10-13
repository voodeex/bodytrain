import test, { after, before } from 'node:test'
import assert from 'node:assert/strict'
import { initialData } from '../../src/data/defaults'
import type { AppData, Workout } from '../../src/lib/types'
import { createApp } from '../src/app'
import { signInitData } from '../src/auth'
import { loadConfig, webhookToken } from '../src/config'
import { createDb, migrate } from '../src/db'
import { leaderboardTonnage } from '../src/stats'
import { configureTelegramBot } from '../src/telegramSetup'

const BOT = '123456:TEST-bot-token'
const db = createDb(process.env.TEST_DATABASE_URL ?? 'postgres://localhost:5432/bodytrain_test')
const sent: unknown[] = []
const config = { ...loadConfig({ NODE_ENV: 'test' }), telegramBotToken: BOT, telegramWebhookSecret: 'hook-secret', publicUrl: 'https://bt.example' }
const app = createApp({
  db, config,
  fetchImpl: (async (_url: string, init?: RequestInit) => { sent.push(JSON.parse(String(init?.body))); return new Response('{}') }) as typeof fetch,
})

before(async () => {
  await migrate(db)
  await db.query('truncate users restart identity cascade')
})
after(() => db.end())

const call = async (method: string, path: string, body?: unknown, token?: string) => {
  const res = await app.request(path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  return { status: res.status, body: (await res.json()) as any } // eslint-disable-line @typescript-eslint/no-explicit-any
}

const tgInit = (id: number, extra: Record<string, string> = {}, authDate = Math.floor(Date.now() / 1000)) =>
  signInitData({ auth_date: String(authDate), query_id: 'AAE', user: JSON.stringify({ id, first_name: 'Иван', last_name: 'Петров', username: `ivan${id}` }), ...extra }, BOT)

const workout = (id: string, startedAt: number, sets: [number, number][], exerciseId = 'bench-press'): Workout => ({
  id, title: 'Тест', startedAt, finishedAt: startedAt + 3600_000,
  exercises: [{ id: `${id}-e`, exerciseId, sets: sets.map(([weight, reps], i) => ({ id: `${id}-s${i}`, weight, reps, done: true })) }],
})
const state = (workouts: Workout[]): AppData => ({ ...initialData, workouts })
const todayStart = async () =>
  (await db.query<{ s: Date }>(`select date_trunc('day', now() at time zone 'Europe/Moscow') at time zone 'Europe/Moscow' as s`)).rows[0].s.getTime()

let alice = ''
let bob = ''

test('регистрация, повтор логина и проверка полей', async () => {
  const r = await call('POST', '/api/auth/register', { username: 'Alice', password: 'correct horse', displayName: '  Алиса  ' })
  assert.equal(r.status, 201)
  assert.equal(r.body.user.username, 'alice')
  assert.equal(r.body.user.displayName, 'Алиса')
  alice = r.body.token
  assert.equal((await call('POST', '/api/auth/register', { username: 'alice', password: 'another pass' })).status, 409)
  assert.equal((await call('POST', '/api/auth/register', { username: 'a', password: 'correct horse' })).status, 422)
  assert.equal((await call('POST', '/api/auth/register', { username: 'bobby', password: 'short' })).status, 422)
  const b = await call('POST', '/api/auth/register', { username: 'bob', password: 'bob password' })
  bob = b.body.token
})

test('вход по паролю и защита /api/me', async () => {
  assert.equal((await call('POST', '/api/auth/login', { username: 'ALICE', password: 'correct horse' })).status, 200)
  assert.equal((await call('POST', '/api/auth/login', { username: 'alice', password: 'wrong pass' })).status, 401)
  assert.equal((await call('GET', '/api/me')).status, 401)
  assert.equal((await call('GET', '/api/me', undefined, 'garbage')).status, 401)
  const me = await call('GET', '/api/me', undefined, alice)
  assert.equal(me.body.user.displayName, 'Алиса')
  assert.equal(me.body.user.hasPassword, true)
})

test('вход из Telegram: подпись, срок, повторный вход тем же аккаунтом', async () => {
  const first = await call('POST', '/api/auth/telegram', { initData: tgInit(777) })
  assert.equal(first.status, 200)
  assert.equal(first.body.user.displayName, 'Иван Петров')
  assert.equal(first.body.user.telegram, true)
  const again = await call('POST', '/api/auth/telegram', { initData: tgInit(777) })
  assert.equal(again.body.user.id, first.body.user.id)

  const tampered = tgInit(777).replace('ivan777', 'admin')
  assert.equal((await call('POST', '/api/auth/telegram', { initData: tampered })).status, 401)
  const old = tgInit(777, {}, Math.floor(Date.now() / 1000) - 2 * 86400)
  assert.equal((await call('POST', '/api/auth/telegram', { initData: old })).status, 401)
  const otherBot = signInitData({ auth_date: String(Math.floor(Date.now() / 1000)), user: JSON.stringify({ id: 1, first_name: 'X' }) }, '999:other')
  assert.equal((await call('POST', '/api/auth/telegram', { initData: otherBot })).status, 401)

  const noBot = createApp({ db, config: { ...config, telegramBotToken: undefined } })
  const res = await noBot.request('/api/auth/telegram', { method: 'POST', body: JSON.stringify({ initData: tgInit(777) }) })
  assert.equal(res.status, 503)
})

test('синхронизация: ревизии, конфликт, проверка данных', async () => {
  assert.deepEqual((await call('GET', '/api/state', undefined, alice)).body, { revision: 0, data: null })
  const data = state([workout('w1', Date.now() - 3600_000, [[60, 10]])])
  const put = await call('PUT', '/api/state', { revision: 0, data }, alice)
  assert.equal(put.status, 200)
  assert.equal(put.body.revision, 1)
  const stale = await call('PUT', '/api/state', { revision: 0, data }, alice)
  assert.equal(stale.status, 409)
  assert.equal(stale.body.revision, 1)
  assert.equal(stale.body.data.workouts[0].id, 'w1')
  const bad = await call('PUT', '/api/state', { revision: 1, data: { ...data, workouts: [{ id: 'x' }] } }, alice)
  assert.equal(bad.status, 422)
  const got = await call('GET', '/api/state', undefined, alice)
  assert.equal(got.body.revision, 1)
})

test('тоннаж для рейтинга без кардио, секунд и невозможных подходов', () => {
  const w = workout('t', Date.now(), [[100, 5], [900, 5], [100, 500]])
  assert.equal(leaderboardTonnage(w, initialData.exercises), 500)
  assert.equal(leaderboardTonnage(workout('c', Date.now(), [[10, 30]], 'run'), initialData.exercises), 0)
})

test('рейтинг за день и неделю: порядок, место, границы дня по Москве, скрытые', async () => {
  const start = await todayStart()
  const now = Date.now()
  // Алиса: сегодня 600 кг (+ вчерашняя тренировка 10 000 кг, она только в недельном, если та же неделя)
  await call('PUT', '/api/state', { revision: 1, data: state([
    workout('a1', Math.min(now, start + 1000), [[60, 10]]),
    workout('a2', start - 60_000, [[100, 100]]),
  ]) }, alice)
  // Боб: сегодня 2000 кг
  await call('PUT', '/api/state', { revision: 0, data: state([workout('b1', now - 1000, [[100, 10], [100, 10]])]) }, bob)

  const day = await call('GET', '/api/leaderboard?period=day', undefined, alice)
  assert.equal(day.status, 200)
  assert.deepEqual(day.body.entries.map((e: { displayName: string; tonnage: number }) => [e.displayName, e.tonnage]), [['bob', 2000], ['Алиса', 600]])
  assert.equal(day.body.me.rank, 2)
  assert.equal(day.body.entries[1].me, true)
  assert.equal(day.body.timeZone, 'Europe/Moscow')

  const week = await call('GET', '/api/leaderboard?period=week', undefined, alice)
  const weekStart = new Date(week.body.from).getTime()
  const aliceWeek = 600 + (start - 60_000 >= weekStart ? 10_000 : 0)
  assert.equal(week.body.entries.find((e: { me: boolean }) => e.me).tonnage, aliceWeek)

  // Скрыть себя: пропадает из списка, но видит свой тоннаж
  await call('PATCH', '/api/me', { showInLeaderboard: false }, bob)
  const hidden = await call('GET', '/api/leaderboard?period=day', undefined, bob)
  assert.equal(hidden.body.entries.length, 1)
  assert.equal(hidden.body.me.rank, null)
  assert.equal(hidden.body.me.tonnage, 2000)
  assert.equal(hidden.body.me.hidden, true)
  const forAlice = await call('GET', '/api/leaderboard?period=day', undefined, alice)
  assert.equal(forAlice.body.me.rank, 1)
  await call('PATCH', '/api/me', { showInLeaderboard: true }, bob)
})

test('логин и пароль для Telegram-аккаунта, смена пароля завершает старые сессии', async () => {
  const tg = await call('POST', '/api/auth/telegram', { initData: tgInit(888) })
  const token = tg.body.token
  const set = await call('POST', '/api/me/credentials', { username: 'ivan_tg', password: 'iphone password' }, token)
  assert.equal(set.status, 200)
  assert.equal(set.body.user.username, 'ivan_tg')
  assert.equal((await call('GET', '/api/me', undefined, token)).status, 401, 'старый токен после смены пароля недействителен')
  const login = await call('POST', '/api/auth/login', { username: 'ivan_tg', password: 'iphone password' })
  assert.equal(login.body.user.id, tg.body.user.id)
  assert.equal((await call('POST', '/api/me/credentials', { password: 'next password 1' }, login.body.token)).status, 403)
  assert.equal((await call('POST', '/api/me/credentials', { username: 'alice', password: 'next password 1', currentPassword: 'iphone password' }, login.body.token)).status, 409)
})

test('удаление аккаунта удаляет дневник и рейтинг', async () => {
  assert.equal((await call('DELETE', '/api/me', { confirm: true, password: 'nope nope' }, bob)).status, 403)
  assert.equal((await call('DELETE', '/api/me', { confirm: true, password: 'bob password' }, bob)).status, 200)
  assert.equal((await call('POST', '/api/auth/login', { username: 'bob', password: 'bob password' })).status, 401)
  const { rows } = await db.query('select count(*)::int as n from workout_stats w join users u on u.id = w.user_id where u.username = $1', ['bob'])
  assert.equal(rows[0].n, 0)
  const day = await call('GET', '/api/leaderboard?period=day', undefined, alice)
  assert.equal(day.body.entries.length, 1)
})

test('при старте сервер ставит webhook с допустимым для Telegram секретом', async () => {
  const calls: { url: string; body: Record<string, unknown> }[] = []
  const fake = (async (url: string, init?: RequestInit) => {
    calls.push({ url, body: JSON.parse(String(init?.body)) })
    return new Response('{"ok":true}')
  }) as typeof fetch
  await configureTelegramBot({ ...config, publicUrl: 'https://bt.example', telegramWebhookSecret: 'abc+/=base64' }, fake)
  const hook = calls.find((c) => c.url.endsWith('/setWebhook'))!
  assert.equal(hook.body.url, 'https://bt.example/api/telegram/webhook')
  assert.match(String(hook.body.secret_token), /^[A-Za-z0-9_-]{1,256}$/)
  assert.ok(calls.some((c) => c.url.endsWith('/setChatMenuButton')))
  calls.length = 0
  await configureTelegramBot({ ...config, publicUrl: 'http://localhost:5173' }, fake)
  assert.equal(calls.length, 0, 'без https бот не настраивается')
})

test('webhook бота отвечает на /start кнопкой Mini App и проверяет секрет', async () => {
  const update = { message: { chat: { id: 42, type: 'private' }, text: '/start' } }
  const wrong = await app.request('/api/telegram/webhook', { method: 'POST', body: JSON.stringify(update), headers: { 'X-Telegram-Bot-Api-Secret-Token': 'x' } })
  assert.equal(wrong.status, 401)
  const raw = await app.request('/api/telegram/webhook', { method: 'POST', body: JSON.stringify(update), headers: { 'X-Telegram-Bot-Api-Secret-Token': 'hook-secret' } })
  assert.equal(raw.status, 401, 'принимается только производный токен')
  const ok = await app.request('/api/telegram/webhook', { method: 'POST', body: JSON.stringify(update), headers: { 'X-Telegram-Bot-Api-Secret-Token': webhookToken('hook-secret') } })
  assert.equal(ok.status, 200)
  const msg = sent.at(-1) as { chat_id: number; reply_markup: { inline_keyboard: { web_app: { url: string } }[][] } }
  assert.equal(msg.chat_id, 42)
  assert.equal(msg.reply_markup.inline_keyboard[0][0].web_app.url, 'https://bt.example')
})
