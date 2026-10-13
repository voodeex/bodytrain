import type { Activity, Goal, Macros, Profile } from './types'

export const activityLabels: Record<Activity, string> = {
  sedentary: 'Сидячий образ жизни',
  light: '1–2 тренировки в неделю',
  moderate: '3–4 тренировки в неделю',
  high: '5–6 тренировок в неделю',
  athlete: 'Каждый день / тяжёлый труд',
}

const activityFactor: Record<Activity, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  high: 1.725,
  athlete: 1.9,
}

export const goalLabels: Record<Goal, string> = {
  lose: 'Похудение',
  keep: 'Поддержание',
  gain: 'Набор массы',
}

const goalFactor: Record<Goal, number> = { lose: 0.85, keep: 1, gain: 1.1 }

/** Базовый обмен по Миффлину — Сан Жеору. */
export const bmr = (p: Profile) =>
  10 * p.weight + 6.25 * p.height - 5 * p.age + (p.sex === 'male' ? 5 : -161)

export const tdee = (p: Profile) => bmr(p) * activityFactor[p.activity]

export const calcTargets = (p: Profile): Macros => {
  const kcal = Math.round(tdee(p) * goalFactor[p.goal])
  // Белок 1.8–2.2 г/кг, жиры ~0.9 г/кг, остальное — углеводы.
  const protein = Math.round(p.weight * (p.goal === 'keep' ? 1.8 : 2))
  const fat = Math.round(p.weight * (p.goal === 'lose' ? 0.8 : 0.9))
  const carbs = Math.max(0, Math.round((kcal - protein * 4 - fat * 9) / 4))
  return { kcal, protein, fat, carbs }
}

/** Поправка меняет углеводы, сохраняя расчётные белки и жиры. */
export const targetsWithOffset = (p: Profile, offset: number): Macros => {
  const base = calcTargets(p)
  const floor = Math.max(p.sex === 'male' ? 1500 : 1200, base.protein * 4 + base.fat * 9)
  const maxOffset = Math.min(600, Math.round(base.kcal * 0.2))
  const kcal = Math.round(Math.max(floor, base.kcal + Math.max(-maxOffset, Math.min(maxOffset, offset))))
  return { ...base, kcal, carbs: Math.max(0, Math.round((kcal - base.protein * 4 - base.fat * 9) / 4)) }
}

export const targetsFor = (p: Profile): Macros => {
  if (p.manualTargets) return p.manualTargets
  const adjustment = p.nutritionAdjustment
  if (!adjustment || adjustment.goal !== p.goal || p.age < 18 || p.weight / (p.height / 100) ** 2 < 18.5) return calcTargets(p)
  return targetsWithOffset(p, adjustment.kcalOffset)
}
