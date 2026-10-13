import type { AppData, Exercise, Workout } from '../../src/lib/types'

/**
 * Тоннаж для рейтинга. Считается на сервере из синхронизированного дневника,
 * по тем же правилам, что и в приложении (минуты/секунды не входят), но с защитой
 * от явно невозможных чисел: такие подходы в рейтинг не попадают.
 */
export const LIMITS = {
  maxSetWeight: 500,
  maxSetReps: 100,
  maxWorkoutTonnage: 60_000,
  /** Тренировка «из будущего» не учитывается (запас на расхождение часов). */
  futureSkewMs: 10 * 60 * 1000,
}

export interface WorkoutStat {
  workoutId: string
  startedAt: number
  tonnage: number
}

export function leaderboardTonnage(w: Workout, exercises: Exercise[]): number {
  let total = 0
  for (const we of w.exercises) {
    const unit = exercises.find((x) => x.id === we.exerciseId)?.unit
    if (unit === 'seconds' || unit === 'minutes') continue
    for (const s of we.sets) {
      if (!s.done || s.reps <= 0 || s.weight <= 0) continue
      if (s.weight > LIMITS.maxSetWeight || s.reps > LIMITS.maxSetReps) continue
      total += s.weight * s.reps
    }
  }
  return Math.min(Math.round(total * 10) / 10, LIMITS.maxWorkoutTonnage)
}

export function workoutStats(data: AppData, now = Date.now()): WorkoutStat[] {
  return data.workouts
    .filter((w) => w.finishedAt !== undefined && w.startedAt <= now + LIMITS.futureSkewMs)
    .map((w) => ({ workoutId: w.id, startedAt: w.startedAt, tonnage: leaderboardTonnage(w, data.exercises) }))
    .filter((s) => s.tonnage > 0)
}
