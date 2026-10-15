export type MuscleGroup = 'chest' | 'back' | 'legs' | 'shoulders' | 'arms' | 'core' | 'cardio' | 'other'

export interface Exercise {
  id: string
  name: string
  muscle: MuscleGroup
  custom?: boolean
  unit?: 'reps' | 'seconds' | 'minutes'
}

export interface WorkoutSet {
  id: string
  weight: number
  reps: number
  done: boolean
}

export interface WorkoutExercise {
  id: string
  exerciseId: string
  sets: WorkoutSet[]
}

export interface Workout {
  id: string
  title: string
  startedAt: number
  finishedAt?: number
  exercises: WorkoutExercise[]
  restEndsAt?: number
  restDuration?: number
}

export type FoodSource = 'local' | 'off' | 'vision' | 'groq' | 'openrouter' | 'cloudflare' | 'gemini' | 'claude' | 'manual'

/** Продукт с КБЖУ на 100 г. */
export interface FoodItem {
  name: string
  brand?: string
  kcal: number
  protein: number
  fat: number
  carbs: number
  source: FoodSource
  barcode?: string
  /** Типичная порция в граммах — подставляется по умолчанию. */
  portion?: number
}

export type Meal = 'breakfast' | 'lunch' | 'dinner' | 'snack'

export interface FoodEntry {
  id: string
  /** YYYY-MM-DD в локальной зоне */
  date: string
  meal: Meal
  food: FoodItem
  grams: number
  createdAt: number
}

export interface Macros {
  kcal: number
  protein: number
  fat: number
  carbs: number
}

export type Sex = 'male' | 'female'
export type Activity = 'sedentary' | 'light' | 'moderate' | 'high' | 'athlete'
export type Goal = 'lose' | 'keep' | 'gain'

export interface Profile {
  sex: Sex
  age: number
  height: number
  weight: number
  activity: Activity
  goal: Goal
  /** Если задано — используются вместо расчёта. */
  manualTargets?: Macros
  /** Поправка к формуле, применённая по тренду веса. */
  nutritionAdjustment?: NutritionAdjustment
  /** Начало наблюдений после смены цели/параметров питания. */
  nutritionReviewAfter?: string
}

export interface NutritionAdjustment {
  kcalOffset: number
  kcalChange: number
  appliedAt: string
  weeklyRate: number
  goal: Goal
}

export interface BodyWeightEntry {
  date: string
  kg: number
}

export type AIProvider = 'groq' | 'openrouter' | 'cloudflare'

export interface Settings {
  restSeconds: number
  aiProvider: AIProvider
}

export interface AppData {
  exercises: Exercise[]
  workouts: Workout[]
  activeWorkout: Workout | null
  foodLog: FoodEntry[]
  bodyWeight: BodyWeightEntry[]
  profile: Profile
  settings: Settings
}
