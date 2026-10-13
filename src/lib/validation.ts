import { initialData } from '../data/defaults'
import { defaultExercises } from '../data/exercises'
import type { AppData, Exercise, FoodItem, Macros, Profile, Settings, Workout } from './types'

const fail = (name: string): never => { throw new Error(`Некорректные данные: ${name}`) }
const obj = (v: unknown, name: string): Record<string, unknown> => v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : fail(name)
const str = (v: unknown, name: string, max = 200): string => typeof v === 'string' && v.trim().length > 0 && v.length <= max ? v.trim() : fail(name)
export const inRange = (v: unknown, min: number, max: number): v is number => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max
const number = (v: unknown, name: string, min: number, max: number): number => inRange(v, min, max) ? v : fail(name)
const choice = <T extends string>(v: unknown, options: readonly T[], name: string): T => options.includes(v as T) ? v as T : fail(name)
const array = <T>(v: unknown, name: string, parse: (v: unknown) => T, max = 100000): T[] => Array.isArray(v) && v.length <= max ? v.map(parse) : fail(name)
export function validDate(v: unknown): v is string {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false
  const d = new Date(`${v}T12:00:00Z`)
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === v
}
const date = (v: unknown): string => validDate(v) ? v : fail('дата')
const unique = <T extends { id: string }>(list: T[], name: string) => {
  if (new Set(list.map((x) => x.id)).size !== list.length) fail(`повторяющиеся ID: ${name}`)
  return list
}

