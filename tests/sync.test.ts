import test from 'node:test'
import assert from 'node:assert/strict'
import { initialData } from '../src/data/defaults'
import { mergeAppData, sameData, stableJson } from '../src/lib/merge'
import type { AppData, FoodEntry, Workout } from '../src/lib/types'

const w = (id: string, startedAt: number, weight = 60): Workout => ({
  id, title: id, startedAt, finishedAt: startedAt + 1000,
  exercises: [{ id: `${id}-e`, exerciseId: 'bench-press', sets: [{ id: `${id}-s`, weight, reps: 10, done: true }] }],
})
const f = (id: string, createdAt: number, grams = 100): FoodEntry => ({
  id, date: '2026-10-13', meal: 'lunch', grams, createdAt,
  food: { name: 'Рис', kcal: 130, protein: 2.7, fat: 0.3, carbs: 28, source: 'local' },
})
const data = (patch: Partial<AppData>): AppData => ({ ...initialData, ...patch })

test('stableJson не зависит от порядка ключей и undefined', () => {
  assert.equal(stableJson({ b: 1, a: { d: 2, c: undefined } }), stableJson({ a: { d: 2 }, b: 1 }))
  assert.ok(!sameData({ a: 1 }, { a: 2 }))
})

test('добавления с двух устройств объединяются', () => {
  const base = data({ workouts: [w('w1', 1)] })
  const local = data({ workouts: [w('w2', 2), w('w1', 1)] })
  const remote = data({ workouts: [w('w3', 3), w('w1', 1)] })
  assert.deepEqual(mergeAppData(base, local, remote).workouts.map((x) => x.id), ['w3', 'w2', 'w1'])
})

test('удаление на одном устройстве не воскрешается другим', () => {
  const base = data({ workouts: [w('w1', 1), w('w2', 2)], foodLog: [f('f1', 1), f('f2', 2)] })
  const local = data({ workouts: [w('w2', 2)], foodLog: [f('f1', 1), f('f2', 2)] })
  const remote = data({ workouts: [w('w1', 1), w('w2', 2)], foodLog: [f('f1', 1)] })
  const m = mergeAppData(base, local, remote)
  assert.deepEqual(m.workouts.map((x) => x.id), ['w2'])
  assert.deepEqual(m.foodLog.map((x) => x.id), ['f1'])
})

test('правка побеждает удаление, правка на этом устройстве побеждает правку на другом', () => {
  const base = data({ foodLog: [f('f1', 1, 100), f('f2', 2, 100)] })
  const local = data({ foodLog: [f('f1', 1, 150)] }) // f1 изменили, f2 удалили
  const remote = data({ foodLog: [f('f1', 1, 200), f('f2', 2, 300)] }) // f1 и f2 изменили
  const m = mergeAppData(base, local, remote)
  assert.deepEqual(m.foodLog.map((x) => [x.id, x.grams]), [['f1', 150], ['f2', 300]])
})

test('без изменений на устройстве берётся версия сервера', () => {
  const base = data({ profile: { ...initialData.profile, weight: 80 } })
  const remote = data({ profile: { ...initialData.profile, weight: 78 } })
  assert.equal(mergeAppData(base, base, remote).profile.weight, 78)
  const local = data({ profile: { ...initialData.profile, weight: 81 } })
  assert.equal(mergeAppData(base, local, remote).profile.weight, 81)
})

test('первая синхронизация гостевых данных: объединение, настройки аккаунта важнее', () => {
  const local = data({ workouts: [w('guest', 5)], profile: { ...initialData.profile, weight: 90 } })
  const remote = data({ workouts: [w('acc', 4)], profile: { ...initialData.profile, weight: 70 } })
  const m = mergeAppData(null, local, remote)
  assert.deepEqual(m.workouts.map((x) => x.id), ['guest', 'acc'])
  assert.equal(m.profile.weight, 70)
  // Пустой аккаунт не затирает настроенный профиль гостя
  assert.equal(mergeAppData(null, local, initialData).profile.weight, 90)
  assert.equal(mergeAppData(null, local, null), local)
})

test('тренировка, завершённая на другом устройстве, убирает активную и сохраняет своё упражнение', () => {
  const custom = { id: 'my-ex', name: 'Моё', muscle: 'other' as const, custom: true, unit: 'reps' as const }
  const active: Workout = { ...w('w9', 9), finishedAt: undefined, exercises: [{ id: 'e', exerciseId: 'my-ex', sets: [] }] }
  const base = data({ activeWorkout: active, exercises: [...initialData.exercises, custom] })
  const remote = data({ activeWorkout: null, workouts: [{ ...active, finishedAt: 10, exercises: [{ id: 'e', exerciseId: 'my-ex', sets: [{ id: 's', weight: 10, reps: 5, done: true }] }] }] })
  const m = mergeAppData(base, base, remote)
  assert.equal(m.activeWorkout, null)
  assert.ok(m.exercises.some((e) => e.id === 'my-ex'))
  assert.equal(m.workouts[0].id, 'w9')
})
