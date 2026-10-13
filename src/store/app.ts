import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { initialData } from '../data/defaults'
import { appStorage } from '../lib/storage'
import { inRange, parseAppData, validDate, validateFood, validateProfile, validateSettings } from '../lib/validation'
import type {
  AppData,
  Exercise,
  FoodEntry,
  FoodItem,
  Meal,
  MuscleGroup,
  Profile,
  Settings,
  Workout,
  WorkoutExercise,
  WorkoutSet,
} from '../lib/types'
import { dayKey, uid } from '../lib/utils'
import { nutritionAdvice } from '../lib/weightTrend'

export type { AppData } from '../lib/types'

interface Actions {
  // Тренировки
  startWorkout: (from?: Workout) => void
  renameWorkout: (title: string) => void
  addExerciseToWorkout: (exerciseId: string) => void
  removeExerciseFromWorkout: (weId: string) => void
  addSet: (weId: string) => void
  updateSet: (weId: string, setId: string, patch: Partial<WorkoutSet>) => void
  removeSet: (weId: string, setId: string) => void
  setRestTimer: (endsAt?: number, duration?: number) => void
  finishWorkout: () => void
  discardWorkout: () => void
  deleteWorkout: (id: string) => void
  createExercise: (name: string, muscle: MuscleGroup, unit?: Exercise['unit']) => Exercise

  // Питание
  addFood: (food: FoodItem, grams: number, meal: Meal, date: string) => void
  updateFoodEntry: (id: string, patch: Partial<Pick<FoodEntry, 'grams' | 'meal'>>) => void
  removeFoodEntry: (id: string) => void

  // Профиль
  setProfile: (patch: Partial<Profile>) => void
  setSettings: (patch: Partial<Settings>) => void
  logBodyWeight: (kg: number, date?: string) => void
  removeBodyWeight: (date: string) => void
  applyNutritionAdjustment: () => void
  resetNutritionAdjustment: () => void

  importData: (data: unknown) => void
  resetAll: () => void
}

const initial = initialData
export let hydrationError: string | null = null

/** Последний завершённый подход по упражнению — для подсказки «в прошлый раз». */
export const lastSetsFor = (workouts: Workout[], exerciseId: string): WorkoutSet[] => {
  for (const w of workouts) {
    const we = w.exercises.find((e) => e.exerciseId === exerciseId)
    const done = we?.sets.filter((s) => s.done)
    if (done && done.length) return done
  }
  return []
}

const mapActive = (s: AppData, fn: (w: Workout) => Workout) =>
  s.activeWorkout ? { activeWorkout: fn(s.activeWorkout) } : {}

const mapExercise = (w: Workout, weId: string, fn: (we: WorkoutExercise) => WorkoutExercise): Workout => ({
  ...w,
  exercises: w.exercises.map((we) => (we.id === weId ? fn(we) : we)),
})

const defaultTitle = () => {
  const h = new Date().getHours()
  if (h < 12) return 'Утренняя тренировка'
  if (h < 18) return 'Дневная тренировка'
  return 'Вечерняя тренировка'
}

