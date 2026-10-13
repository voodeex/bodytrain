import { Directory, Encoding, Filesystem } from '@capacitor/filesystem'
import type { StateStorage } from 'zustand/middleware'
import { isNative } from './http'

/**
 * Хранилище для zustand persist.
 * На iOS — JSON-файл в Library/ приложения (не вычищается системой, как localStorage WebView).
 * В браузере — localStorage.
 * Запись дебаунсится: во время тренировки состояние меняется на каждый тап.
 */
const FILE = 'bodytrain-state.json'
const pending = new Map<string, string>()
let timer: ReturnType<typeof setTimeout> | undefined
let writes: Promise<void> = Promise.resolve()
export let storageError: string | null = null

function status(error: string | null) {
  storageError = error
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('bodytrain-storage', { detail: error }))
}

function writeNow() {
  timer = undefined
  writes = writes.catch(() => undefined).then(async () => {
    try {
      for (const [name, value] of [...pending.entries()]) {
        if (isNative) {
          await Filesystem.writeFile({ path: `${name}-${FILE}`, data: value, directory: Directory.Library, encoding: Encoding.UTF8 })
        } else {
          localStorage.setItem(name, value)
        }
        if (pending.get(name) === value) pending.delete(name)
      }
      status(null)
    } catch (e) {
      status('Не удалось сохранить данные. Проверь свободное место и повтори сохранение.')
      throw e
    }
  })
  return writes
}

export function flushStorage() {
  if (timer) clearTimeout(timer)
  return writeNow()
}

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void flushStorage().catch(() => undefined)
  })
}

export const appStorage: StateStorage = {
  async getItem(name) {
    if (pending.has(name)) return pending.get(name)!
    if (!isNative) return localStorage.getItem(name)
    try {
      const res = await Filesystem.readFile({ path: `${name}-${FILE}`, directory: Directory.Library, encoding: Encoding.UTF8 })
      return typeof res.data === 'string' ? res.data : await res.data.text()
    } catch (e) {
      if (/not found|does not exist|doesn't exist|no such file/i.test((e as Error).message ?? '')) return null
      throw e
    }
  },
  setItem(name, value) {
    pending.set(name, value)
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => void writeNow().catch(() => undefined), 400)
  },
  async removeItem(name) {
    pending.delete(name)
    if (!isNative) return localStorage.removeItem(name)
    try {
      await Filesystem.deleteFile({ path: `${name}-${FILE}`, directory: Directory.Library })
    } catch {
      /* файла нет */
    }
  },
}
