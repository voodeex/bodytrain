import { calcTargets, targetsFor, targetsWithOffset } from './nutrition'
import type { BodyWeightEntry, Macros, Profile } from './types'
import { dayKey, shiftDay } from './utils'

export type WeightPeriod = 'week' | 'month' | 'halfYear'
export const weightPeriods: { id: WeightPeriod; label: string }[] = [
  { id: 'week', label: 'Неделя' }, { id: 'month', label: 'Месяц' }, { id: 'halfYear', label: 'Полгода' },
]

/** UTC нужен только для расстояния между календарными датами: переход DST не добавляет часы. */
export const weightDay = (date: string) => Date.parse(`${date}T12:00:00Z`) / 86400000
export const daysBetween = (from: string, to: string) => weightDay(to) - weightDay(from)

export function periodStart(period: WeightPeriod, today = dayKey()): string {
  if (period === 'week') return shiftDay(today, -7)
  const [year, month, day] = today.split('-').map(Number)
  const start = new Date(Date.UTC(year, month - 1 - (period === 'month' ? 1 : 6), 1, 12))
  const lastDay = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0)).getUTCDate()
  start.setUTCDate(Math.min(day, lastDay))
  return start.toISOString().slice(0, 10)
}

const observations = (entries: BodyWeightEntry[], today: string) => entries
  .filter((e) => e.date <= today && Number.isFinite(e.kg) && e.kg >= 20 && e.kg <= 400)
  .sort((a, b) => a.date.localeCompare(b.date))

export interface WeightComparison {
  startDate: string
  first?: BodyWeightEntry
  last?: BodyWeightEntry
  delta?: number
  percent?: number
  days: number
  complete: boolean
  stale: boolean
  points: BodyWeightEntry[]
}

/** Сравнение измерений около границ периода; неполные периоды явно отмечаются в UI. */
export function compareWeight(entries: BodyWeightEntry[], period: WeightPeriod, today = dayKey()): WeightComparison {
  const sorted = observations(entries, today)
  const startDate = periodStart(period, today)
  const tolerance = period === 'week' ? 2 : period === 'month' ? 5 : 14
  const last = sorted.at(-1)
  const stale = !!last && daysBetween(last.date, today) > (period === 'week' ? 2 : 7)
  const nearStart = sorted.filter((e) => e.date !== last?.date && Math.abs(daysBetween(startDate, e.date)) <= tolerance)
    .sort((a, b) => Math.abs(daysBetween(startDate, a.date)) - Math.abs(daysBetween(startDate, b.date)) || a.date.localeCompare(b.date))
  const first = nearStart[0] ?? sorted.find((e) => e.date >= startDate && e.date !== last?.date)
  const hasPair = !!first && !!last && first.date < last.date
  return {
    startDate, first: hasPair ? first : undefined, last, stale,
    delta: hasPair ? last.kg - first.kg : undefined,
    percent: hasPair ? (last.kg - first.kg) / first.kg * 100 : undefined,
    days: hasPair ? daysBetween(first.date, last.date) : 0,
    complete: hasPair && nearStart.length > 0 && !stale,
    points: sorted.filter((e) => e.date >= (hasPair ? first.date : startDate)),
  }
}

const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

export interface WeightTrend {
  status: 'ready' | 'insufficient' | 'stale' | 'noisy'
  count: number
  days: number
  weeklyRate?: number
  latest?: BodyWeightEntry
}

/** Медиана наклонов пар с расстоянием >= недели устойчива к отдельным скачкам воды/ошибкам. */
export function weightTrend(entries: BodyWeightEntry[], today = dayKey(), since?: string): WeightTrend {
  const start = since && since > shiftDay(today, -28) ? since : shiftDay(today, -28)
  const recent = observations(entries, today).filter((e) => e.date >= start)
  const latest = recent.at(-1)
  const days = recent.length > 1 ? daysBetween(recent[0].date, latest!.date) : 0
  const result: WeightTrend = { status: 'insufficient', count: recent.length, days, latest }
  if (latest && daysBetween(latest.date, today) > 7) return { ...result, status: 'stale' }
  if (recent.length < 6 || days < 14) return result
  const midpoint = (weightDay(recent[0].date) + weightDay(latest!.date)) / 2
  if (recent.filter((e) => weightDay(e.date) <= midpoint).length < 3 || recent.filter((e) => weightDay(e.date) > midpoint).length < 3) return result
  const slopes: number[] = []
  for (let i = 0; i < recent.length; i++) for (let j = i + 1; j < recent.length; j++) {
    const distance = daysBetween(recent[i].date, recent[j].date)
    if (distance >= 7) slopes.push((recent[j].kg - recent[i].kg) / distance)
  }
  const slope = median(slopes)
  const origin = weightDay(recent[0].date)
  const intercept = median(recent.map((e) => e.kg - slope * (weightDay(e.date) - origin)))
  const residuals = recent.map((e) => Math.abs(e.kg - intercept - slope * (weightDay(e.date) - origin))).sort((a, b) => a - b)
  const noise = residuals[Math.floor((residuals.length - 1) * 0.75)]
  if (noise > Math.max(0.6, median(recent.map((e) => e.kg)) * 0.01)) return { ...result, status: 'noisy' }
  // Ошибка именно в последнем весе ещё и меняет параметры формулы, поэтому ждём уточнения.
  if (Math.abs(latest!.kg - intercept - slope * (weightDay(latest!.date) - origin)) > Math.max(1, latest!.kg * 0.02)) return { ...result, status: 'noisy' }
  return { ...result, status: 'ready', weeklyRate: slope * 7 }
}