export function validateMacros(v: unknown): Macros {
  const p = obj(v, 'КБЖУ')
  return { kcal: number(p.kcal, 'ккал', 0, 20000), protein: number(p.protein, 'белки', 0, 3000), fat: number(p.fat, 'жиры', 0, 3000), carbs: number(p.carbs, 'углеводы', 0, 3000) }
}
export function validateFood(v: unknown): FoodItem {
  const p = obj(v, 'продукт')
  const m = validateMacros(p)
  if (m.kcal > 1200 || m.protein > 100 || m.fat > 100 || m.carbs > 100 || m.protein + m.fat + m.carbs > 105) fail('КБЖУ на 100 г')
  const macroEnergy = m.protein * 4 + m.fat * 9 + m.carbs * 4
  // Широкий допуск на клетчатку/полиолы; отсеиваем явные ошибки масштаба и единиц.
  if (macroEnergy > 50 && m.kcal < macroEnergy * 0.4) fail('калории не соответствуют БЖУ')
  return {
    ...m, name: str(p.name, 'название продукта'),
    source: choice(p.source, ['local', 'off', 'vision', 'groq', 'cloudflare', 'gemini', 'claude', 'manual'], 'источник продукта'),
    ...(p.brand !== undefined ? { brand: str(p.brand, 'бренд') } : {}),
    ...(p.barcode !== undefined ? { barcode: str(p.barcode, 'штрихкод', 100) } : {}),
    ...(p.portion !== undefined ? { portion: number(p.portion, 'порция', 0.1, 10000) } : {}),
  }
}
export function validateProfile(v: unknown): Profile {
  const p = obj(v, 'профиль')
  const result: Profile = {
    sex: choice(p.sex, ['male', 'female'], 'пол'), age: number(p.age, 'возраст', 14, 100),
    height: number(p.height, 'рост', 100, 250), weight: number(p.weight, 'вес', 20, 400),
    activity: choice(p.activity, ['sedentary', 'light', 'moderate', 'high', 'athlete'], 'активность'),
    goal: choice(p.goal, ['lose', 'keep', 'gain'], 'цель'),
  }
  if (p.manualTargets !== undefined) {
    result.manualTargets = validateMacros(p.manualTargets)
    if (result.manualTargets.kcal <= 0) fail('цель по калориям')
  }
  if (p.nutritionReviewAfter !== undefined) result.nutritionReviewAfter = date(p.nutritionReviewAfter)
  if (p.nutritionAdjustment !== undefined) {
    const a = obj(p.nutritionAdjustment, 'корректировка питания')
    result.nutritionAdjustment = {
      kcalOffset: number(a.kcalOffset, 'поправка калорий', -600, 600),
      kcalChange: number(a.kcalChange, 'шаг калорий', -150, 150),
      weeklyRate: number(a.weeklyRate, 'темп веса', -10, 10),
      appliedAt: date(a.appliedAt), goal: choice(a.goal, ['lose', 'keep', 'gain'], 'цель корректировки'),
    }
    if (result.nutritionAdjustment.goal !== result.goal) fail('цель корректировки отличается от профиля')
  }
  return result
}
export function validateSettings(v: unknown): Settings {
  const p = obj(v, 'настройки')
  return {
    restSeconds: number(p.restSeconds, 'таймер отдыха', 15, 3600),
    aiProvider: choice(p.aiProvider ?? initialData.settings.aiProvider, ['groq', 'cloudflare'], 'сервис распознавания'),
  }
}
export function parseAppData(value: unknown): AppData {
  const p = obj(value, 'резервная копия')
  const exercises = unique(array(p.exercises, 'упражнения', (v): Exercise => {
    const e = obj(v, 'упражнение')
    return {
      id: str(e.id, 'ID'), name: str(e.name, 'название упражнения'),
      muscle: choice(e.muscle, ['chest', 'back', 'legs', 'shoulders', 'arms', 'core', 'cardio', 'other'], 'группа мышц'),
      ...(e.custom === true ? { custom: true } : {}),
      unit: e.unit !== undefined ? choice(e.unit, ['reps', 'seconds', 'minutes'] as const, 'единица упражнения') : defaultExercises.find((x) => x.id === e.id)?.unit,
    }
  }, 1000), 'упражнения')
  for (const e of defaultExercises) if (!exercises.some((x) => x.id === e.id)) exercises.push(e)
  const ids = new Set(exercises.map((e) => e.id))
  const workout = (v: unknown): Workout => {
    const w = obj(v, 'тренировка')
    const startedAt = number(w.startedAt, 'начало тренировки', 0, 1e15)
    const result: Workout = {
      id: str(w.id, 'ID тренировки'), title: str(w.title === '' ? 'Тренировка' : w.title, 'название тренировки'), startedAt,
      exercises: unique(array(w.exercises, 'упражнения тренировки', (v) => {
        const e = obj(v, 'упражнение тренировки')
        const exerciseId = str(e.exerciseId, 'ссылка на упражнение')
        if (!ids.has(exerciseId)) fail('неизвестное упражнение')
        return { id: str(e.id, 'ID упражнения'), exerciseId, sets: unique(array(e.sets, 'подходы', (v) => {
          const s = obj(v, 'подход')
          const reps = number(s.reps, 'повторы', 0, 10000)
          if (!Number.isInteger(reps) || typeof s.done !== 'boolean' || (s.done && reps <= 0)) fail('подход')
          return { id: str(s.id, 'ID подхода'), weight: number(s.weight, 'вес подхода', 0, 2000), reps, done: s.done as boolean }
        }, 100), 'подходы') }
      }, 100), 'упражнения тренировки'),
    }
    if (w.finishedAt !== undefined) result.finishedAt = number(w.finishedAt, 'конец тренировки', startedAt, 1e15)
    if (w.restEndsAt !== undefined) result.restEndsAt = number(w.restEndsAt, 'таймер', 0, 1e15)
    if (w.restDuration !== undefined) result.restDuration = number(w.restDuration, 'длительность отдыха', 1, 10000)
    return result
  }
  const foodLog = unique(array(p.foodLog, 'дневник питания', (v) => {
    const e = obj(v, 'запись питания')
    return { id: str(e.id, 'ID еды'), date: date(e.date), meal: choice(e.meal, ['breakfast', 'lunch', 'dinner', 'snack'], 'приём пищи'), food: validateFood(e.food), grams: number(e.grams, 'граммы', 0.1, 10000), createdAt: number(e.createdAt, 'время записи', 0, 1e15) }
  }), 'дневник питания')
  const bodyWeight = array(p.bodyWeight, 'вес тела', (v) => {
    const e = obj(v, 'вес тела')
    return { date: date(e.date), kg: number(e.kg, 'вес тела', 20, 400) }
  }).sort((a, b) => a.date.localeCompare(b.date))
  if (new Set(bodyWeight.map((x) => x.date)).size !== bodyWeight.length) fail('повторяющиеся даты веса')
  const workouts = unique(array(p.workouts, 'тренировки', workout), 'тренировки').sort((a, b) => b.startedAt - a.startedAt)
  if (workouts.some((w) => w.finishedAt === undefined)) fail('незавершённая тренировка в истории')
  const activeWorkout = p.activeWorkout == null ? null : workout(p.activeWorkout)
  if (activeWorkout && (activeWorkout.finishedAt !== undefined || workouts.some((w) => w.id === activeWorkout.id))) fail('активная тренировка')
  return { exercises, workouts, activeWorkout, foodLog, bodyWeight, profile: validateProfile(p.profile), settings: validateSettings(p.settings) }
}

export function parseBackup(value: unknown): AppData {
  const p = obj(value, 'резервная копия')
  if (p.app !== 'BodyTrain') throw new Error('Это не резервная копия BodyTrain')
  if (p.schemaVersion !== undefined && p.schemaVersion !== 1) throw new Error('Эта копия создана более новой версией BodyTrain')
  return parseAppData(p)
}
