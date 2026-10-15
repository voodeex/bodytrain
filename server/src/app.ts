import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { Hono, type Context, type Next } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { secureHeaders } from 'hono/secure-headers'
import { serveStatic } from '@hono/node-server/serve-static'
import { getConnInfo } from '@hono/node-server/conninfo'
import { parseAppData } from '../../src/lib/validation'
import type { AppData } from '../../src/lib/types'
import { hashPassword, signToken, validateInitData, verifyPassword, verifyToken, type TelegramUser } from './auth'
import { webhookToken, type Config } from './config'
import type { Db } from './db'
import { RateLimiter } from './rateLimit'
import { workoutStats } from './stats'

interface UserRow {
  id: string
  username: string | null
  password_hash: string | null
  telegram_id: string | null
  telegram_username: string | null
  display_name: string
  show_in_leaderboard: boolean
  token_version: number
}

type Env = { Variables: { user: UserRow } }

class ApiError extends Error {
  constructor(public status: 400 | 401 | 403 | 404 | 409 | 413 | 422 | 429 | 503, message: string, public extra?: Record<string, unknown>) {
    super(message)
  }
}

const USERNAME = /^[a-z0-9_.]{3,32}$/

export function cleanDisplayName(v: unknown): string {
  if (typeof v !== 'string') throw new ApiError(422, 'Укажи имя')
  // eslint-disable-next-line no-control-regex
  const name = v.replace(/[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁦-⁩]/g, '').replace(/\s+/g, ' ').trim()
  if (name.length < 1 || name.length > 40) throw new ApiError(422, 'Имя — от 1 до 40 символов')
  return name
}

const cleanUsername = (v: unknown) => {
  const u = typeof v === 'string' ? v.trim().toLowerCase() : ''
  if (!USERNAME.test(u)) throw new ApiError(422, 'Логин — 3–32 символа: латиница, цифры, «_» и «.»')
  return u
}

const cleanPassword = (v: unknown) => {
  if (typeof v !== 'string' || v.length < 8 || v.length > 200) throw new ApiError(422, 'Пароль — от 8 до 200 символов')
  return v
}

export const publicUser = (u: UserRow) => ({
  id: u.id,
  displayName: u.display_name,
  username: u.username,
  telegram: u.telegram_id !== null,
  telegramUsername: u.telegram_username,
  hasPassword: u.password_hash !== null,
  showInLeaderboard: u.show_in_leaderboard,
})

const telegramName = (t: TelegramUser) => {
  try {
    return cleanDisplayName([t.first_name, t.last_name].filter(Boolean).join(' '))
  } catch {
    return t.username ? cleanDisplayName(t.username) : `Атлет ${String(t.id).slice(-4)}`
  }
}

