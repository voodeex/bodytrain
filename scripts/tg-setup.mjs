import { createHash } from 'node:crypto'

// Настройка бота через Bot API: webhook, кнопка меню с Mini App, команды и описание.
//   npm run tg:setup      (берёт TELEGRAM_BOT_TOKEN, PUBLIC_URL, TELEGRAM_WEBHOOK_SECRET из .env)
const token = process.env.TELEGRAM_BOT_TOKEN
const url = process.env.PUBLIC_URL?.replace(/\/$/, '')
const secret = process.env.TELEGRAM_WEBHOOK_SECRET
if (!token || !url?.startsWith('https://')) {
  console.error('Нужны TELEGRAM_BOT_TOKEN и PUBLIC_URL с https:// (Telegram открывает Mini App только по HTTPS)')
  process.exit(1)
}

async function call(method, body) {
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const json = await res.json()
  console.log(json.ok ? '✓' : '✗', method, json.ok ? '' : json.description)
  if (!json.ok) process.exitCode = 1
}

await call('setChatMenuButton', { menu_button: { type: 'web_app', text: 'Открыть', web_app: { url } } })
await call('setMyCommands', { commands: [{ command: 'start', description: 'Открыть BodyTrain' }] })
await call('setMyDescription', { description: 'Дневник тренировок и КБЖУ. Записывай подходы, считай калории по фото и штрихкоду, соревнуйся по тоннажу за день и неделю.' })
await call('setMyShortDescription', { short_description: 'Тренировки, КБЖУ и рейтинг по тоннажу' })
if (secret) {
  await call('setWebhook', { url: `${url}/api/telegram/webhook`, secret_token: createHash('sha256').update(secret).digest('hex'), allowed_updates: ['message'] })
} else {
  console.log('TELEGRAM_WEBHOOK_SECRET не задан — webhook для ответа на /start не настроен (кнопка меню работает и без него)')
}