export const useApp = create<AppData & Actions>()(
  persist(
    (set, get) => ({
      ...initial,

      startWorkout: (from) => {
        const exercises: WorkoutExercise[] = (from?.exercises ?? []).map((we) => ({
          id: uid(),
          exerciseId: we.exerciseId,
          sets: we.sets.map((s) => ({ id: uid(), weight: s.weight, reps: s.reps, done: false })),
        }))
        set({ activeWorkout: { id: uid(), title: from?.title ?? defaultTitle(), startedAt: Date.now(), exercises } })
      },

      renameWorkout: (title) => set((s) => mapActive(s, (w) => ({ ...w, title: title.slice(0, 200) }))),

      addExerciseToWorkout: (exerciseId) =>
        set((s) =>
          mapActive(s, (w) => {
            const prev = lastSetsFor(s.workouts, exerciseId)
            const sets: WorkoutSet[] = prev.length
              ? prev.map((p) => ({ id: uid(), weight: p.weight, reps: p.reps, done: false }))
              : [{ id: uid(), weight: 0, reps: 10, done: false }]
            return { ...w, exercises: [...w.exercises, { id: uid(), exerciseId, sets }] }
          }),
        ),

      removeExerciseFromWorkout: (weId) =>
        set((s) => mapActive(s, (w) => ({ ...w, exercises: w.exercises.filter((e) => e.id !== weId) }))),

      addSet: (weId) =>
        set((s) =>
          mapActive(s, (w) =>
            mapExercise(w, weId, (we) => {
              const last = we.sets[we.sets.length - 1]
              return { ...we, sets: [...we.sets, { id: uid(), weight: last?.weight ?? 0, reps: last?.reps ?? 10, done: false }] }
            }),
          ),
        ),

      updateSet: (weId, setId, patch) =>
        set((s) =>
          mapActive(s, (w) =>
            mapExercise(w, weId, (we) => ({ ...we, sets: we.sets.map((x) => {
              if (x.id !== setId) return x
              const weight = inRange(patch.weight, 0, 2000) ? patch.weight : x.weight
              const reps = inRange(patch.reps, 0, 10000) ? Math.round(patch.reps) : x.reps
              return { ...x, weight, reps, done: reps > 0 && (patch.done ?? x.done) }
            }) })),
          ),
        ),

      removeSet: (weId, setId) =>
        set((s) =>
          mapActive(s, (w) => mapExercise(w, weId, (we) => ({ ...we, sets: we.sets.filter((x) => x.id !== setId) }))),
        ),

      setRestTimer: (restEndsAt, restDuration) => set((s) => mapActive(s, (w) => ({ ...w, restEndsAt, restDuration }))),

      finishWorkout: () => {
        const w = get().activeWorkout
        if (!w) return
        // Сохраняем только выполненные подходы; пустые упражнения выкидываем.
        const exercises = w.exercises
          .map((we) => ({ ...we, sets: we.sets.filter((x) => x.done) }))
          .filter((we) => we.sets.length > 0)
        if (exercises.length === 0) {
          set({ activeWorkout: null })
          return
        }
        set((s) => ({ activeWorkout: null, workouts: [{ ...w, title: w.title.trim() || 'Тренировка', restEndsAt: undefined, restDuration: undefined, exercises, finishedAt: Date.now() }, ...s.workouts] }))
      },

      discardWorkout: () => set({ activeWorkout: null }),

      deleteWorkout: (id) => set((s) => ({ workouts: s.workouts.filter((w) => w.id !== id) })),

      createExercise: (name, muscle, unit = 'reps') => {
        if (!name.trim() || name.trim().length > 200) throw new Error('Название упражнения должно быть от 1 до 200 символов')
        const ex: Exercise = { id: uid(), name: name.trim(), muscle, unit, custom: true }
        set((s) => ({ exercises: [...s.exercises, ex] }))
        return ex
      },

      addFood: (food, grams, meal, date) =>
        {
          if (!inRange(grams, 0.1, 10000) || !validDate(date)) throw new Error('Проверь массу порции и дату')
          const checked = validateFood(food)
          set((s) => ({ foodLog: [...s.foodLog, { id: uid(), food: checked, grams, meal, date, createdAt: Date.now() }] }))
        },

      updateFoodEntry: (id, patch) =>
        set((s) => ({ foodLog: s.foodLog.map((e) => (e.id === id ? { ...e, ...patch, grams: inRange(patch.grams, 0.1, 10000) ? patch.grams : e.grams } : e)) })),

      removeFoodEntry: (id) => set((s) => ({ foodLog: s.foodLog.filter((e) => e.id !== id) })),

      setProfile: (patch) => set((s) => {
        const merged = { ...s.profile, ...patch }
        const changed = (['sex', 'age', 'height', 'weight', 'activity', 'goal', 'manualTargets'] as const)
          .some((k) => JSON.stringify(merged[k]) !== JSON.stringify(s.profile[k]))
        if (changed) { merged.nutritionAdjustment = undefined; merged.nutritionReviewAfter = dayKey() }
        const profile = validateProfile(merged)
        return { profile }
      }),
      setSettings: (patch) => set((s) => ({ settings: validateSettings({ ...s.settings, ...patch }) })),

      logBodyWeight: (kg, date = dayKey()) =>
        {
          if (!inRange(kg, 20, 400) || !validDate(date) || date > dayKey()) throw new Error('Укажи вес от 20 до 400 кг и дату не позже сегодня')
          set((s) => ({
          bodyWeight: [...s.bodyWeight.filter((b) => b.date !== date), { date, kg }].sort((a, b) => a.date.localeCompare(b.date)),
          profile: date >= (s.bodyWeight.filter((b) => b.date <= dayKey()).at(-1)?.date ?? '') ? { ...s.profile, weight: kg } : s.profile,
          }))
        },

      removeBodyWeight: (date) => set((s) => {
        const bodyWeight = s.bodyWeight.filter((b) => b.date !== date)
        const last = bodyWeight.filter((b) => b.date <= dayKey()).at(-1)
        const removedLatest = s.bodyWeight.filter((b) => b.date <= dayKey()).at(-1)?.date === date
        return { bodyWeight, profile: removedLatest && last ? { ...s.profile, weight: last.kg } : s.profile }
      }),

      applyNutritionAdjustment: () => set((s) => {
        const advice = nutritionAdvice(s.profile, s.bodyWeight)
        if (advice.status !== 'suggestion') return {}
        return { profile: { ...s.profile, nutritionAdjustment: {
          kcalOffset: advice.nextOffset!, kcalChange: advice.kcalChange!, appliedAt: dayKey(),
          weeklyRate: advice.trend.weeklyRate!, goal: s.profile.goal,
        } } }
      }),
      resetNutritionAdjustment: () => set((s) => ({ profile: { ...s.profile, nutritionAdjustment: undefined, nutritionReviewAfter: dayKey() } })),

      importData: (data) => set(parseAppData(data)),

      resetAll: () => set({ ...initial }),
    }),
    {
      name: 'bodytrain',
      version: 1,
      storage: createJSONStorage(() => appStorage),
      onRehydrateStorage: () => (_state, error) => {
        hydrationError = error ? 'Дневник не удалось прочитать. Данные сохранены на устройстве; попробуй открыть приложение снова.' : null
        if (typeof window !== 'undefined') window.dispatchEvent(new Event('bodytrain-hydration'))
      },
      partialize: (s): AppData => ({
        exercises: s.exercises,
        workouts: s.workouts,
        activeWorkout: s.activeWorkout,
        foodLog: s.foodLog,
        bodyWeight: s.bodyWeight,
        profile: s.profile,
        settings: s.settings,
      }),
      merge: (persisted, current) => {
        if (!persisted) return current
        return { ...current, ...parseAppData(persisted) }
      },
    },
  ),
)

/** Недавние уникальные продукты — для быстрого добавления. */
export const recentFoods = (log: FoodEntry[], limit = 20): FoodItem[] => {
  const seen = new Set<string>()
  const out: FoodItem[] = []
  for (let i = log.length - 1; i >= 0 && out.length < limit; i--) {
    const f = log[i].food
    const key = `${f.name}|${f.brand ?? ''}|${f.kcal}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(f)
  }
  return out
}