export function createApp({ db, config, fetchImpl = fetch }: { db: Db; config: Config; fetchImpl?: typeof fetch }) {
  const app = new Hono<Env>()
  const authLimiter = new RateLimiter(20, 10 * 60 * 1000)
  const loginFailures = new RateLimiter(10, 15 * 60 * 1000)
  const tgLimiter = new RateLimiter(60, 10 * 60 * 1000)
  const syncLimiter = new RateLimiter(120, 60 * 1000)
  const boardLimiter = new RateLimiter(60, 60 * 1000)

  const clientIp = (c: Context) => {
    if (config.trustProxy) {
      const fwd = c.req.header('x-forwarded-for')?.split(',')[0]?.trim()
      if (fwd) return fwd
    }
    try {
      return getConnInfo(c).remote.address ?? 'unknown'
    } catch {
      return 'unknown'
    }
  }

  const limit = (limiter: RateLimiter, key: string) => {
    if (!limiter.take(key)) throw new ApiError(429, 'Слишком много запросов. Подожди немного.')
  }

  const issue = async (u: UserRow) => ({ token: await signToken(config.jwtSecret, u.id, u.token_version), user: publicUser(u) })

  const requireUser = async (c: Context<Env>, next: Next) => {
    const header = c.req.header('authorization') ?? ''
    const token = header.startsWith('Bearer ') ? header.slice(7) : ''
    const claims = token ? await verifyToken(config.jwtSecret, token) : null
    if (!claims) throw new ApiError(401, 'Нужно войти заново')
    const { rows } = await db.query<UserRow>('select * from users where id = $1', [claims.userId])
    const user = rows[0]
    if (!user || user.token_version !== claims.tokenVersion) throw new ApiError(401, 'Сессия завершена — войди заново')
    c.set('user', user)
    await next()
  }

  const json = async (c: Context): Promise<Record<string, unknown>> => {
    try {
      const v = await c.req.json()
      if (v && typeof v === 'object' && !Array.isArray(v)) return v as Record<string, unknown>
    } catch {
      /* ниже */
    }
    throw new ApiError(400, 'Ожидался JSON')
  }

  app.onError((err, c) => {
    if (err instanceof ApiError) return c.json({ error: err.message, ...err.extra }, err.status)
    console.error(err)
    return c.json({ error: 'Ошибка сервера' }, 500)
  })

  // Mini App открывается во фрейме web.telegram.org, поэтому X-Frame-Options не ставим.
  app.use('*', secureHeaders({ xFrameOptions: false, crossOriginResourcePolicy: false, crossOriginOpenerPolicy: false }))
  app.use('/api/state', bodyLimit({ maxSize: 12 * 1024 * 1024, onError: (c) => c.json({ error: 'Дневник слишком большой для синхронизации' }, 413) }))
  app.use('/api/*', async (c, next) => {
    if (c.req.path !== '/api/state') {
      return bodyLimit({ maxSize: 64 * 1024, onError: (c) => c.json({ error: 'Слишком большой запрос' }, 413) })(c, next)
    }
    await next()
  })

  app.get('/api/health', async (c) => {
    await db.query('select 1')
    return c.json({
      ok: true,
      telegram: !!config.telegramBotToken,
      webhook: !!config.telegramWebhookSecret,
      // Render/Railway передают хеш коммита — видно, какая версия задеплоена.
      version: (process.env.RENDER_GIT_COMMIT ?? process.env.RAILWAY_GIT_COMMIT_SHA ?? 'dev').slice(0, 7),
    })
  })

  // ── Регистрация и вход ─────────────────────────────────────────────

  app.post('/api/auth/register', async (c) => {
    limit(authLimiter, `ip:${clientIp(c)}`)
    const body = await json(c)
    const username = cleanUsername(body.username)
    const password = cleanPassword(body.password)
    const displayName = body.displayName === undefined || body.displayName === '' ? username : cleanDisplayName(body.displayName)
    const hash = await hashPassword(password)
    const { rows } = await db.query<UserRow>(
      `insert into users (username, password_hash, display_name) values ($1, $2, $3)
       on conflict (username) do nothing returning *`,
      [username, hash, displayName],
    )
    if (!rows[0]) throw new ApiError(409, 'Этот логин уже занят')
    return c.json(await issue(rows[0]), 201)
  })

  app.post('/api/auth/login', async (c) => {
    const ip = clientIp(c)
    limit(authLimiter, `ip:${ip}`)
    const body = await json(c)
    const username = typeof body.username === 'string' ? body.username.trim().toLowerCase() : ''
    const password = typeof body.password === 'string' ? body.password : ''
    if (!username || !password) throw new ApiError(422, 'Введи логин и пароль')
    const { rows } = await db.query<UserRow>('select * from users where username = $1', [username])
    const user = rows[0]
    const ok = user?.password_hash ? await verifyPassword(password, user.password_hash) : false
    if (!ok) {
      limit(loginFailures, `user:${username}`)
      throw new ApiError(401, 'Неверный логин или пароль')
    }
    return c.json(await issue(user!))
  })

  app.post('/api/auth/telegram', async (c) => {
    limit(tgLimiter, `ip:${clientIp(c)}`)
    if (!config.telegramBotToken) throw new ApiError(503, 'Вход через Telegram не настроен на сервере')
    const body = await json(c)
    const tg = validateInitData(String(body.initData ?? ''), config.telegramBotToken, config.telegramAuthMaxAgeSec)
    if (!tg) throw new ApiError(401, 'Telegram не подтвердил вход. Открой приложение из бота заново.')
    const { rows } = await db.query<UserRow>(
      `insert into users (telegram_id, telegram_username, display_name) values ($1, $2, $3)
       on conflict (telegram_id) do update set telegram_username = excluded.telegram_username
       returning *`,
      [tg.id, tg.username ?? null, telegramName(tg)],
    )
    return c.json(await issue(rows[0]))
  })

  // ── Аккаунт ────────────────────────────────────────────────────────

  app.get('/api/me', requireUser, (c) => c.json({ user: publicUser(c.get('user')) }))

  app.patch('/api/me', requireUser, async (c) => {
    const body = await json(c)
    const user = c.get('user')
    const displayName = body.displayName !== undefined ? cleanDisplayName(body.displayName) : user.display_name
    if (body.showInLeaderboard !== undefined && typeof body.showInLeaderboard !== 'boolean') throw new ApiError(422, 'showInLeaderboard')
    const show = (body.showInLeaderboard as boolean | undefined) ?? user.show_in_leaderboard
    const { rows } = await db.query<UserRow>(
      'update users set display_name = $2, show_in_leaderboard = $3 where id = $1 returning *',
      [user.id, displayName, show],
    )
    return c.json({ user: publicUser(rows[0]) })
  })

  /** Логин/пароль для аккаунта (например, чтобы войти с iPhone в аккаунт из Telegram) или смена пароля. */
  app.post('/api/me/credentials', requireUser, async (c) => {
    limit(authLimiter, `ip:${clientIp(c)}`)
    const body = await json(c)
    const user = c.get('user')
    if (user.password_hash) {
      const current = typeof body.currentPassword === 'string' ? body.currentPassword : ''
      if (!(await verifyPassword(current, user.password_hash))) throw new ApiError(403, 'Текущий пароль неверный')
    }
    const username = body.username === undefined && user.username ? user.username : cleanUsername(body.username)
    const hash = await hashPassword(cleanPassword(body.password))
    try {
      const { rows } = await db.query<UserRow>(
        // Смена пароля завершает остальные сессии.
        'update users set username = $2, password_hash = $3, token_version = token_version + 1 where id = $1 returning *',
        [user.id, username, hash],
      )
      return c.json(await issue(rows[0]))
    } catch (e) {
      if ((e as { code?: string }).code === '23505') throw new ApiError(409, 'Этот логин уже занят')
      throw e
    }
  })

  app.delete('/api/me', requireUser, async (c) => {
    const body = await json(c)
    const user = c.get('user')
    if (body.confirm !== true) throw new ApiError(422, 'Подтверди удаление')
    if (user.password_hash && !(await verifyPassword(String(body.password ?? ''), user.password_hash))) {
      throw new ApiError(403, 'Неверный пароль')
    }
    await db.query('delete from users where id = $1', [user.id])
    return c.json({ ok: true })
  })

  // ── Синхронизация дневника ─────────────────────────────────────────

  app.get('/api/state', requireUser, async (c) => {
    const { rows } = await db.query<{ revision: number; data: AppData }>('select revision, data from user_state where user_id = $1', [c.get('user').id])
    return c.json({ revision: rows[0]?.revision ?? 0, data: rows[0]?.data ?? null })
  })

  app.put('/api/state', requireUser, async (c) => {
    const user = c.get('user')
    limit(syncLimiter, `user:${user.id}`)
    const body = await json(c)
    const base = body.revision
    if (typeof base !== 'number' || !Number.isInteger(base) || base < 0) throw new ApiError(422, 'revision')
    let data: AppData
    try {
      data = parseAppData(body.data)
    } catch (e) {
      throw new ApiError(422, (e as Error).message)
    }
    const stats = workoutStats(data)

    const client = await db.connect()
    try {
      await client.query('begin')
      const cur = await client.query<{ revision: number; data: AppData }>('select revision, data from user_state where user_id = $1 for update', [user.id])
      const current = cur.rows[0]?.revision ?? 0
      if (current !== base) {
        await client.query('rollback')
        return c.json({ error: 'conflict', revision: current, data: cur.rows[0]?.data ?? null }, 409)
      }
      const next = current + 1
      if (cur.rows[0]) {
        await client.query('update user_state set revision = $2, data = $3, updated_at = now() where user_id = $1', [user.id, next, data])
      } else {
        const ins = await client.query('insert into user_state (user_id, revision, data) values ($1, $2, $3) on conflict (user_id) do nothing', [user.id, next, data])
        if (ins.rowCount === 0) {
          await client.query('rollback')
          const now = await db.query<{ revision: number; data: AppData }>('select revision, data from user_state where user_id = $1', [user.id])
          return c.json({ error: 'conflict', revision: now.rows[0]?.revision ?? 0, data: now.rows[0]?.data ?? null }, 409)
        }
      }
      await client.query('delete from workout_stats where user_id = $1', [user.id])
      if (stats.length) {
        await client.query(
          `insert into workout_stats (user_id, workout_id, started_at, tonnage)
           select $1, * from unnest($2::text[], $3::timestamptz[], $4::float8[])`,
          [user.id, stats.map((s) => s.workoutId), stats.map((s) => new Date(s.startedAt).toISOString()), stats.map((s) => s.tonnage)],
        )
      }
      await client.query('commit')
      return c.json({ revision: next })
    } catch (e) {
      await client.query('rollback').catch(() => undefined)
      throw e
    } finally {
      client.release()
    }
  })

  // ── Рейтинг ────────────────────────────────────────────────────────

  app.get('/api/leaderboard', requireUser, async (c) => {
    const user = c.get('user')
    limit(boardLimiter, `user:${user.id}`)
    const period = c.req.query('period') === 'week' ? 'week' : 'day'
    const params = [period, config.leaderboardTz, period === 'week' ? '7 days' : '1 day']
    const base = `
      with bounds as (
        select (date_trunc($1, now() at time zone $2) at time zone $2) as start
      ),
      totals as (
        select w.user_id, sum(w.tonnage) as tonnage, count(*)::int as workouts
        from workout_stats w, bounds b
        where w.started_at >= b.start and w.started_at < b.start + $3::interval
        group by w.user_id
      ),
      ranked as (
        select t.user_id, t.tonnage, t.workouts, u.display_name,
               rank() over (order by t.tonnage desc)::int as rank
        from totals t join users u on u.id = t.user_id
        where u.show_in_leaderboard
      )`
    type Row = { user_id: string; tonnage: number; workouts: number; display_name: string; rank: number }
    const [top, mine, bounds, count] = await Promise.all([
      db.query<Row>(`${base} select * from ranked order by rank, display_name limit 50`, params),
      db.query<Row>(`${base} select t.user_id, t.tonnage, t.workouts, r.rank from totals t left join ranked r on r.user_id = t.user_id where t.user_id = $4`, [...params, user.id]),
      db.query<{ start: Date; end: Date }>(`select (date_trunc($1, now() at time zone $2) at time zone $2) as start,
        (date_trunc($1, now() at time zone $2) at time zone $2) + $3::interval as "end"`, params),
      db.query<{ n: number }>(`${base} select count(*)::int as n from ranked`, params),
    ])
    const me = mine.rows[0]
    return c.json({
      period,
      timeZone: config.leaderboardTz,
      from: bounds.rows[0].start.toISOString(),
      to: bounds.rows[0].end.toISOString(),
      participants: count.rows[0].n,
      entries: top.rows.map((r) => ({
        rank: r.rank,
        userId: r.user_id,
        displayName: r.display_name,
        tonnage: Number(r.tonnage),
        workouts: r.workouts,
        me: r.user_id === user.id,
      })),
      me: {
        rank: me?.rank ?? null,
        tonnage: Number(me?.tonnage ?? 0),
        workouts: me?.workouts ?? 0,
        hidden: !user.show_in_leaderboard,
      },
    })
  })

  // ── Telegram-бот: ответ на /start кнопкой Mini App ─────────────────

  app.post('/api/telegram/webhook', async (c) => {
    if (!config.telegramWebhookSecret || c.req.header('x-telegram-bot-api-secret-token') !== webhookToken(config.telegramWebhookSecret)) {
      throw new ApiError(401, 'unauthorized')
    }
    const update = (await json(c)) as { message?: { chat?: { id?: number; type?: string }; text?: string } }
    const msg = update.message
    if (msg?.chat?.id && msg.chat.type === 'private' && msg.text?.startsWith('/start') && config.telegramBotToken && config.publicUrl) {
      await fetchImpl(`https://api.telegram.org/bot${config.telegramBotToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: msg.chat.id,
          text: 'BodyTrain — дневник тренировок и КБЖУ. Записывай подходы, считай калории и соревнуйся по тоннажу за день и неделю 💪',
          reply_markup: { inline_keyboard: [[{ text: 'Открыть BodyTrain', web_app: { url: config.publicUrl } }]] },
        }),
      }).catch((e) => console.error('telegram sendMessage', e))
    }
    return c.json({ ok: true })
  })

  // ── Open Food Facts ────────────────────────────────────────────────
  // search.openfoodfacts.org не отдаёт Access-Control-Allow-Origin, поэтому из браузера
  // (Mini App) открытая база недоступна напрямую. Проксируем сами: это не открытый прокси —
  // адрес собирается здесь, наружу уходят только два GET-запроса к фиксированным хостам.
  // На iOS запрос идёт нативно мимо сервера.

  const offLimiter = new RateLimiter(30, 60 * 1000)
  const OFF_UA = 'BodyTrain/0.3 (https://github.com/voodeex/bodytrain)'
  const OFF_FIELDS = 'code,product_name,product_name_ru,brands,nutriments,serving_quantity'

  const offRequest = async (c: Context, url: string) => {
    limit(offLimiter, `ip:${clientIp(c)}`)
    const upstream = await fetchImpl(url, {
      headers: { Accept: 'application/json', 'User-Agent': OFF_UA },
      signal: AbortSignal.timeout(15000),
    }).catch(() => null)
    if (!upstream) throw new ApiError(503, 'Открытая база не ответила. Попробуй позже.')
    if (upstream.status === 404) throw new ApiError(404, 'Продукт не найден в открытой базе')
    if (upstream.status === 429) throw new ApiError(429, 'Открытая база ограничила запросы. Подожди минуту.')
    if (!upstream.ok) throw new ApiError(503, 'Открытая база временно недоступна')
    const text = await upstream.text()
    if (text.length > 2 * 1024 * 1024) throw new ApiError(503, 'Открытая база вернула слишком большой ответ')
    try {
      return c.json(JSON.parse(text))
    } catch {
      throw new ApiError(503, 'Открытая база вернула неожиданный ответ')
    }
  }

  app.get('/api/off/search', async (c) => {
    const q = (c.req.query('q') ?? '').trim()
    if (q.length < 2 || q.length > 100) throw new ApiError(422, 'Запрос — от 2 до 100 символов')
    const size = Number(c.req.query('page_size') ?? 25)
    if (!Number.isInteger(size) || size < 1 || size > 50) throw new ApiError(422, 'Некорректный размер страницы')
    const url = `https://search.openfoodfacts.org/search?q=${encodeURIComponent(q)}&page_size=${size}&langs=ru,en&fields=${OFF_FIELDS}`
    return offRequest(c, url)
  })

  app.get('/api/off/product/:code', async (c) => {
    const code = c.req.param('code')
    if (!/^\d{8,14}$/.test(code)) throw new ApiError(422, 'Штрихкод — от 8 до 14 цифр')
    return offRequest(c, `https://world.openfoodfacts.org/api/v2/product/${code}.json?fields=${OFF_FIELDS}`)
  })

  app.all('/api/*', () => {
    throw new ApiError(404, 'Не найдено')
  })

  // ── Веб-приложение (Mini App) ──────────────────────────────────────

  if (config.staticDir) {
    const root = config.staticDir
    app.use('/assets/*', async (c, next) => {
      await next()
      if (c.res.status === 200) c.header('Cache-Control', 'public, max-age=31536000, immutable')
    })
    app.use('*', serveStatic({ root }))
    let indexHtml: string | undefined
    app.get('*', async (c) => {
      indexHtml ??= await readFile(join(root, 'index.html'), 'utf8')
      c.header('Cache-Control', 'no-cache')
      return c.html(indexHtml)
    })
  }

  return app
}
