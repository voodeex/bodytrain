import { initialData } from '../data/defaults'
import type { AppData } from './types'
import { parseAppData } from './validation'

/**
 * Трёхстороннее слияние дневника для синхронизации между устройствами.
 *  base   — последняя версия, которую это устройство видело на сервере (null — ещё не синхронизировалось);
 *  local  — что сейчас на устройстве;
 *  remote — что сейчас на сервере.
 * Записи с id объединяются: добавленные с обеих сторон сохраняются, удалённые на одной стороне удаляются,
 * если другая сторона их не меняла. При правке одной записи на двух устройствах побеждает это устройство.
 */

/** JSON с отсортированными ключами — jsonb в Postgres меняет порядок ключей. */
export function stableJson(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map((x) => (x === undefined ? 'null' : stableJson(x))).join(',')}]`
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>
    return `{${Object.keys(o)
      .filter((k) => o[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stableJson(o[k])}`)
      .join(',')}}`
  }
  return JSON.stringify(v) ?? 'null'
}

export const sameData = (a: unknown, b: unknown) => stableJson(a) === stableJson(b)

function mergeList<T>(base: T[] | undefined, local: T[], remote: T[], key: (x: T) => string): T[] {
  const b = new Map(base?.map((x) => [key(x), x]))
  const l = new Map(local.map((x) => [key(x), x]))
  const r = new Map(remote.map((x) => [key(x), x]))
  const out: T[] = []
  for (const id of [...l.keys(), ...[...r.keys()].filter((k) => !l.has(k))]) {
    const lv = l.get(id)
    const rv = r.get(id)
    const bv = b.get(id)
    if (lv !== undefined && rv !== undefined) out.push(bv !== undefined && sameData(lv, bv) ? rv : lv)
    else if (lv !== undefined) {
      // нет на сервере: новая локальная запись или удалённая на другом устройстве
      if (bv === undefined || !sameData(lv, bv)) out.push(lv)
    } else if (rv !== undefined) {
      // нет на устройстве: новая с сервера или удалённая здесь
      if (bv === undefined || !sameData(rv, bv)) out.push(rv)
    }
  }
  return out
}

function pick<T>(base: T | undefined, local: T, remote: T, initial: T): T {
  if (base !== undefined) return sameData(local, base) ? remote : local
  // Первая синхронизация: аккаунт важнее, если там уже что-то настроено.
  return sameData(remote, initial) ? local : remote
}

export function mergeAppData(base: AppData | null, local: AppData, remote: AppData | null): AppData {
  if (!remote) return local
  const workouts = mergeList(base?.workouts, local.workouts, remote.workouts, (w) => w.id).sort((a, b) => b.startedAt - a.startedAt)
  let activeWorkout = pick(base ? base.activeWorkout : undefined, local.activeWorkout, remote.activeWorkout, null)
  // Тренировку завершили на другом устройстве — она уже в истории.
  if (activeWorkout && workouts.some((w) => w.id === activeWorkout!.id)) activeWorkout = null

  const exercises = mergeList(base?.exercises, local.exercises, remote.exercises, (e) => e.id)
  // Не теряем упражнения, на которые ссылаются оставшиеся тренировки.
  const used = new Set([...workouts, ...(activeWorkout ? [activeWorkout] : [])].flatMap((w) => w.exercises.map((e) => e.exerciseId)))
  for (const id of used) {
    if (exercises.some((e) => e.id === id)) continue
    const found = local.exercises.find((e) => e.id === id) ?? remote.exercises.find((e) => e.id === id)
    if (found) exercises.push(found)
  }

  return parseAppData({
    exercises,
    workouts,
    activeWorkout,
    foodLog: mergeList(base?.foodLog, local.foodLog, remote.foodLog, (e) => e.id).sort((a, b) => a.createdAt - b.createdAt),
    bodyWeight: mergeList(base?.bodyWeight, local.bodyWeight, remote.bodyWeight, (e) => e.date),
    profile: pick(base?.profile, local.profile, remote.profile, initialData.profile),
    settings: pick(base?.settings, local.settings, remote.settings, initialData.settings),
  })
}
