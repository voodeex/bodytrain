import { useMemo, useState } from 'react'
import { TrendingUp } from 'lucide-react'
import { BarChart, LineChart } from '../components/charts'
import { Card, cx, Empty, ScreenHeader, SectionTitle } from '../components/ui'
import { WeightProgress } from '../components/WeightProgress'
import { targetsFor } from '../lib/nutrition'
import { dayKey, e1rm, fmt, macrosFor, parseDayKey, shiftDay, sumMacros } from '../lib/utils'
import { useApp } from '../store/app'

const shortDate = (key: string) => {
  const d = parseDayKey(key)
  return `${d.getDate()}.${String(d.getMonth() + 1).padStart(2, '0')}`
}

export function ProgressScreen() {
  return (
    <div className="pb-8">
      <ScreenHeader title="Прогресс" />
      <WeightProgress />
      <ExerciseProgress />
      <CaloriesWeek />
    </div>
  )
}

function ExerciseProgress() {
  const workouts = useApp((s) => s.workouts)
  const exercises = useApp((s) => s.exercises)
  const [metric, setMetric] = useState<'e1rm' | 'weight' | 'volume' | 'reps'>('e1rm')

  // Упражнения, которые реально делались, — по частоте.
  const done = useMemo(() => {
    const counts = new Map<string, number>()
    for (const w of workouts) for (const we of w.exercises) counts.set(we.exerciseId, (counts.get(we.exerciseId) ?? 0) + 1)
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([id]) => exercises.find((e) => e.id === id))
      .filter((e): e is NonNullable<typeof e> => !!e)
  }, [workouts, exercises])

  const [selected, setSelected] = useState<string | null>(null)
  const exId = selected ?? done[0]?.id
  const timed = done.find((e) => e.id === exId)?.unit
  const isTimed = timed === 'minutes' || timed === 'seconds'
  const effectiveMetric = isTimed ? 'reps' : metric

  const series = useMemo(() => {
    if (!exId) return []
    return [...workouts]
      .reverse()
      .map((w) => {
        const sets = w.exercises.filter((we) => we.exerciseId === exId).flatMap((we) => we.sets)
        if (!sets.length) return null
        const value =
          effectiveMetric === 'reps' ? Math.max(...sets.map((s) => s.reps)) : effectiveMetric === 'e1rm'
            ? Math.max(...sets.map((s) => e1rm(s.weight, s.reps)))
            : effectiveMetric === 'weight'
              ? Math.max(...sets.map((s) => s.weight))
              : sets.reduce((a, s) => a + s.weight * s.reps, 0)
        return { label: shortDate(dayKey(new Date(w.startedAt))), value }
      })
      .filter((p): p is { label: string; value: number } => p !== null)
      .slice(-20)
  }, [workouts, exId, effectiveMetric])

  const best = useMemo(() => {
    if (!exId) return null
    let top: { weight: number; reps: number; e: number } | null = null
    for (const w of workouts)
      for (const we of w.exercises)
        if (we.exerciseId === exId)
          for (const s of we.sets) {
            const e = effectiveMetric === 'reps' ? s.reps : e1rm(s.weight, s.reps)
            if (!top || e > top.e) top = { weight: s.weight, reps: s.reps, e }
          }
    return top
  }, [workouts, exId, effectiveMetric])

  return (
    <>
      <SectionTitle>Упражнения</SectionTitle>
      {done.length === 0 ? (
        <Empty icon={<TrendingUp size={26} />} title="Нет данных" text="После первой тренировки здесь появится график по каждому упражнению." />
      ) : (
        <>
          <div className="flex gap-2 overflow-x-auto no-scrollbar px-5">
            {done.map((e) => (
              <button
                key={e.id}
                onClick={() => setSelected(e.id)}
                className={cx(
                  'shrink-0 h-9 px-3.5 rounded-full text-[14px] font-medium',
                  e.id === exId ? 'bg-accent text-accent-ink' : 'bg-surface text-muted',
                )}
              >
                {e.name}
              </button>
            ))}
          </div>
          <Card className="mx-5 mt-3 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-[13px] text-muted">Лучший подход</div>
                {best && (
                  <div className="tnum text-[22px] font-bold">
                    {isTimed ? `${best.reps} ${timed === 'seconds' ? 'сек' : 'мин'}` : effectiveMetric === 'reps' ? `${best.reps} повторений` : `${fmt(best.weight, 1)} × ${best.reps}`}
                    {!isTimed && effectiveMetric !== 'reps' && best.weight > 0 && <span className="text-[14px] text-muted font-medium"> · 1ПМ ≈ {fmt(best.e, 1)} кг</span>}
                  </div>
                )}
              </div>
            </div>
            {!isTimed && <div className="flex gap-1 mt-3 bg-surface-2 rounded-xl p-1">
              {(
                [
                  ['e1rm', '1ПМ'],
                  ['weight', 'Макс. вес'],
                  ['volume', 'Тоннаж'],
                  ['reps', 'Повторы'],
                ] as const
              ).map(([v, l]) => (
                <button
                  key={v}
                  onClick={() => setMetric(v)}
                  className={cx('flex-1 h-8 rounded-lg text-[13px] font-medium', metric === v ? 'bg-surface text-text' : 'text-muted')}
                >
                  {l}
                </button>
              ))}
            </div>}
            <div className="mt-3">
              <LineChart points={series} unit={isTimed ? timed === 'seconds' ? ' сек' : ' мин' : effectiveMetric === 'reps' ? ' повт' : ' кг'} />
            </div>
          </Card>
        </>
      )}
    </>
  )
}

function CaloriesWeek() {
  const foodLog = useApp((s) => s.foodLog)
  const profile = useApp((s) => s.profile)
  const target = targetsFor(profile)
  const days = useMemo(() => {
    const today = dayKey()
    return Array.from({ length: 7 }, (_, i) => shiftDay(today, i - 6)).map((d) => {
      const m = sumMacros(foodLog.filter((e) => e.date === d).map((e) => macrosFor(e.food, e.grams)))
      return { d, ...m }
    })
  }, [foodLog])
  const tracked = days.filter((d) => d.kcal > 0)
  const avg = tracked.length ? sumMacros(tracked) : null
  const wd = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб']

  return (
    <>
      <SectionTitle>Калории за 7 дней</SectionTitle>
      <Card className="mx-5 p-4">
        {avg ? (
          <div className="tnum flex gap-5 mb-2">
            <div>
              <div className="text-[13px] text-muted">В среднем</div>
              <div className="text-[20px] font-bold">{fmt(avg.kcal / tracked.length)} ккал</div>
            </div>
            <div>
              <div className="text-[13px] text-muted">Белок</div>
              <div className="text-[20px] font-bold text-protein">{fmt(avg.protein / tracked.length)} г</div>
            </div>
          </div>
        ) : (
          <div className="text-[14px] text-muted mb-2">Записей о еде за неделю пока нет</div>
        )}
        <BarChart points={days.map((d) => ({ label: wd[parseDayKey(d.d).getDay()], value: Math.round(d.kcal) }))} target={target.kcal} />
      </Card>
    </>
  )
}
