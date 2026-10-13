/** Настройки сервера из переменных окружения (см. .env.example). */
export interface Config {
  port: number
  databaseUrl: string
  jwtSecret: string
  /** Токен бота от @BotFather — нужен для входа из Telegram Mini App. */
  telegramBotToken?: string
  /** Секрет для заголовка X-Telegram-Bot-Api-Secret-Token у webhook. */
  telegramWebhookSecret?: string
  /** Публичный HTTPS-адрес приложения (Mini App и ссылки из бота). */
  publicUrl?: string
  /** Часовой пояс, по которому считаются «день» и «неделя» рейтинга. */
  leaderboardTz: string
  /** Сколько живёт подпись initData от Telegram. */
  telegramAuthMaxAgeSec: number
  /** Брать IP клиента из X-Forwarded-For (за nginx/Railway/Render). */
  trustProxy: boolean
  /** Каталог собранного фронтенда для раздачи Mini App. */
  staticDir?: string
  production: boolean
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const production = env.NODE_ENV === 'production'
  const jwtSecret = env.JWT_SECRET ?? (production ? '' : 'dev-only-secret-change-me-dev-only-secret')
  if (jwtSecret.length < 32) throw new Error('JWT_SECRET должен быть не короче 32 символов (openssl rand -hex 32)')
  const databaseUrl = env.DATABASE_URL ?? (production ? '' : 'postgres://localhost:5432/bodytrain')
  if (!databaseUrl) throw new Error('Не задан DATABASE_URL')
  return {
    port: Number(env.PORT ?? 8787),
    databaseUrl,
    jwtSecret,
    // Заглушка вроде «-» (если токена пока нет) не включает вход через Telegram.
    telegramBotToken: /^\d+:[\w-]{20,}$/.test(env.TELEGRAM_BOT_TOKEN ?? '') ? env.TELEGRAM_BOT_TOKEN : undefined,
    telegramWebhookSecret: env.TELEGRAM_WEBHOOK_SECRET || undefined,
    // Render сам задаёт RENDER_EXTERNAL_URL, Railway — RAILWAY_PUBLIC_DOMAIN
    publicUrl: (env.PUBLIC_URL || env.RENDER_EXTERNAL_URL || (env.RAILWAY_PUBLIC_DOMAIN ? `https://${env.RAILWAY_PUBLIC_DOMAIN}` : ''))?.replace(/\/$/, '') || undefined,
    leaderboardTz: env.LEADERBOARD_TZ || 'Europe/Moscow',
    telegramAuthMaxAgeSec: Number(env.TELEGRAM_AUTH_MAX_AGE_SECONDS ?? 86400),
    trustProxy: env.TRUST_PROXY === '1' || env.TRUST_PROXY === 'true',
    staticDir: env.STATIC_DIR ?? (production ? 'dist' : undefined),
    production,
  }
}
