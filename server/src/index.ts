import { serve } from '@hono/node-server'
import { createApp } from './app'
import { loadConfig } from './config'
import { createDb, migrate } from './db'

const config = loadConfig()
const db = createDb(config.databaseUrl)
// На PaaS база может подняться чуть позже приложения — несколько попыток с паузой.
for (let attempt = 1; ; attempt++) {
  try {
    await migrate(db)
    break
  } catch (e) {
    if (attempt >= 8) throw e
    console.warn(`База недоступна (попытка ${attempt}): ${(e as Error).message}`)
    await new Promise((r) => setTimeout(r, attempt * 1500))
  }
}

const app = createApp({ db, config })
const server = serve({ fetch: app.fetch, port: config.port }, (info) => {
  console.log(`BodyTrain API: http://localhost:${info.port}${config.staticDir ? ` (web: ${config.staticDir})` : ''}`)
  if (!config.telegramBotToken) console.log('TELEGRAM_BOT_TOKEN не задан — вход через Telegram выключен')
})

const shutdown = () => {
  server.close()
  void db.end().finally(() => process.exit(0))
}
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
