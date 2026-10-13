import type { Workout } from '../lib/types'

const template = (id: string, title: string, ids: string[]): Workout => ({
  id, title, startedAt: 0,
  exercises: ids.map((exerciseId, i) => ({ id: `${id}-${i}`, exerciseId, sets: Array.from({ length: 3 }, (_, j) => ({ id: `${id}-${i}-${j}`, weight: 0, reps: 10, done: false })) })),
})

export const starterWorkouts = [
  template('full-body', 'Всё тело', ['squat', 'bench-press', 'lat-pulldown', 'db-press', 'crunches']),
  template('upper', 'Верх тела', ['bench-press', 'seated-row', 'lateral-raise', 'db-curl', 'triceps-pushdown']),
  template('lower', 'Ноги и ягодицы', ['squat', 'rdl', 'hip-thrust', 'leg-curl', 'calf-raise']),
]
