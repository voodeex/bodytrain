/**
 * Ссылка для локальной проверки Mini App без Telegram: открывает приложение
 * с подписанным initData, как это делает Telegram. Нужен тот же TELEGRAM_BOT_TOKEN, что у сервера.
 *   npm run tg:link -- 12345 "Иван"        → http://localhost:5173/#tgWebAppData=...
 */
import { signInitData } from '../server/src/auth'

const token = process.env.TELEGRAM_BOT_TOKEN
if (!token) {
  console.error('Задай TELEGRAM_BOT_TOKEN (в .env или окружении)')
  process.exit(1)
}
const [id = '100001', firstName = 'Тест', base = 'http://localhost:5173'] = process.argv.slice(2)
const initData = signInitData(
  {
    auth_date: String(Math.floor(Date.now() / 1000)),
    query_id: 'AAEdev',
    user: JSON.stringify({ id: Number(id), first_name: firstName, username: `dev${id}`, language_code: 'ru' }),
  },
  token,
)
const params = new URLSearchParams({ tgWebAppData: initData, tgWebAppVersion: '8.0', tgWebAppPlatform: 'web' })
console.log(`${base}/#${params.toString()}`)
