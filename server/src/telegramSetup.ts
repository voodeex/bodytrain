import { webhookToken, type Config } from './config'

/**
 * При старте сервер сам регистрирует webhook бота и кнопку меню Mini App.
 * Так секрет webhook (TELEGRAM_WEBHOOK_SECRET) не нужно никуда копировать вручную.
 * Работает только с публичным https-адресом (PUBLIC_URL или RENDER_EXTERNAL_URL).
 */
export async function configureTelegramBot(config: Config, fetchImpl: typeof fetch = fetch) {
  const { telegramBotToken: token, publicUrl, telegramWebhookSecret: secret } = config
  if (!token || !publicUrl?.startsWith('https://')) return

  const call = async (method: string, body: unknown) => {
    const res = await fetchImpl(`https://api.telegram.org/bot${token}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const json = (await res.json().catch(() => ({}))) as { ok?: boolean; description?: string }
    if (!json.ok) console.warn(`Telegram ${method}: ${json.description ?? res.status}`)
    return !!json.ok
  }

  try {
    await call('setChatMenuButton', { menu_button: { type: 'web_app', text: 'Открыть', web_app: { url: publicUrl } } })
    if (secret) {
      const ok = await call('setWebhook', {
        url: `${publicUrl}/api/telegram/webhook`,
        secret_token: webhookToken(secret),
        allowed_updates: ['message'],
      })
      if (ok) console.log(`Telegram webhook: ${publicUrl}/api/telegram/webhook`)
    }
  } catch (e) {
    console.warn('Не удалось настроить бота:', (e as Error).message)
  }
}
