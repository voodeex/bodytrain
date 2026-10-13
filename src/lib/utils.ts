import type { Exercise, FoodItem, Macros, Workout, WorkoutSet } from './types'

export const uid = () =>
  (crypto.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`)

export const pad = (n: number) => String(n).padStart(2, '0')

export const dayKey = (d: Date = new Date()) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

export const parseDayKey = (key: string) => {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export const shiftDay = (key: string, delta: number) => {
  const d = parseDayKey(key)
  d.setDate(d.getDate() + delta)
  return dayKey(d)
}

const monthsGen = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря']
const weekdays = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб']

export const formatDay = (key: string) => {
  const today = dayKey()
  if (key === today) return 'Сегодня'
  if (key === shiftDay(today, -1)) return 'Вчера'
  if (key === shiftDay(today, 1)) return 'Завтра'
  const d = parseDayKey(key)
  return `${weekdays[d.getDay()]}, ${d.getDate()} ${monthsGen[d.getMonth()]}`
}

export const formatDate = (ts: number) => {
  const d = new Date(ts)
  return `${d.getDate()} ${monthsGen[d.getMonth()]}`
}

export const formatTime = (ts: number) => {
  const d = new Date(ts)
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export const formatDuration = (ms: number) => {
  const total = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`
}

export const formatMinutes = (ms: number) => {
  const m = Math.round(ms / 60000)
  if (m < 60) return `${m} мин`
  return `${Math.floor(m / 60)} ч ${m % 60} мин`
}

/** Принимает и запятую, и точку — на русской клавиатуре iOS десятичный разделитель «,». */
export const parseNum = (s: string): number => {
  const n = parseFloat(s.replace(',', '.').replace(/\s/g, ''))
  return Number.isFinite(n) ? n : 0
}

export const fmt = (n: number, digits = 0) => {
  if (!Number.isFinite(n)) return '0'
  const v = Number(n.toFixed(digits))
  return v.toLocaleString('ru-RU', { maximumFractionDigits: digits })
}

export const macrosFor = (food: FoodItem, grams: number): Macros => {
  const k = grams / 100
  return {
    kcal: food.kcal * k,
    protein: food.protein * k,
    fat: food.fat * k,
    carbs: food.carbs * k,
  }
}

export const sumMacros = (list: Macros[]): Macros =>
  list.reduce(
    (a, b) => ({ kcal: a.kcal + b.kcal, protein: a.protein + b.protein, fat: a.fat + b.fat, carbs: a.carbs + b.carbs }),
    { kcal: 0, protein: 0, fat: 0, carbs: 0 },
  )

/** Оценка 1ПМ по формуле Эпли. */
export const e1rm = (weight: number, reps: number) => (reps <= 1 ? weight : weight * (1 + reps / 30))

export const setVolume = (s: WorkoutSet) => (s.done ? s.weight * s.reps : 0)

export const workoutVolume = (w: Workout, exercises: Exercise[]) => w.exercises.reduce((total, e) => {
  const unit = exercises.find((x) => x.id === e.exerciseId)?.unit
  if (unit === 'seconds' || unit === 'minutes') return total
  return total + e.sets.reduce((v, s) => v + setVolume(s), 0)
}, 0)

export const plural = (n: number, one: string, few: string, many: string) => {
  const n10 = n % 10
  const n100 = n % 100
  if (n10 === 1 && n100 !== 11) return one
  if (n10 >= 2 && n10 <= 4 && (n100 < 12 || n100 > 14)) return few
  return many
}

export const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v))
