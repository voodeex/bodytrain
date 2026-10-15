import { Capacitor, CapacitorHttp } from '@capacitor/core'

export const isNative = Capacitor.isNativePlatform()

/**
 * Сопоставление внешних хостов с путями dev-прокси Vite (см. vite.config.ts).
 * На iOS запросы идут через нативный CapacitorHttp, поэтому CORS не мешает.
 */
const devProxy: [string, string][] = [
  ['https://api.groq.com', '/proxy/groq'],
  ['https://openrouter.ai', '/proxy/openrouter'],
  ['https://api.cloudflare.com', '/proxy/cloudflare'],
]

const webUrl = (url: string) => {
  if (!import.meta.env.DEV) return url
  for (const [host, path] of devProxy) if (url.startsWith(host)) return path + url.slice(host.length)
  return url
}

export class HttpError extends Error {
  constructor(public status: number, public body: unknown) {
    super(`HTTP ${status}`)
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  headers?: Record<string, string>
  body?: unknown
  timeoutMs?: number
}

export async function requestJson<T>(url: string, opts: RequestOptions = {}): Promise<T> {
  const { method = 'GET', headers = {}, body, timeoutMs = 20000 } = opts
  if (isNative) {
    const res = await CapacitorHttp.request({
      url,
      method,
      headers: { Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}), ...headers },
      data: body,
      connectTimeout: timeoutMs,
      readTimeout: timeoutMs,
      responseType: 'json',
    })
    let data = res.data
    if (typeof data === 'string') {
      try {
        data = JSON.parse(data)
      } catch {
        /* оставляем строкой */
      }
    }
    if (res.status < 200 || res.status >= 300) throw new HttpError(res.status, data)
    return data as T
  }

  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetch(webUrl(url), {
      method,
      headers: { Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}), ...headers },
      body: body ? JSON.stringify(body) : undefined,
      signal: ctrl.signal,
    })
    const text = await res.text()
    let data: unknown = text
    try {
      data = JSON.parse(text)
    } catch {
      /* не JSON */
    }
    if (!res.ok) throw new HttpError(res.status, data)
    return data as T
  } finally {
    clearTimeout(timer)
  }
}