export interface NutritionAdvice {
  status: 'suggestion' | 'onTrack' | 'waiting' | 'manual' | 'limited'
  title: string
  message: string
  trend: WeightTrend
  current: Macros
  proposed?: Macros
  kcalChange?: number
  nextOffset?: number
  reviewDate?: string
  range: [number, number]
}

/** Консервативная эвристика, не обратный расчёт калорий из каждого потерянного килограмма. */
export function nutritionAdvice(profile: Profile, entries: BodyWeightEntry[], today = dayKey()): NutritionAdvice {
  const adjustment = profile.nutritionAdjustment
  const since = [profile.nutritionReviewAfter, adjustment?.appliedAt].filter((v): v is string => !!v).sort().at(-1)
  const trend = weightTrend(entries, today, since)
  const current = targetsFor(profile)
  // Темп выражен в доле текущей массы; предел для похудения не превышает 0.75 кг/нед.
  const range: [number, number] = profile.goal === 'lose'
    ? [-Math.min(profile.weight * 0.0075, 0.75), -Math.min(profile.weight * 0.0025, 0.25)]
    : profile.goal === 'gain' ? [profile.weight * 0.001, profile.weight * 0.0025]
      : [-profile.weight * 0.0015, profile.weight * 0.0015]
  const base: NutritionAdvice = { status: 'waiting', title: 'Собираем тренд', message: '', trend, current, range }
  if (profile.manualTargets) return { ...base, status: 'manual', title: 'Норма задана вручную', message: 'Тренд веса доступен, но ручные КБЖУ не меняются. Для подсказок включи расчёт нормы в профиле.' }
  if (profile.age < 18 || profile.weight / (profile.height / 100) ** 2 < 18.5) return { ...base, status: 'limited', title: 'Индивидуальная норма', message: 'При возрасте до 18 лет или ИМТ ниже 18,5 приложение не предлагает корректировать калории. Норму лучше подобрать со специалистом.' }
  if (since && daysBetween(since, today) < 14) return { ...base, title: 'Наблюдаем после изменения', reviewDate: shiftDay(since, 14), message: 'После изменения нормы нужно минимум 14 дней, чтобы оценить новый тренд.' }
  if (trend.status !== 'ready') return { ...base, title: trend.status === 'stale' ? 'Обнови взвешивания' : trend.status === 'noisy' ? 'Вес сильно колеблется' : base.title,
    message: trend.status === 'stale' ? 'Последняя запись старше недели. Добавь свежий вес для корректировки.'
      : trend.status === 'noisy' ? 'Пока оставляем норму: колебания слишком велики для уверенной корректировки. Взвешивайся в похожих условиях.'
        : 'Нужно минимум 6 взвешиваний за 14–28 дней, по 3 в каждой половине периода. Лучше утром, в похожих условиях.' }
  const rate = trend.weeklyRate!
  if (Math.abs(rate) > Math.min(profile.weight * 0.015, 1.5)) return { ...base, status: 'limited', title: 'Слишком быстрый тренд', message: 'Проверь даты и вес. При таком темпе приложение не предлагает менять калории; причину стоит обсудить со специалистом.' }
  if (rate >= range[0] && rate <= range[1]) return { ...base, status: 'onTrack', title: 'Темп подходит цели', message: 'Оставляем текущие КБЖУ. Следи за трендом, а не за скачками отдельных дней.' }
  const direction = rate < range[0] ? 1 : -1
  const step = Math.min(150, Math.floor(current.kcal * 0.05 / 25) * 25)
  const offset = adjustment?.goal === profile.goal ? adjustment.kcalOffset : 0
  const maxOffset = Math.min(600, Math.round(calcTargets(profile).kcal * 0.2))
  const nextOffset = Math.max(-maxOffset, Math.min(maxOffset, offset + direction * step))
  const proposed = targetsWithOffset(profile, nextOffset)
  const kcalChange = proposed.kcal - current.kcal
  if (Math.abs(kcalChange) < 25 || Math.abs(kcalChange) > 150 || Math.sign(kcalChange) !== direction) return { ...base, status: 'limited', title: 'Достигнут предел корректировки', message: 'Норма достигла границы небольших поправок. Проверь активность, полноту записей еды и исходные параметры.' }
  return { ...base, status: 'suggestion', title: direction > 0 ? 'Предлагаем добавить калории' : 'Предлагаем немного снизить калории',
    message: `${profile.goal === 'lose' ? rate > range[1] ? 'Вес снижается медленнее выбранного темпа.' : 'Вес снижается быстрее выбранного темпа.' : profile.goal === 'gain' ? rate < range[0] ? 'Вес растёт медленнее выбранного темпа.' : 'Вес растёт быстрее выбранного темпа.' : rate < 0 ? 'Вес снижается при цели поддержания.' : 'Вес растёт при цели поддержания.'} Проверь, что еда записана полностью и текущая норма соблюдается.`,
    proposed, kcalChange, nextOffset }
}
