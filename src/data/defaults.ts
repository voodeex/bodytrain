import type { AppData } from '../lib/types'
import { defaultExercises } from './exercises'

export const initialData: AppData = {
  exercises: defaultExercises,
  workouts: [], activeWorkout: null, foodLog: [], bodyWeight: [],
  profile: { sex: 'male', age: 25, height: 180, weight: 75, activity: 'moderate', goal: 'keep' },
  settings: { restSeconds: 90, aiProvider: 'groq' },
}
