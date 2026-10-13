/**
 * Telegram Mini App. SDK telegram-web-app.js грузится только внутри Telegram,
 * чтобы iOS-приложение и обычный веб не зависели от telegram.org.
 */
export interface TelegramWebApp {
  initData: string
  version: string
  platform: string
  colorScheme: 'light' | 'dark'
  ready(): void
  expand(): void
  close(): void
  isVersionAtLeast(v: string): boolean
  setHeaderColor(color: string): void
  setBackgroundColor(color: string): void
  setBottomBarColor?(color: string): void
  disableVerticalSwipes?(): void
  enableClosingConfirmation?(): void
  disableClosingConfirmation?(): void
  HapticFeedback?: {
    impactOccurred(style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft'): void
    notificationOccurred(type: 'error' | 'success' | 'warning'): void
  }
}

declare global {
  interface Window {
    Telegram?: { WebApp?: TelegramWebApp }
  }
}

const SDK_URL = 'https://telegram.org/js/telegram-web-app.js?59'
const FLAG = 'bodytrain_in_telegram'

/** Telegram передаёт параметры запуска в hash: #tgWebAppData=...&tgWebAppVersion=... */
export function launchedFromTelegram(): boolean {
  if (typeof window === 'undefined') return false
  if (window.Telegram?.WebApp?.initData) return true
  const hash = window.location.hash
  if (hash.includes('tgWebAppData') || hash.includes('tgWebAppVersion')) {
    try {
      sessionStorage.setItem(FLAG, '1')
    } catch {
      /* приватный режим */
    }
    return true
  }
  try {
    // После перезагрузки страницы внутри Telegram hash может пропасть.
    return sessionStorage.getItem(FLAG) === '1'
  } catch {
    return false
  }
}

let loading: Promise<TelegramWebApp | null> | null = null

export function loadTelegram(): Promise<TelegramWebApp | null> {
  if (!launchedFromTelegram()) return Promise.resolve(null)
  loading ??= new Promise((resolve) => {
    if (window.Telegram?.WebApp) return resolve(setup(window.Telegram.WebApp))
    const s = document.createElement('script')
    s.src = SDK_URL
    s.async = true
    const timer = setTimeout(() => resolve(null), 10000)
    s.onload = () => {
      clearTimeout(timer)
      resolve(window.Telegram?.WebApp ? setup(window.Telegram.WebApp) : null)
    }
    s.onerror = () => {
      clearTimeout(timer)
      resolve(null)
    }
    document.head.append(s)
  })
  return loading
}

function setup(tg: TelegramWebApp) {
  try {
    tg.ready()
    tg.expand()
    if (tg.isVersionAtLeast('6.1')) {
      tg.setHeaderColor('#0b0b0c')
      tg.setBackgroundColor('#0b0b0c')
    }
    if (tg.isVersionAtLeast('7.10')) tg.setBottomBarColor?.('#0b0b0c')
    // Иначе свайп вниз по списку сворачивает Mini App.
    if (tg.isVersionAtLeast('7.7')) tg.disableVerticalSwipes?.()
  } catch {
    /* старый клиент Telegram */
  }
  document.documentElement.dataset.telegram = '1'
  return tg
}

export const telegram = () => window.Telegram?.WebApp ?? null
